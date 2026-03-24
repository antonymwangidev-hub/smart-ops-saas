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

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [custRes, orderRes, taskRes, activityRes] = await Promise.all([
      supabase.from("customers").select("id, created_at").eq("organization_id", orgId),
      supabase.from("orders").select("id, amount, status, created_at").eq("organization_id", orgId),
      supabase.from("tasks").select("id, status").eq("organization_id", orgId),
      supabase.from("activity_logs").select("id, created_at").eq("organization_id", orgId).gte("created_at", monthAgo.toISOString()),
    ]);

    const customers = custRes.data || [];
    const orders = orderRes.data || [];
    const tasks = taskRes.data || [];
    const activities = activityRes.data || [];

    let score = 50; // baseline
    const factors: string[] = [];

    // 1. Customer growth (0-20 points)
    const newCustomersThisWeek = customers.filter(c => new Date(c.created_at) >= weekAgo).length;
    const newCustomersPrevWeek = customers.filter(c => {
      const d = new Date(c.created_at);
      return d >= twoWeeksAgo && d < weekAgo;
    }).length;

    if (newCustomersThisWeek > 0) {
      score += Math.min(newCustomersThisWeek * 3, 15);
      factors.push(`+${newCustomersThisWeek} new customers this week`);
    }
    if (newCustomersThisWeek > newCustomersPrevWeek) {
      score += 5;
      factors.push("Customer growth trending up");
    } else if (newCustomersThisWeek === 0 && customers.length > 0) {
      score -= 10;
      factors.push("No new customers this week");
    }

    // 2. Order frequency (0-25 points)
    const ordersThisWeek = orders.filter(o => new Date(o.created_at) >= weekAgo).length;
    const ordersPrevWeek = orders.filter(o => {
      const d = new Date(o.created_at);
      return d >= twoWeeksAgo && d < weekAgo;
    }).length;

    if (ordersThisWeek > 0) {
      score += Math.min(ordersThisWeek * 2, 15);
      factors.push(`${ordersThisWeek} orders this week`);
    }
    if (ordersThisWeek > ordersPrevWeek) {
      score += 5;
      factors.push("Order volume increasing");
    } else if (ordersThisWeek === 0 && orders.length > 0) {
      score -= 15;
      factors.push("No orders this week — action needed");
    }

    // 3. Revenue (0-20 points)
    const revenueThisWeek = orders
      .filter(o => new Date(o.created_at) >= weekAgo && o.status === "completed")
      .reduce((s, o) => s + Number(o.amount), 0);
    const revenuePrevWeek = orders
      .filter(o => { const d = new Date(o.created_at); return d >= twoWeeksAgo && d < weekAgo && o.status === "completed"; })
      .reduce((s, o) => s + Number(o.amount), 0);
    const revenueThisMonth = orders
      .filter(o => new Date(o.created_at) >= monthAgo && o.status === "completed")
      .reduce((s, o) => s + Number(o.amount), 0);

    let revenueChangePercent = 0;
    if (revenuePrevWeek > 0) {
      revenueChangePercent = Math.round(((revenueThisWeek - revenuePrevWeek) / revenuePrevWeek) * 100);
    }

    if (revenueThisWeek > revenuePrevWeek && revenueThisWeek > 0) {
      score += 10;
      factors.push(`Revenue up ${revenueChangePercent}% this week`);
    } else if (revenueThisWeek < revenuePrevWeek && revenuePrevWeek > 0) {
      score -= 5;
      factors.push(`Revenue down ${Math.abs(revenueChangePercent)}% from last week`);
    }

    // 4. Pending orders ratio
    const pending = orders.filter(o => o.status === "pending").length;
    if (pending > 5) {
      score -= Math.min(pending, 10);
      factors.push(`${pending} pending orders need attention`);
    }

    // 5. Task completion
    const doneTasks = tasks.filter(t => t.status === "done").length;
    const totalTasks = tasks.length;
    const completionRate = totalTasks > 0 ? doneTasks / totalTasks : 0;
    if (totalTasks > 0) {
      if (completionRate > 0.7) {
        score += 5;
        factors.push(`${Math.round(completionRate * 100)}% task completion rate`);
      } else if (completionRate < 0.3) {
        score -= 5;
        factors.push("Many tasks incomplete");
      }
    }

    // 6. Customer retention (inactivity check)
    const activeCustomerIds = new Set(
      orders.filter(o => new Date(o.created_at) >= monthAgo).map(o => o.customer_id).filter(Boolean)
    );
    const inactiveCustomers = customers.length > 0
      ? customers.filter(c => !activeCustomerIds.has(c.id)).length
      : 0;
    const inactiveRate = customers.length > 0 ? inactiveCustomers / customers.length : 0;
    if (inactiveRate > 0.7 && customers.length >= 5) {
      score -= 10;
      factors.push(`${inactiveCustomers} customers haven't ordered in 30 days`);
    } else if (inactiveRate < 0.3 && customers.length >= 5) {
      score += 5;
      factors.push("Strong customer retention");
    }

    // 7. Activity level
    if (activities.length > 20) {
      score += 5;
      factors.push("High activity level this month");
    } else if (activities.length < 5) {
      score -= 5;
      factors.push("Low activity — stay engaged");
    }

    // Clamp
    score = Math.max(0, Math.min(100, score));

    // Determine trend
    const trend = revenueChangePercent > 0 || newCustomersThisWeek > newCustomersPrevWeek
      ? "improving"
      : revenueChangePercent < 0 || (newCustomersThisWeek === 0 && customers.length > 0)
        ? "declining"
        : "stable";

    let status: string;
    let summary: string;
    if (score >= 70) {
      status = "Excellent";
      summary = revenueChangePercent > 0
        ? `Your revenue increased by ${revenueChangePercent}% this week. Business is thriving!`
        : "Your business is performing strongly across all metrics.";
    } else if (score >= 40) {
      status = "Needs Attention";
      summary = revenueChangePercent < 0
        ? `Revenue declined ${Math.abs(revenueChangePercent)}% this week. Focus on customer engagement.`
        : "Some areas need improvement. Focus on customer acquisition and order completion.";
    } else {
      status = "Critical";
      summary = "Your business metrics need immediate attention. Consider reaching out to customers.";
    }

    return new Response(JSON.stringify({ score, status, summary, factors, trend, revenueChangePercent, completionRate: Math.round(completionRate * 100) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("business-health error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
