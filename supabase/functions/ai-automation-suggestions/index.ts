import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const { orgId } = await req.json();
    if (!orgId) throw new Error("Missing orgId");

    const { data: membership } = await supabase
      .from("organization_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("organization_id", orgId)
      .single();
    if (!membership) throw new Error("Not a member of this organization");

    // Fetch business context
    const [custRes, orderRes, taskRes, rulesRes] = await Promise.all([
      supabase.from("customers").select("id, name, created_at").eq("organization_id", orgId),
      supabase.from("orders").select("id, amount, status, created_at, customer_id").eq("organization_id", orgId),
      supabase.from("tasks").select("id, title, status, priority").eq("organization_id", orgId),
      supabase.from("automation_rules").select("name, trigger, action, is_active").eq("organization_id", orgId),
    ]);

    const customers = custRes.data || [];
    const orders = orderRes.data || [];
    const tasks = taskRes.data || [];
    const existingRules = rulesRes.data || [];

    const completedOrders = orders.filter((o: any) => o.status === "completed");
    const pendingOrders = orders.filter((o: any) => o.status === "pending");
    const totalRevenue = completedOrders.reduce((s: number, o: any) => s + Number(o.amount), 0);
    const todoTasks = tasks.filter((t: any) => t.status === "todo");

    const context = `
Business snapshot:
- ${customers.length} customers, ${orders.length} orders ($${totalRevenue.toLocaleString()} revenue)
- ${pendingOrders.length} pending orders, ${completedOrders.length} completed
- ${todoTasks.length} todo tasks, ${tasks.length} total tasks
- ${existingRules.length} existing automation rules: ${existingRules.map((r: any) => `"${r.name}" (${r.trigger} → ${r.action?.type})`).join("; ") || "none"}

Available triggers: customer_created, order_created, order_completed, order_cancelled, task_created, task_completed, document_uploaded, payment_received, payment_failed
Available actions: create_task, send_notification, log_event, update_order_status, assign_task, generate_report, tag_customer
`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a business automation expert. Suggest 3-5 useful automation rules based on the business data. Only suggest rules that don't already exist. Be specific and actionable.`,
          },
          {
            role: "user",
            content: `Based on this business data, suggest automation rules:\n${context}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_automations",
              description: "Return automation rule suggestions",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Human-readable rule name" },
                        trigger: { type: "string", enum: ["customer_created", "order_created", "order_completed", "order_cancelled", "task_created", "task_completed", "document_uploaded", "payment_received", "payment_failed"] },
                        actionType: { type: "string", enum: ["create_task", "send_notification", "log_event", "update_order_status", "assign_task", "generate_report", "tag_customer"] },
                        actionValue: { type: "string", description: "Action parameter value" },
                        reason: { type: "string", description: "Brief explanation why this is useful" },
                      },
                      required: ["name", "trigger", "actionType", "actionValue", "reason"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["suggestions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_automations" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const result = await aiResponse.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No suggestions returned");

    const suggestions = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(suggestions), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-automation-suggestions error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
