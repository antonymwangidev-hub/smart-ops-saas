const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { title, description, organization_id } = await req.json();
    if (!title || !organization_id) {
      return new Response(JSON.stringify({ error: "title and organization_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get org context: existing tasks, members
    const [tasksRes, membersRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("title, status, priority, category, assigned_to, estimated_hours")
        .eq("organization_id", organization_id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("organization_members")
        .select("user_id, role")
        .eq("organization_id", organization_id),
    ]);

    const existingTasks = tasksRes.data || [];
    const members = membersRes.data || [];

    // Get member profiles
    const memberIds = members.map((m: any) => m.user_id);
    const profilesRes = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", memberIds);
    const profiles = profilesRes.data || [];

    const memberInfo = members.map((m: any) => {
      const profile = profiles.find((p: any) => p.user_id === m.user_id);
      const assignedCount = existingTasks.filter((t: any) => t.assigned_to === m.user_id && t.status !== "done").length;
      return {
        user_id: m.user_id,
        name: profile?.display_name || "Unknown",
        role: m.role,
        active_tasks: assignedCount,
      };
    });

    const prompt = `You are a task management AI assistant. Analyze this new task and provide recommendations.

Task Title: "${title}"
${description ? `Task Description: "${description}"` : ""}

Team Members (with current active task count):
${memberInfo.map((m: any) => `- ${m.name} (${m.role}, ${m.active_tasks} active tasks)`).join("\n")}

Recent tasks in this organization:
${existingTasks.slice(0, 10).map((t: any) => `- "${t.title}" [${t.priority || "medium"}] [${t.category || "uncategorized"}]`).join("\n")}

Respond with a JSON object (no markdown, just raw JSON):
{
  "priority": "high" | "medium" | "low",
  "priority_reason": "brief explanation",
  "suggested_assignee_id": "user_id of best team member or null",
  "assignee_reason": "brief explanation",
  "estimated_hours": number (0.5 to 40),
  "category": "string - suggested category/tag",
  "confidence": number (0.0 to 1.0)
}`;

    const aiResponse = await fetch("https://api.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a task analysis AI. Always respond with valid JSON only, no markdown." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI API error:", errText);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from response (handle potential markdown wrapping)
    let recommendations;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      recommendations = JSON.parse(jsonMatch?.[0] || content);
    } catch {
      console.error("Failed to parse AI response:", content);
      recommendations = {
        priority: "medium",
        priority_reason: "Could not analyze task",
        suggested_assignee_id: null,
        assignee_reason: "No suggestion available",
        estimated_hours: 2,
        category: "general",
        confidence: 0.3,
      };
    }

    // Enrich with member name
    if (recommendations.suggested_assignee_id) {
      const assignee = memberInfo.find((m: any) => m.user_id === recommendations.suggested_assignee_id);
      recommendations.suggested_assignee_name = assignee?.name || "Unknown";
    }

    return new Response(JSON.stringify(recommendations), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
