import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

// Public endpoint (no JWT) — the Nexus WhatsApp Gateway posts events here.
// Real events are signed with HMAC-SHA256; the one-off webhook.test ping is
// intentionally unsigned and must be answered with 200.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-gateway-signature",
};

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function verifySignature(rawBody: string, header: string | null, secret: string) {
  if (!header) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const expected = `sha256=${hex}`;
  const enc = new TextEncoder();
  return timingSafeEqual(enc.encode(header.trim()), enc.encode(expected));
}

const normalize = (p: string) => (p || "").replace(/[^\d]/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  // Read the RAW body first — required for signature verification.
  const rawBody = await req.text();

  let event: any = null;
  try {
    event = JSON.parse(rawBody);
  } catch (_e) {
    return new Response(JSON.stringify({ success: false }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Connectivity test ping is unsigned by design.
  if (event?.event === "webhook.test") {
    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const orgId = new URL(req.url).searchParams.get("org");
  const query = admin.from("whatsapp_settings").select("organization_id, webhook_secret");
  const { data: rows } = orgId ? await query.eq("organization_id", orgId) : await query;
  const candidates = (rows || []).filter((r: any) => !!r.webhook_secret);

  let matchedOrg: string | null = null;
  for (const row of candidates) {
    if (await verifySignature(rawBody, req.headers.get("X-Gateway-Signature"), row.webhook_secret)) {
      matchedOrg = row.organization_id;
      break;
    }
  }
  if (!matchedOrg) {
    return new Response(JSON.stringify({ success: false }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Signature verified — respond 200 regardless of downstream processing.
  try {
    if (event.event === "message.inbound") {
      const phone: string = event.from || "";
      const digits = normalize(phone);
      let customerId: string | null = null;
      if (digits) {
        const { data: customers } = await admin
          .from("customers")
          .select("id, phone")
          .eq("organization_id", matchedOrg)
          .not("phone", "is", null)
          .limit(2000);
        const hit = (customers || []).find((c: any) => {
          const d = normalize(c.phone);
          return d && (d === digits || d.endsWith(digits.slice(-9)) || digits.endsWith(d.slice(-9)));
        });
        customerId = hit?.id ?? null;
      }
      await admin.from("whatsapp_messages").insert({
        organization_id: matchedOrg,
        customer_id: customerId,
        direction: "inbound",
        channel: event.channel === "sms" ? "sms" : "whatsapp",
        phone,
        body: event.type === "text" ? (event.body ?? null) : (event.body ?? `[${event.type || "media"}]`),
        provider_message_id: event.providerMessageId ?? null,
        status: "received",
        matched: !!customerId,
        created_at: event.receivedAt || new Date().toISOString(),
      });
    } else if (event.event === "message.status") {
      const status = String(event.status || "").toLowerCase();
      let updated = false;
      if (event.messageId) {
        const { data } = await admin
          .from("whatsapp_messages")
          .update({ status, provider_message_id: event.providerMessageId ?? null })
          .eq("organization_id", matchedOrg)
          .eq("gateway_message_id", event.messageId)
          .select("id");
        updated = !!data?.length;
      }
      if (!updated && event.providerMessageId) {
        await admin
          .from("whatsapp_messages")
          .update({ status })
          .eq("organization_id", matchedOrg)
          .eq("provider_message_id", event.providerMessageId);
      }
    }
  } catch (e) {
    console.error("whatsapp-webhook processing error", e instanceof Error ? e.message : e);
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
