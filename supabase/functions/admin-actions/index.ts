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
      const tempPassword = crypto.randomUUID().slice(0, 12) + "Aa1!";
      const { error: updateError } = await adminClient.auth.admin.updateUserById(user_id, { password: tempPassword });
      if (updateError) throw updateError;
      return new Response(
        JSON.stringify({ success: true, temp_password: tempPassword, email: userData.user.email }),
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
      // Find user by email
      const { data: usersData } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      const targetUser = usersData?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
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
      // Find user by email
      const { data: usersData } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      const targetUser = usersData?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
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

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
