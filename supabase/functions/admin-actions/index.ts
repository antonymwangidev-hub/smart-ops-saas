import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the caller
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();
    const { action } = body;

    // Helper: check if caller is platform admin
    const checkPlatformAdmin = async () => {
      const { data: isAdmin } = await adminClient.rpc("is_platform_admin", { _user_id: user.id });
      return !!isAdmin;
    };

    // Helper: check if caller is org admin
    const checkOrgAdmin = async (orgId: string) => {
      const { data: isOrgAdmin } = await adminClient.rpc("has_org_role", {
        _user_id: user.id,
        _org_id: orgId,
        _role: "admin",
      });
      return !!isOrgAdmin;
    };

    // ====== PLATFORM ADMIN ACTIONS ======

    if (action === "toggle_org_active") {
      if (!(await checkPlatformAdmin())) {
        return new Response(JSON.stringify({ error: "Forbidden: not a platform admin" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { org_id, is_active } = body;
      if (!org_id || typeof is_active !== "boolean") {
        return new Response(JSON.stringify({ error: "org_id and is_active required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await adminClient.from("organizations").update({ is_active }).eq("id", org_id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reset_user_password") {
      if (!(await checkPlatformAdmin())) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { user_id } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(user_id);
      if (userError || !userData?.user?.email) {
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Send a password-recovery email via Supabase Auth instead of returning a temp
      // password in the response body (avoids leaking secrets to dev tools / proxy logs).
      const { error: linkError } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email: userData.user.email,
      });
      if (linkError) throw linkError;

      // Audit trail
      await adminClient.from("activity_logs").insert({
        organization_id: null,
        user_id: user.id,
        action: "password_reset_email_sent",
        metadata: {
          target_user_id: user_id,
          target_email: userData.user.email,
          triggered_by_email: user.email,
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          email: userData.user.email,
          message: "A password reset email has been sent to the user.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }


    if (action === "list_users") {
      if (!(await checkPlatformAdmin())) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data, error } = await adminClient.auth.admin.listUsers({ perPage: 500 });
      if (error) throw error;
      const users = data.users.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
      }));
      return new Response(JSON.stringify({ users }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete_user") {
      if (!(await checkPlatformAdmin())) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { user_id } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (user_id === user.id) {
        return new Response(JSON.stringify({ error: "Cannot delete your own account" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await adminClient.from("organization_members").delete().eq("user_id", user_id);
      await adminClient.from("profiles").delete().eq("user_id", user_id);
      const { error: delError } = await adminClient.auth.admin.deleteUser(user_id);
      if (delError) throw delError;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "remove_user_from_org") {
      if (!(await checkPlatformAdmin())) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { user_id: targetUserId, org_id } = body;
      if (!targetUserId || !org_id) {
        return new Response(JSON.stringify({ error: "user_id and org_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: prevMember } = await adminClient
        .from("organization_members")
        .select("role")
        .eq("user_id", targetUserId)
        .eq("organization_id", org_id)
        .maybeSingle();
      const { error: rmError } = await adminClient
        .from("organization_members")
        .delete()
        .eq("user_id", targetUserId)
        .eq("organization_id", org_id);
      if (rmError) throw rmError;
      const { data: targetData } = await adminClient.auth.admin.getUserById(targetUserId);
      await adminClient.from("activity_logs").insert({
        organization_id: org_id,
        user_id: user.id,
        action: "role_removed",
        metadata: {
          target_user_id: targetUserId,
          target_email: targetData?.user?.email ?? null,
          previous_role: prevMember?.role ?? null,
          changed_by_email: user.email,
          source: "platform_admin",
        },
      });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Platform admin: add a user as owner to an org
    if (action === "add_owner_to_org") {
      if (!(await checkPlatformAdmin())) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { email, org_id } = body;
      if (!email || !org_id) {
        return new Response(JSON.stringify({ error: "email and org_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Fast lookup via SECURITY DEFINER RPC (O(1) instead of paginated listUsers)
      const { data: found } = await adminClient.rpc("find_user_by_email", { _email: email });
      const targetUser = Array.isArray(found) && found.length > 0 ? found[0] : null;
      if (!targetUser) {

        return new Response(JSON.stringify({ error: "No account found with that email. They must sign up first." }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Check if already a member
      const { data: existing } = await adminClient
        .from("organization_members")
        .select("id")
        .eq("user_id", targetUser.id)
        .eq("organization_id", org_id)
        .maybeSingle();
      if (existing) {
        // Update role to admin
        await adminClient
          .from("organization_members")
          .update({ role: "admin" })
          .eq("id", existing.id);
        await adminClient.from("activity_logs").insert({
          organization_id: org_id,
          user_id: user.id,
          action: "role_updated",
          metadata: {
            target_user_id: targetUser.id,
            target_email: targetUser.email,
            new_role: "admin",
            previous_role: existing ? "member" : null,
            changed_by_email: user.email,
            source: "platform_admin",
          },
        });
        return new Response(JSON.stringify({ success: true, message: "User role updated to owner" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: insertError } = await adminClient
        .from("organization_members")
        .insert({ user_id: targetUser.id, organization_id: org_id, role: "admin" });
      if (insertError) throw insertError;
      await adminClient.from("activity_logs").insert({
        organization_id: org_id,
        user_id: user.id,
        action: "role_added",
        metadata: {
          target_user_id: targetUser.id,
          target_email: targetUser.email,
          new_role: "admin",
          changed_by_email: user.email,
          source: "platform_admin",
        },
      });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ====== ORG ADMIN (OWNER) ACTIONS ======

    // Owner: add staff/attendant to their org
    if (action === "add_staff_to_org") {
      const { email, org_id, role } = body;
      if (!email || !org_id || !role) {
        return new Response(JSON.stringify({ error: "email, org_id, and role required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Verify caller is org admin
      if (!(await checkOrgAdmin(org_id))) {
        return new Response(JSON.stringify({ error: "Forbidden: you must be the business owner" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Fast lookup via SECURITY DEFINER RPC (O(1) instead of paginated listUsers)
      const { data: found } = await adminClient.rpc("find_user_by_email", { _email: email });
      const targetUser = Array.isArray(found) && found.length > 0 ? found[0] : null;
      if (!targetUser) {

        return new Response(JSON.stringify({ error: "No account found with that email. They must sign up first." }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Check existing membership
      const { data: existing } = await adminClient
        .from("organization_members")
        .select("id")
        .eq("user_id", targetUser.id)
        .eq("organization_id", org_id)
        .maybeSingle();
      if (existing) {
        await adminClient
          .from("organization_members")
          .update({ role })
          .eq("id", existing.id);
        await adminClient.from("activity_logs").insert({
          organization_id: org_id,
          user_id: user.id,
          action: "role_updated",
          metadata: {
            target_user_id: targetUser.id,
            target_email: targetUser.email,
            new_role: role,
            changed_by_email: user.email,
            source: "org_owner",
          },
        });
        return new Response(JSON.stringify({ success: true, message: "Member role updated" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: insertError } = await adminClient
        .from("organization_members")
        .insert({ user_id: targetUser.id, organization_id: org_id, role });
      if (insertError) throw insertError;
      await adminClient.from("activity_logs").insert({
        organization_id: org_id,
        user_id: user.id,
        action: "role_added",
        metadata: {
          target_user_id: targetUser.id,
          target_email: targetUser.email,
          new_role: role,
          changed_by_email: user.email,
          source: "org_owner",
        },
      });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ====== STAFF INVITATIONS ======

    const checkOrgManagerOrAdmin = async (orgId: string) => {
      const [{ data: a }, { data: m }] = await Promise.all([
        adminClient.rpc("has_org_role", { _user_id: user.id, _org_id: orgId, _role: "admin" }),
        adminClient.rpc("has_org_role", { _user_id: user.id, _org_id: orgId, _role: "manager" }),
      ]);
      return !!a || !!m;
    };

    const randomToken = () => {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    };

    const sha256Hex = async (input: string) => {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
    };

    const buildInviteLink = (token: string) => {
      const origin = body.app_origin || req.headers.get("origin") || "";
      return `${origin}/invite/${token}`;
    };

    if (action === "invite_staff") {
      const { org_id, email, full_name, phone, role, branch_id } = body;
      if (!org_id || !email || !role) {
        return new Response(JSON.stringify({ error: "org_id, email and role required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!(await checkOrgManagerOrAdmin(org_id))) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Revoke previous pending invites for same email
      await adminClient.from("staff_invitations")
        .update({ status: "revoked" })
        .eq("organization_id", org_id)
        .ilike("email", email)
        .eq("status", "pending");

      const token = randomToken();
      const token_hash = await sha256Hex(token);
      const { data: inv, error: invErr } = await adminClient.from("staff_invitations").insert({
        organization_id: org_id,
        email: email.trim().toLowerCase(),
        full_name: full_name || null,
        phone: phone || null,
        role,
        branch_id: branch_id || null,
        token_hash,
        invited_by: user.id,
      }).select().single();
      if (invErr) throw invErr;

      const link = buildInviteLink(token);
      return new Response(JSON.stringify({ success: true, invitation: inv, invite_link: link }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "resend_invitation") {
      const { invitation_id } = body;
      if (!invitation_id) {
        return new Response(JSON.stringify({ error: "invitation_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: existing } = await adminClient.from("staff_invitations")
        .select("*").eq("id", invitation_id).maybeSingle();
      if (!existing) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!(await checkOrgManagerOrAdmin(existing.organization_id))) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const token = randomToken();
      const { data: updated, error: updErr } = await adminClient.from("staff_invitations")
        .update({
          token,
          status: "pending",
          invitation_sent_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
        })
        .eq("id", invitation_id).select().single();
      if (updErr) throw updErr;
      return new Response(JSON.stringify({ success: true, invitation: updated, invite_link: buildInviteLink(token) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "revoke_invitation") {
      const { invitation_id } = body;
      const { data: existing } = await adminClient.from("staff_invitations")
        .select("organization_id").eq("id", invitation_id).maybeSingle();
      if (!existing || !(await checkOrgManagerOrAdmin(existing.organization_id))) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await adminClient.from("staff_invitations").update({ status: "revoked" }).eq("id", invitation_id);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_member_status") {
      const { org_id, member_id, status } = body;
      if (!["active", "suspended"].includes(status)) {
        return new Response(JSON.stringify({ error: "Invalid status" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!(await checkOrgManagerOrAdmin(org_id))) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await adminClient.from("organization_members")
        .update({ status }).eq("id", member_id).eq("organization_id", org_id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_member_branch") {
      const { org_id, member_id, branch_id } = body;
      if (!(await checkOrgManagerOrAdmin(org_id))) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await adminClient.from("organization_members")
        .update({ branch_id: branch_id || null }).eq("id", member_id).eq("organization_id", org_id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("admin-actions error:", err);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

});
