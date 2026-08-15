import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Banknote, Smartphone, ShoppingCart, Package, AlertCircle,
  CreditCard, Users, TrendingUp, Search, Calendar, Building2, ArrowRight,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { HealthScoreCard } from "@/components/HealthScoreCard";
import { AiAssistant } from "@/components/AiAssistant";
import { useTheme } from "@/components/ThemeProvider";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useNavigate } from "react-router-dom";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { AIInsightsPanel, type AIInsight } from "@/components/dashboard/AIInsightsPanel";
import { SmartAlertsPanel, type SmartAlert } from "@/components/dashboard/SmartAlertsPanel";
import { QuickActionsMenu } from "@/components/dashboard/QuickActionsMenu";
import { EmptyState } from "@/components/dashboard/EmptyState";

function pct(a: number, b: number): number {
  if (b === 0) return a > 0 ? 100 : 0;
  return Math.round(((a - b) / b) * 100);
}

const startOfDay = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
};

export default function Dashboard() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const { formatAmount } = useCurrency();
  const [search, setSearch] = useState("");

  const ranges = useMemo(() => {
    const todayStart = startOfDay(0).toISOString();
    const todayEnd = (() => { const d = startOfDay(0); d.setHours(23,59,59,999); return d.toISOString(); })();
    const yesterdayStart = startOfDay(-1).toISOString();
    const yesterdayEnd = todayStart;
    const sevenDaysAgo = startOfDay(-6).toISOString();
    return { todayStart, todayEnd, yesterdayStart, yesterdayEnd, sevenDaysAgo };
  }, []);

  const { data: branchLabel } = useQuery({
    queryKey: ["default_branch", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return null;
      const { data } = await supabase
        .from("branches")
        .select("name, is_default")
        .eq("organization_id", currentOrg.id)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as any)?.name ?? null;
    },
    enabled: !!currentOrg,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard_v4", currentOrg?.id, ranges.todayStart],
    queryFn: async () => {
      if (!currentOrg) return null;
      const orgId = currentOrg.id;

      const [
        todaySalesRes, yesterdaySalesRes, last7DaysSalesRes,
        productsRes, pendingCreditRes, todayCustomersRes, recentSaleItemsRes,
      ] = await Promise.all([
        supabase.from("sales")
          .select("total_amount, payment_method, is_credit, customer_name")
          .eq("organization_id", orgId).gte("created_at", ranges.todayStart).lte("created_at", ranges.todayEnd),
        supabase.from("sales")
          .select("total_amount, customer_name")
          .eq("organization_id", orgId).gte("created_at", ranges.yesterdayStart).lt("created_at", ranges.yesterdayEnd),
        supabase.from("sales")
          .select("total_amount, created_at")
          .eq("organization_id", orgId).gte("created_at", ranges.sevenDaysAgo),
        supabase.from("products")
          .select("id, name, stock_quantity, low_stock_threshold, reorder_level, cost_price")
          .eq("organization_id", orgId).eq("is_active", true).limit(2000),
        supabase.from("credit_sales")
          .select("total_amount, amount_paid, customer_name, due_date, is_settled")
          .eq("organization_id", orgId).eq("is_settled", false),
        supabase.from("customers")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId).gte("created_at", ranges.todayStart),
        supabase.from("sale_items")
          .select("product_id, product_name, quantity, unit_price, discount_amount, created_at")
          .eq("organization_id", orgId).gte("created_at", ranges.yesterdayStart),
      ]);

      const today: any[] = todaySalesRes.data || [];
      const yesterday: any[] = yesterdaySalesRes.data || [];
      const last7: any[] = last7DaysSalesRes.data || [];

      const sum = (arr: any[]) => arr.reduce((s, x) => s + Number(x.total_amount || 0), 0);
      const todayTotal = sum(today);
      const yesterdayTotal = sum(yesterday);
      const todayCash = sum(today.filter((x) => x.payment_method === "cash" && !x.is_credit));
      const todayMpesa = sum(today.filter((x) => x.payment_method === "mpesa" && !x.is_credit));
      const todayCredit = sum(today.filter((x) => x.is_credit));

      const todayCustomers = today.length;
      const yesterdayCustomers = yesterday.length;

      // ── Real gross profit from unit cost ────────────────────────────
      const products: any[] = productsRes.data || [];
      const costMap: Record<string, number> = {};
      for (const p of products) costMap[p.id] = Number(p.cost_price || 0);

      const items: any[] = recentSaleItemsRes.data || [];
      const todayItems = items.filter((i) => i.created_at >= ranges.todayStart);
      const yesterdayItems = items.filter((i) => i.created_at < ranges.todayStart);
      const grossProfit = (rows: any[]) =>
        Math.round(rows.reduce((s, i) => {
          const revenue = Number(i.quantity) * Number(i.unit_price) - Number(i.discount_amount || 0);
          const cost = Number(i.quantity) * (costMap[i.product_id] ?? 0);
          return s + (revenue - cost);
        }, 0));
      const todayProfit = grossProfit(todayItems);
      const yesterdayProfit = grossProfit(yesterdayItems);
      const hasCostData = products.some((p) => Number(p.cost_price || 0) > 0);

      // 7-day sparkline & chart
      const byDay: Record<string, { name: string; total: number; ts: number }> = {};
      for (let i = 6; i >= 0; i--) {
        const d = startOfDay(-i);
        const key = d.toISOString().slice(0, 10);
        byDay[key] = { name: d.toLocaleDateString("en-KE", { weekday: "short" }), total: 0, ts: d.getTime() };
      }
      for (const s of last7) {
        const key = new Date(s.created_at).toISOString().slice(0, 10);
        if (byDay[key]) byDay[key].total += Number(s.total_amount || 0);
      }
      const chart = Object.values(byDay).sort((a, b) => a.ts - b.ts);
      const sparkSales = chart.map((c) => c.total);

      // ── Low stock against each product's own threshold ─────────────
      const lowStockAll = products
        .filter((p) => Number(p.stock_quantity) <= Number(p.reorder_level ?? p.low_stock_threshold ?? 0))
        .sort((a, b) => Number(a.stock_quantity) - Number(b.stock_quantity));
      const lowStock = lowStockAll.slice(0, 5);
      const lowStockCount = lowStockAll.length;

      const pendingCredit: any[] = pendingCreditRes.data || [];
      const totalOwed = pendingCredit.reduce((s, x) => s + (Number(x.total_amount) - Number(x.amount_paid)), 0);
      const overdue = pendingCredit.filter((c) => c.due_date && new Date(c.due_date) < new Date());

      const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};
      for (const item of todayItems) {
        if (!productMap[item.product_name]) productMap[item.product_name] = { name: item.product_name, qty: 0, revenue: 0 };
        productMap[item.product_name].qty += Number(item.quantity);
        productMap[item.product_name].revenue += Number(item.quantity) * Number(item.unit_price) - Number(item.discount_amount || 0);
      }
      const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

      const paymentSplit = [
        { name: "Cash", value: todayCash },
        { name: "M-Pesa", value: todayMpesa },
        { name: "Credit", value: todayCredit },
      ].filter((x) => x.value > 0);

      return {
        todayTotal, yesterdayTotal, todayCash, todayMpesa, todayCredit,
        todayTxCount: today.length, todayCustomers, yesterdayCustomers,
        newCustomersToday: todayCustomersRes.count || 0,
        todayProfit, yesterdayProfit, hasCostData,
        lowStockCount, lowStock,
        totalOwed, overdueCount: overdue.length,
        chart, sparkSales, topProducts, paymentSplit,
      };
    },
    enabled: !!currentOrg,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });


  // ── Derived AI insights & alerts (heuristic, from real data) ───────────
  const insights: AIInsight[] = useMemo(() => {
    if (!data) return [];
    const list: AIInsight[] = [];
    const salesDelta = pct(data.todayTotal, data.yesterdayTotal);
    if (data.yesterdayTotal > 0 && salesDelta <= -10) {
      list.push({
        id: "sales-down", type: "warning",
        message: `Sales are down ${Math.abs(salesDelta)}% vs yesterday. Consider a flash promo on your top category.`,
        action: { label: "Run a promotion", path: "/products" },
      });
    }
    if (data.yesterdayTotal > 0 && salesDelta >= 15) {
      list.push({
        id: "sales-up", type: "opportunity",
        message: `Strong day — sales up ${salesDelta}% vs yesterday. Keep momentum by messaging repeat customers.`,
        action: { label: "View customers", path: "/customers" },
      });
    }
    if (data.lowStockCount > 0) {
      const names = data.lowStock.slice(0, 2).map((p: any) => p.name).join(", ");
      list.push({
        id: "low-stock", type: "warning",
        message: `${data.lowStockCount} product${data.lowStockCount === 1 ? "" : "s"} running low${names ? ` (${names})` : ""}. Restock to avoid lost sales.`,
        action: { label: "Create purchase order", path: "/purchases" },
      });
    }
    if (data.overdueCount > 0) {
      list.push({
        id: "overdue", type: "warning",
        message: `${data.overdueCount} customer${data.overdueCount === 1 ? "" : "s"} with overdue balances. Send reminders today.`,
        action: { label: "Review debtors", path: "/debtors" },
      });
    }
    if (data.topProducts.length > 0) {
      const top = data.topProducts[0];
      list.push({
        id: "top-product", type: "info",
        message: `Your best seller today is ${top.name} (${formatAmount(top.revenue)}). Consider bundling it with slow movers.`,
      });
    }
    return list.slice(0, 4);
  }, [data, formatAmount]);

  const alerts: SmartAlert[] = useMemo(() => {
    if (!data) return [];
    const list: SmartAlert[] = [];
    if (data.lowStockCount > 0) {
      list.push({
        id: "a-low", severity: data.lowStockCount > 5 ? "high" : "medium",
        title: "Low stock items", detail: data.lowStock.slice(0, 2).map((p: any) => p.name).join(", "),
        icon: "stock", path: "/products", count: data.lowStockCount,
      });
    }
    if (data.overdueCount > 0) {
      list.push({
        id: "a-overdue", severity: "high",
        title: "Overdue credit customers", detail: `${formatAmount(data.totalOwed)} outstanding`,
        icon: "credit", path: "/debtors", count: data.overdueCount,
      });
    }
    if (data.totalOwed > 0 && data.overdueCount === 0) {
      list.push({
        id: "a-owed", severity: "low",
        title: "Outstanding credit", detail: `${formatAmount(data.totalOwed)} pending collection`,
        icon: "credit", path: "/debtors",
      });
    }
    return list;
  }, [data, formatAmount]);

  const PIE_COLORS = ["hsl(var(--success))", "hsl(var(--primary))", "hsl(var(--warning))"];
  const chartColors = resolvedTheme === "dark"
    ? { grid: "hsl(var(--border))", text: "hsl(var(--muted-foreground))" }
    : { grid: "hsl(var(--border))", text: "hsl(var(--muted-foreground))" };

  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";

  const salesDelta = data ? pct(data.todayTotal, data.yesterdayTotal) : null;
  const profitDelta = data ? pct(data.todayProfit, data.yesterdayProfit) : null;
  const customersDelta = data ? pct(data.todayCustomers, data.yesterdayCustomers) : null;
  const hasAnySales = !!data && data.chart.some((c) => c.total > 0);

  return (
    <AppLayout>
      <div className="space-y-6 max-w-[1400px] mx-auto">
        {/* ── Hero / Command Center header ───────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{greeting},</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight truncate">
                {currentOrg?.name || "Your Business"}
              </h1>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{dateLabel}</span>
                <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />{branchLabel || "All branches"}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative hidden md:block">
                <Search className="h-4 w-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  placeholder="Search products, customers, orders..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 w-72 h-9 bg-muted/40 border-border/60"
                />
              </div>
              <QuickActionsMenu />
            </div>
          </div>
        </section>

        {/* ── KPI grid ───────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          <KpiCard
            label="Today's Sales" value={data ? formatAmount(data.todayTotal) : "—"}
            icon={Banknote} tone="success" delta={salesDelta} sparkline={data?.sparkSales}
            onClick={() => navigate("/daily-summary")}
          />
          <KpiCard
            label="Orders Today" value={data?.todayTxCount ?? 0}
            icon={ShoppingCart} tone="primary" delta={data ? pct(data.todayTxCount, 0) : null}
            deltaLabel="today" onClick={() => navigate("/orders")}
          />
          <KpiCard
            label="Profit Today" value={data ? formatAmount(data.todayProfit) : "—"}
            icon={TrendingUp} tone="success" delta={profitDelta}
            hint={data?.hasCostData ? "Gross profit (sales − cost)" : "Add cost prices for accurate profit"}
          />
          <KpiCard
            label="Customers Served" value={data?.todayCustomers ?? 0}
            icon={Users} tone="primary" delta={customersDelta}
            hint={data ? `${data.newCustomersToday} new today` : undefined}
            onClick={() => navigate("/customers")}
          />
          <KpiCard
            label="Pending Credit" value={data ? formatAmount(data.totalOwed) : "—"}
            icon={CreditCard} tone={data && data.overdueCount > 0 ? "destructive" : "warning"}
            delta={null} hint={data ? `${data.overdueCount} overdue` : undefined}
            onClick={() => navigate("/debtors")}
          />
          <KpiCard
            label="Low Stock" value={data?.lowStockCount ?? 0}
            icon={AlertCircle} tone={data && data.lowStockCount > 0 ? "warning" : "muted"}
            delta={null} hint="Items to restock"
            onClick={() => navigate("/products")}
          />
        </section>

        {/* ── AI Advisor + Sales chart ──────────────────────────────── */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1">
            <AIInsightsPanel insights={insights} loading={isLoading} />
          </div>

          <Card className="lg:col-span-2 border-border/60">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base font-semibold">Sales — Last 7 Days</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Daily revenue trend</p>
              </div>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate("/analytics")}>
                View analytics <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </CardHeader>
            <CardContent>
              {hasAnySales ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data!.chart} barSize={36} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                    <XAxis dataKey="name" stroke={chartColors.text} fontSize={11} axisLine={false} tickLine={false} />
                    <YAxis stroke={chartColors.text} fontSize={11} axisLine={false} tickLine={false}
                      tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : `${v}`} />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                      formatter={(v: any) => formatAmount(v)}
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px", fontSize: "12px",
                      }}
                    />
                    <Bar dataKey="total" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  icon={ShoppingCart}
                  title="No sales yet"
                  message="Start recording sales from the POS to see your revenue trend here."
                  actionLabel="Open POS" actionPath="/pos"
                />
              )}
            </CardContent>
          </Card>
        </section>

        {/* ── Payment mix + Top products + Alerts ───────────────────── */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Payment Mix</CardTitle>
              <p className="text-xs text-muted-foreground">Today's revenue by method</p>
            </CardHeader>
            <CardContent>
              {data?.paymentSplit.length ? (
                <div className="flex items-center gap-4">
                  <PieChart width={120} height={120}>
                    <Pie data={data.paymentSplit} cx={55} cy={55} innerRadius={34} outerRadius={55} dataKey="value" strokeWidth={0}>
                      {data.paymentSplit.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                  <div className="space-y-2 flex-1">
                    {data.paymentSplit.map((item, i) => (
                      <div key={item.name} className="flex items-center gap-2 text-xs">
                        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-muted-foreground flex-1">{item.name}</span>
                        <span className="text-foreground font-medium tabular-nums">{formatAmount(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No sales recorded today yet.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" /> Top Products
              </CardTitle>
              <p className="text-xs text-muted-foreground">Best sellers today</p>
            </CardHeader>
            <CardContent>
              {data?.topProducts.length ? (
                <div className="space-y-2.5">
                  {data.topProducts.map((p, i) => (
                    <div key={p.name} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-[10px] font-bold text-muted-foreground w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-sm text-foreground truncate">{p.name}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-medium tabular-nums">{formatAmount(p.revenue)}</div>
                        <div className="text-[10px] text-muted-foreground">×{p.qty}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No product sales yet today.</p>
              )}
            </CardContent>
          </Card>

          <SmartAlertsPanel alerts={alerts} />
        </section>

        {/* ── Business Health Score ─────────────────────────────────── */}
        <section>
          <HealthScoreCard />
        </section>
      </div>
      <AiAssistant />
    </AppLayout>
  );
}
