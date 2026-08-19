import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const E164 = /^\+[1-9]\d{7,14}$/;

interface Settings {
  base_url: string;
  api_key: string;
  webhook_secret: string | null;
}

/** Calls the Nexus WhatsApp Gateway. Never exposes the API key to the caller. */
async function gw(
  s: Settings,
  path: string,
  init: { method?: string; body?: unknown } = {},
) {
  const base = s.base_url.replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: init.method || "GET",
      headers: { "x-api-key": s.api_key, "Content-Type": "application/json" },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch (_e) {
    return { ok: false, status: 0, error: "Could not reach the gateway — check the Base URL and your connection.", data: null as any };
  }
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (_e) {
    parsed = null;
  }
  if (!res.ok) {
    const msg = parsed?.error || parsed?.message ||
      (res.status === 401 ? "Invalid API key." : `Gateway returned ${res.status}.`);
    return { ok: false, status: res.status, error: String(msg), data: parsed };
  }
  return { ok: true, status: res.status, error: null as string | null, data: parsed?.data ?? parsed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const { action, organization_id: orgId } = body || {};
    if (!action || !orgId) return json({ error: "action and organization_id are required" }, 400);

    // Membership check
    const { data: member } = await admin
      .from("organization_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!member) return json({ error: "Forbidden" }, 403);

    const isOrgAdmin = async () => {
      const { data } = await admin.rpc("has_org_role", {
        _user_id: user.id, _org_id: orgId, _role: "admin",
      });
      return !!data;
    };

    const loadSettings = async () => {
      const { data } = await admin
        .from("whatsapp_settings")
        .select("*")
        .eq("organization_id", orgId)
        .maybeSingle();
      return data as (Settings & Record<string, any>) | null;
    };

    const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook?org=${orgId}`;

    // ── Connect / re-connect ────────────────────────────────────────────
    if (action === "connect") {
      if (!(await isOrgAdmin())) return json({ error: "Only business owners can configure WhatsApp." }, 403);
      const baseUrlRaw = String(body.base_url || "").trim();
      const apiKey = String(body.api_key || "").trim();
      if (!baseUrlRaw || !apiKey) return json({ error: "Base URL and API Key are required." }, 422);
      let baseUrl: string;
      try {
        const u = new URL(baseUrlRaw);
        if (u.protocol !== "https:") return json({ error: "Base URL must start with https://" }, 422);
        baseUrl = u.origin;
      } catch (_e) {
        return json({ error: "Base URL is not a valid URL." }, 422);
      }

      const s: Settings = { base_url: baseUrl, api_key: apiKey, webhook_secret: null };

      const settingsRes = await gw(s, "/api/v1/settings");
      if (!settingsRes.ok) {
        return json({ error: `Connection failed — check your Base URL and API Key. (${settingsRes.error})` }, 400);
      }
      const businessName = settingsRes.data?.businessName || settingsRes.data?.name || null;
      const waConnected = !!settingsRes.data?.whatsapp?.connected;

      // Webhook registration.
      // Gateway API: GET /api/v1/webhooks lists endpoints,
      // POST /api/v1/webhooks/register creates one (returns { id, secret }),
      // DELETE /api/v1/webhooks/{id} removes one.
      let receiving = false;
      let webhookError: string | null = null;
      let webhookSecret: string | null = null;
      let endpointId: string | null = null;

      // Remove any stale registration of *our* webhook first so the secret we
      // store always matches the live endpoint.
      const list = await gw(s, "/api/v1/webhooks");
      const endpoints: any[] = Array.isArray(list.data?.endpoints)
        ? list.data.endpoints
        : (Array.isArray(list.data) ? list.data : []);
      for (const ep of endpoints) {
        if (typeof ep?.url === "string" && ep.url.startsWith(webhookUrl.split("?")[0]) && ep.id) {
          await gw(s, `/api/v1/webhooks/${ep.id}`, { method: "DELETE" });
        }
      }

      const reg = await gw(s, "/api/v1/webhooks/register", { method: "POST", body: { url: webhookUrl, label: "SmartOps" } });
      if (reg.ok) {
        webhookSecret = reg.data?.secret || reg.data?.webhookSecret || null;
        endpointId = reg.data?.id || null;
        receiving = !!webhookSecret;
        if (!webhookSecret) {
          webhookError = "Receiving was registered but the gateway did not return a signing secret. Sending still works.";
        }
      } else {
        webhookError = `Could not enable receiving: ${reg.error}. Sending still works.`;
      }

      // Templates
      const tpl = await gw(s, "/api/v1/templates");
      const templates = Array.isArray(tpl.data) ? tpl.data : (tpl.data?.templates ?? []);

      const existing = await loadSettings();
      const payload: Record<string, any> = {
        organization_id: orgId,
        base_url: baseUrl,
        api_key: apiKey,
        webhook_url: receiving ? webhookUrl : existing?.webhook_url ?? null,
        webhook_endpoint_id: endpointId ?? existing?.webhook_endpoint_id ?? null,
        business_name: businessName,
        whatsapp_connected: waConnected,
        receiving_active: receiving,
        templates,
        last_error: webhookError,
        created_by: user.id,
      };
      if (webhookSecret) payload.webhook_secret = webhookSecret;

      const { error: upErr } = await admin
        .from("whatsapp_settings")
        .upsert(payload, { onConflict: "organization_id" });
      if (upErr) {
        console.error("whatsapp_settings upsert failed", upErr.message);
        return json({ error: "Could not save the gateway settings." }, 500);
      }

      return json({
        success: true,
        data: {
          business_name: businessName,
          whatsapp_connected: waConnected,
          receiving_active: payload.receiving_active,
          templates,
          webhook_warning: webhookError,
        },
      });
    }

    // ── Refresh templates + receiving status ─────────────────────────────
    if (action === "refresh") {
      if (!(await isOrgAdmin())) return json({ error: "Only business owners can do this." }, 403);
      const s = await loadSettings();
      if (!s) return json({ error: "WhatsApp is not configured yet." }, 400);
      const tpl = await gw(s, "/api/v1/templates");
      const templates = Array.isArray(tpl.data) ? tpl.data : (tpl.data?.templates ?? []);

      const list = await gw(s, "/api/v1/webhooks");
      const endpoints: any[] = Array.isArray(list.data?.endpoints)
        ? list.data.endpoints
        : (Array.isArray(list.data) ? list.data : []);
      const prefix = webhookUrl.split("?")[0];
      const mine = endpoints.find((ep: any) => typeof ep?.url === "string" && ep.url.startsWith(prefix));
      const registeredUrl = mine?.url ?? null;

      // Re-register automatically if our endpoint is gone or we lost the secret.
      let receiving = !!mine && mine.isActive !== false && !!s.webhook_secret;
      const update: Record<string, any> = {};
      if (!receiving) {
        if (mine?.id && !s.webhook_secret) {
          await gw(s, `/api/v1/webhooks/${mine.id}`, { method: "DELETE" });
        }
        const reg = await gw(s, "/api/v1/webhooks/register", { method: "POST", body: { url: webhookUrl, label: "SmartOps" } });
        const secret = reg.ok ? (reg.data?.secret || reg.data?.webhookSecret || null) : null;
        if (secret) {
          update.webhook_secret = secret;
          update.webhook_endpoint_id = reg.data?.id ?? null;
          update.webhook_url = webhookUrl;
          receiving = true;
        }
      }

      const settingsRes = await gw(s, "/api/v1/settings");
      await admin.from("whatsapp_settings").update({
        ...update,
        templates,
        receiving_active: receiving,
        whatsapp_connected: !!settingsRes.data?.whatsapp?.connected,
        business_name: settingsRes.data?.businessName ?? settingsRes.data?.name ?? s.business_name,
        last_error: receiving ? null : "Receiving is not active — the gateway rejected the webhook registration.",
      }).eq("organization_id", orgId);
      return json({ success: true, data: { templates, receiving_active: receiving, registered_url: receiving ? webhookUrl : registeredUrl } });
    }



    // ── Disconnect ──────────────────────────────────────────────────────
    if (action === "disconnect") {
      if (!(await isOrgAdmin())) return json({ error: "Only business owners can do this." }, 403);
      const s = await loadSettings();
      if (s) {
        await gw(s, "/api/v1/webhooks/register", { method: "DELETE" });
        await admin.from("whatsapp_settings").delete().eq("organization_id", orgId);
      }
      return json({ success: true });
    }

    // ── Sync a contact's consent ────────────────────────────────────────
    if (action === "sync_contact") {
      const s = await loadSettings();
      if (!s) return json({ error: "WhatsApp is not configured yet." }, 400);
      const phone = String(body.phone || "").trim();
      if (!E164.test(phone)) return json({ error: "Phone must be in E.164 format, e.g. +254712345678." }, 422);
      const optIn = body.opt_in === true;
      const source = String(body.opt_in_source || "").trim();
      if (optIn && !source) return json({ error: "Record how consent was obtained." }, 422);
      const res = await gw(s, "/api/v1/contacts", {
        method: "POST",
        body: {
          phone,
          displayName: String(body.display_name || "").slice(0, 120),
          optIn,
          optInSource: source || "opt-out",
        },
      });
      if (!res.ok) return json({ error: res.error }, res.status === 0 ? 502 : res.status);
      return json({ success: true, data: res.data });
    }

    // ── Send a message ──────────────────────────────────────────────────
    if (action === "send") {
      const s = await loadSettings();
      if (!s) return json({ error: "WhatsApp is not configured yet." }, 400);
      const phone = String(body.phone || "").trim();
      if (!E164.test(phone)) return json({ error: "Phone must be in E.164 format, e.g. +254712345678." }, 422);
      const channel = body.channel === "sms" ? "sms" : "whatsapp";
      const customerId: string | null = body.customer_id || null;

      if (customerId) {
        const { data: cust } = await admin
          .from("customers")
          .select("id, whatsapp_opt_in, organization_id")
          .eq("id", customerId)
          .eq("organization_id", orgId)
          .maybeSingle();
        if (!cust) return json({ error: "Customer not found." }, 404);
        if (!cust.whatsapp_opt_in) {
          return json({ error: "This contact has not opted in to receive messages." }, 403);
        }
      }

      const payload: Record<string, unknown> = { to: phone, channel };
      const isTemplate = !!body.template_name;
      if (isTemplate) {
        payload.templateName = String(body.template_name);
        payload.languageCode = String(body.language_code || "en_US");
        payload.variables = Array.isArray(body.variables) ? body.variables.map((v: unknown) => String(v ?? "")) : [];
      } else {
        const text = String(body.body || "").trim();
        if (!text) return json({ error: "Message text is required." }, 422);
        if (text.length > 4000) return json({ error: "Message is too long (max 4000 characters)." }, 422);
        payload.body = text;
      }

      const res = await gw(s, "/api/v1/messages/send", { method: "POST", body: payload });

      if (!res.ok) {
        await admin.from("whatsapp_messages").insert({
          organization_id: orgId,
          customer_id: customerId,
          direction: "outbound",
          channel,
          phone,
          body: isTemplate ? null : String(body.body || ""),
          template_name: isTemplate ? String(body.template_name) : null,
          variables: isTemplate ? (payload.variables as unknown[]) : null,
          status: "failed",
          error: res.error,
          sent_by: user.id,
        });
        const reason = res.status === 403
          ? (/opt/i.test(res.error || "") ? "opt_in" : "window_closed")
          : "other";
        return json({ error: res.error, reason }, res.status === 0 ? 502 : res.status);
      }

      const { data: inserted } = await admin.from("whatsapp_messages").insert({
        organization_id: orgId,
        customer_id: customerId,
        direction: "outbound",
        channel,
        phone,
        body: isTemplate ? null : String(body.body || ""),
        template_name: isTemplate ? String(body.template_name) : null,
        variables: isTemplate ? (payload.variables as unknown[]) : null,
        gateway_message_id: res.data?.messageId ?? null,
        status: res.data?.status || "QUEUED",
        sent_by: user.id,
      }).select("id").maybeSingle();

      return json({ success: true, data: { id: inserted?.id, messageId: res.data?.messageId, status: res.data?.status || "QUEUED" } });
    }

    // ── Link an unmatched inbound message to a customer ──────────────────
    if (action === "link_message") {
      const messageId = String(body.message_id || "");
      const customerId = String(body.customer_id || "");
      if (!messageId || !customerId) return json({ error: "message_id and customer_id are required." }, 422);
      const { data: cust } = await admin
        .from("customers").select("id").eq("id", customerId).eq("organization_id", orgId).maybeSingle();
      if (!cust) return json({ error: "Customer not found." }, 404);
      const { error } = await admin
        .from("whatsapp_messages")
        .update({ customer_id: customerId, matched: true })
        .eq("id", messageId)
        .eq("organization_id", orgId);
      if (error) return json({ error: "Could not link the message." }, 500);
      return json({ success: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("whatsapp-gateway error", e instanceof Error ? e.message : e);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
