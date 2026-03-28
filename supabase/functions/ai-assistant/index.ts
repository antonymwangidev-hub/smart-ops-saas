import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
// @ts-ignore — pdf-parse works in Deno via npm: specifier
import pdfParse from "npm:pdf-parse@1.1.1";

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

    const { messages, orgId } = await req.json();
    if (!orgId) throw new Error("Missing orgId");

    // Verify membership
    const { data: membership } = await supabase
      .from("organization_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("organization_id", orgId)
      .single();
    if (!membership) throw new Error("Not a member of this organization");

    const userMessage = messages[messages.length - 1]?.content?.toLowerCase() || "";

    // Fetch business data in parallel
    const [custRes, orderRes, taskRes, activityRes, docsRes] = await Promise.all([
      supabase.from("customers").select("*").eq("organization_id", orgId),
      supabase.from("orders").select("*, customers(name)").eq("organization_id", orgId),
      supabase.from("tasks").select("*").eq("organization_id", orgId),
      supabase.from("activity_logs").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(50),
      supabase.from("file_attachments").select("*").eq("organization_id", orgId).eq("entity_type", "business_document").order("created_at", { ascending: false }),
    ]);

    const customers = custRes.data || [];
    const orders = orderRes.data || [];
    const tasks = taskRes.data || [];
    const activities = activityRes.data || [];
    const documents = docsRes.data || [];

    // Extract text from PDF documents (up to 5 most recent, max 2000 chars each)
    const pdfDocs = documents.filter((d: any) => 
      d.file_name?.toLowerCase().endsWith('.pdf')
    ).slice(0, 5);

    const docContents: { name: string; text: string }[] = [];
    for (const doc of pdfDocs) {
      try {
        const res = await fetch(doc.file_url);
        if (!res.ok) continue;
        const buffer = await res.arrayBuffer();
        const parsed = await pdfParse(Buffer.from(buffer));
        const text = (parsed.text || "").trim().slice(0, 2000);
        if (text) {
          docContents.push({ name: doc.file_name, text });
        }
      } catch (e) {
        console.error(`PDF extraction failed for ${doc.file_name}:`, e);
      }
    }

    // Build context summary for AI
    const completedOrders = orders.filter((o: any) => o.status === "completed");
    const pendingOrders = orders.filter((o: any) => o.status === "pending");
    const totalRevenue = completedOrders.reduce((s: number, o: any) => s + Number(o.amount), 0);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const ordersThisWeek = orders.filter((o: any) => new Date(o.created_at) >= weekAgo);
    const customersThisWeek = customers.filter((c: any) => new Date(c.created_at) >= weekAgo);

    // Top customers by order count/amount
    const customerOrderMap: Record<string, { name: string; count: number; total: number }> = {};
    for (const o of orders) {
      const cid = o.customer_id || "unknown";
      const cname = (o as any).customers?.name || "Unknown";
      if (!customerOrderMap[cid]) customerOrderMap[cid] = { name: cname, count: 0, total: 0 };
      customerOrderMap[cid].count++;
      customerOrderMap[cid].total += Number(o.amount);
    }
    const topCustomers = Object.values(customerOrderMap).sort((a, b) => b.total - a.total).slice(0, 5);

    // Customers without recent orders
    const customerLastOrder: Record<string, Date> = {};
    for (const o of orders) {
      if (o.customer_id) {
        const d = new Date(o.created_at);
        if (!customerLastOrder[o.customer_id] || d > customerLastOrder[o.customer_id]) {
          customerLastOrder[o.customer_id] = d;
        }
      }
    }
    const inactiveCustomers = customers.filter((c: any) => {
      const last = customerLastOrder[c.id];
      return !last || last < weekAgo;
    });

    const todoTasks = tasks.filter((t: any) => t.status === "todo");
    const inProgressTasks = tasks.filter((t: any) => t.status === "in_progress");
    const doneTasks = tasks.filter((t: any) => t.status === "done");

    const documentContentSection = docContents.length > 0
      ? `\n\nExtracted Document Contents:\n${docContents.map(d => `--- ${d.name} ---\n${d.text}`).join("\n\n")}`
      : "";

    const businessContext = `
Business Data Summary for this organization:
- Total customers: ${customers.length} (${customersThisWeek.length} new this week)
- Total orders: ${orders.length} (${ordersThisWeek.length} this week)
- Completed orders: ${completedOrders.length}, Pending: ${pendingOrders.length}
- Total revenue (completed): $${totalRevenue.toLocaleString()}
- Revenue this week: $${ordersThisWeek.filter((o: any) => o.status === "completed").reduce((s: number, o: any) => s + Number(o.amount), 0).toLocaleString()}
- Top customers by spend: ${topCustomers.map(c => `${c.name} ($${c.total.toLocaleString()}, ${c.count} orders)`).join("; ") || "None yet"}
- Inactive customers (no orders in 7 days): ${inactiveCustomers.length} — ${inactiveCustomers.slice(0, 5).map((c: any) => c.name).join(", ") || "None"}
- Tasks: ${todoTasks.length} todo, ${inProgressTasks.length} in progress, ${doneTasks.length} done
- Recent activity: ${activities.length} events logged
- Business documents uploaded: ${documents.length} — ${documents.slice(0, 10).map((d: any) => d.file_name).join(", ") || "None"}
${documentContentSection}
`;

    // Use Lovable AI
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
            content: `You are SmartOps AI, a business intelligence assistant. You help users understand their business data and make decisions. Answer concisely and actionably. Use the following real-time business data to answer questions:\n${businessContext}\n\nRules:\n- Be specific with numbers\n- Suggest actions when appropriate\n- Format currency values nicely\n- Keep responses under 200 words\n- Use markdown for formatting`,
          },
          ...messages,
        ],
        stream: true,
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
      const t = await aiResponse.text();
      console.error("AI error:", aiResponse.status, t);
      throw new Error("AI gateway error");
    }

    return new Response(aiResponse.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
