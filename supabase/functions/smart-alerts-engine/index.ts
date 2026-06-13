/**
 * Smart Alerts Engine — Supabase Edge Function
 *
 * Deploy: supabase functions deploy smart-alerts-engine
 *
 * This function is called by a Supabase Database Webhook (pg_net) OR
 * a scheduled pg_cron job.  It processes all active automation rules for
 * an organisation and executes the appropriate actions.
 *
 * Supported trigger types:
 *   stock_low         — product.stock_quantity <= low_stock_threshold
 *   credit_overdue    — credit_sale unpaid for > N days
 *   daily_summary     — fires once per day (called by cron)
 *
 * Supported action types:
 *   send_notification — inserts a row into the notifications table
 *   create_task       — inserts a task row
 *   log_event         — inserts into activity_logs
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const { organization_id, trigger_type } = body;

    // Fetch all active rules for this org (or all orgs if called as cron)
    const rulesQuery = supabase
      .from("automation_rules")
      .select("*")
      .eq("is_active", true);

    if (organization_id) rulesQuery.eq("organization_id", organization_id);

    const { data: rules, error: rulesErr } = await rulesQuery;
    if (rulesErr) throw rulesErr;

    const processed: { rule_id: string; status: string; message?: string }[] = [];

    for (const rule of rules || []) {
      const ruleTrigger = rule.trigger || "";

      // ── STOCK_LOW ──────────────────────────────────────────────────
      if (ruleTrigger === "stock_low" && (!trigger_type || trigger_type === "stock_low")) {
        const { data: products } = await supabase
          .from("products")
          .select("id, name, stock_quantity, low_stock_threshold, category")
          .eq("organization_id", rule.organization_id)
          .eq("is_active", true)
          .filter("stock_quantity", "lte", "low_stock_threshold");

        for (const product of products || []) {
          if (product.stock_quantity <= product.low_stock_threshold) {
            await executeAction(supabase, rule, {
              message: `Low stock: ${product.name} — only ${product.stock_quantity} left`,
              product_id: product.id,
            });
          }
        }
        processed.push({ rule_id: rule.id, status: "processed" });
      }

      // ── CREDIT_OVERDUE ─────────────────────────────────────────────
      if (ruleTrigger === "credit_overdue" && (!trigger_type || trigger_type === "credit_overdue")) {
        const thresholdDays = parseInt(rule.action?.threshold_days) || 30;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - thresholdDays);

        const { data: overdues } = await supabase
          .from("credit_sales")
          .select("id, customer_name, total_amount, amount_paid, created_at")
          .eq("organization_id", rule.organization_id)
          .neq("status", "paid")
          .lte("created_at", cutoff.toISOString());

        for (const credit of overdues || []) {
          const outstanding = Number(credit.total_amount) - Number(credit.amount_paid);
          await executeAction(supabase, rule, {
            message: `Overdue deni: ${credit.customer_name} owes KES ${outstanding.toFixed(2)} (${thresholdDays}+ days)`,
            credit_sale_id: credit.id,
          });
        }
        processed.push({ rule_id: rule.id, status: "processed" });
      }

      // ── DAILY_SUMMARY ──────────────────────────────────────────────
      if (ruleTrigger === "daily_summary" && (!trigger_type || trigger_type === "daily_summary")) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const { data: sales } = await supabase
          .from("sales")
          .select("total_amount, payment_method")
          .eq("organization_id", rule.organization_id)
          .gte("created_at", today.toISOString());

        const total = (sales || []).reduce((s: number, x: any) => s + Number(x.total_amount), 0);
        const txCount = (sales || []).length;

        await executeAction(supabase, rule, {
          message: `Daily summary: KES ${total.toFixed(0)} from ${txCount} transaction(s)`,
        });
        processed.push({ rule_id: rule.id, status: "processed" });
      }
    }

    return new Response(JSON.stringify({ success: true, processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function executeAction(
  supabase: any,
  rule: any,
  context: { message: string; [key: string]: any }
) {
  const actionType = rule.action?.type || "send_notification";

  switch (actionType) {
    case "send_notification":
      await supabase.from("notifications").insert({
        organization_id: rule.organization_id,
        title: rule.name,
        message: context.message,
        type: "automation",
        metadata: { rule_id: rule.id, ...context },
      });
      break;

    case "create_task":
      await supabase.from("tasks").insert({
        organization_id: rule.organization_id,
        title: `[Auto] ${rule.name}`,
        description: context.message,
        status: "pending",
        priority: "medium",
        metadata: { rule_id: rule.id, auto_generated: true },
      });
      break;

    case "log_event":
      await supabase.from("activity_logs").insert({
        organization_id: rule.organization_id,
        action: "automation_triggered",
        metadata: {
          rule_id: rule.id,
          rule_name: rule.name,
          message: context.message,
          ...context,
        },
      });
      break;

    default:
      // Unknown action — log it
      await supabase.from("activity_logs").insert({
        organization_id: rule.organization_id,
        action: "automation_unknown_action",
        metadata: { rule_id: rule.id, action_type: actionType, context },
      });
  }
}
