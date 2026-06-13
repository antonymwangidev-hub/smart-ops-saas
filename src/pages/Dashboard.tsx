import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Banknote, Smartphone, ShoppingCart, TrendingUp, TrendingDown,
  Package, AlertTriangle, CreditCard, ArrowRight,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { HealthScoreCard } from "@/components/HealthScoreCard";
import { AIRecommendationCard } from "@/components/AIRecommendationCard";
import { AiAssistant } from "@/components/AiAssistant";
import { useTheme } from "@/components/ThemeProvider";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useAIRecommendations } from "@/hooks/useAIRecommendations";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

function AnimatedCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const duration = 700;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value]);
  return <>{display.toLocaleString()}</>;
}

function pct(a: number, b: number): number {
  if (b === 0) return a > 0 ? 100 : 0;
  return Math.round(((a - b) / b) * 100);
}

export default function Dashboard() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const { formatAmount } = useCurrency();
  const { recommendation, loading: aiLoading, dismiss } = useAIRecommendations();

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);
  const todayEnd = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }, []);

  // This week Mon–Sun
  const weekStart = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);
  // Last week
  const lastWeekStart = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }, [weekStart]);
  const lastWeekEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setMilliseconds(-1);
    return d.toISOString();
  }, [weekStart]);

  // ── Main dashboard query ──────────────────────────────────────────────
  const { data, isSuccess } = useQuery({
    queryKey: ["dashboard_v2", currentOrg?.id, todayStart],
    queryFn: async () => {
      if (!currentOrg) return null;
      const orgId = currentOrg.id;

      const [
        todaySalesRes,
        thisWeekSalesRes,
        lastWeekSalesRes,
        lowStockRes,
        pendingCreditRes,
        last7DaysSalesRes,
        todaySaleItemsRes,
      ] = await Promise.all([
        // Today's POS sales
        (supabase as any)
          .from("sales")
          .select("total_amount, payment_method, is_credit")
          .eq("organization_id", orgId)
          .gte("created_at", todayStart)
          .lte("created_at", todayEnd),

        // This week's sales totals
        (supabase as any)
          .from("sales")
          .select("total_amount")
          .eq("organization_id", orgId)
          .gte("created_at", weekStart),

        // Last week's sales totals for comparison
        (supabase as any)
          .from("sales")
          .select("total_amount")
          .eq("organization_id", orgId)
          .gte("created_at", lastWeekStart)
          .lte("created_at", lastWeekEnd),

        // Low stock products count
        (supabase as any)
          .from("products")
          .select("id, name, stock_quantity, low_stock_threshold", { count: "exact" })
          .eq("organization_id", orgId)
          .eq("is_active", true)
          .lte("stock_quantity", 10)
          .limit(5),

        // Pending credit (deni) amount
        (supabase as any)
          .from("credit_sales")
          .select("total_amount, amount_paid")
          .eq("organization_id", orgId)
          .neq("status", "paid"),

        // Last 7 days daily totals for sparkline
        (supabase as any)
          .from("sales")
          .select("total_amount, created_at")
          .eq("organization_id", orgId)
          .gte("created_at", (() => { const d = new Date(); d.setDate(d.getDate() - 6); d.setHours(0,0,0,0); return d.toISOString(); })()),

        // Today's sale items for top products
        (supabase as any)
          .from("sale_items")
          .select("product_name, quantity, unit_price")
          .eq("organization_id", orgId)
          .gte("created_at", todayStart)
          .lte("created_at", todayEnd),
      ]);

      // ── Process today's data ──────────────────────────────────────────
      const todaySales: any[] = todaySalesRes.data || [];
      const todayTotal = todaySales.reduce((s, x) => s + Number(x.total_amount), 0);
      const todayCash = todaySales
        .filter((x) => x.payment_method === "cash" && !x.is_credit)
        .reduce((s, x) => s + Number(x.total_amount), 0);
      const todayMpesa = todaySales
        .filter((x) => x.payment_method === "mpesa" && !x.is_credit)
        .reduce((s, x) => s + Number(x.total_amount), 0);
      const todayCredit = todaySales
        .filter((x) => x.is_credit)
        .reduce((s, x) => s + Number(x.total_amount), 0);

      // ── Week comparison ───────────────────────────────────────────────
      const thisWeekTotal = (thisWeekSalesRes.data || []).reduce(
        (s: number, x: any) => s + Number(x.total_amount), 0
      );
      const lastWeekTotal = (lastWeekSalesRes.data || []).reduce(
        (s: number, x: any) => s + Number(x.total_amount), 0
      );
      const weekChange = pct(thisWeekTotal, lastWeekTotal);

      // ── Low stock ────────────────────────────────────────────────────
      const lowStockItems: any[] = lowStockRes.data || [];
      const lowStockCount = lowStockRes.count || 0;

      // ── Pending credit ────────────────────────────────────────────────
      const pendingCredit: any[] = pendingCreditRes.data || [];
      const totalOwed = pendingCredit.reduce(
        (s, x) => s + (Number(x.total_amount) - Number(x.amount_paid)), 0
      );

      // ── Last 7 days chart data ─────────────────────────────────────────
      const salesByDay: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toLocaleDateString("en-KE", { weekday: "short" });
        salesByDay[key] = 0;
      }
      for (const sale of (last7DaysSalesRes.data || []) as any[]) {
        const key = new Date(sale.created_at).toLocaleDateString("en-KE", { weekday: "short" });
        if (key in salesByDay) salesByDay[key] += Number(sale.total_amount);
      }
      const chartData = Object.entries(salesByDay).map(([name, total]) => ({ name, total }));

      // ── Top 5 products today ──────────────────────────────────────────
      const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};
      for (const item of (todaySaleItemsRes.data || []) as any[]) {
        if (!productMap[item.product_name]) {
          productMap[item.product_name] = { name: item.product_name, qty: 0, revenue: 0 };
        }
        productMap[item.product_name].qty += Number(item.quantity);
        productMap[item.product_name].revenue += Number(item.quantity) * Number(item.unit_price);
      }
      const topProducts = Object.values(productMap)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      // Payment method split for pie chart
      const paymentSplit = [
        { name: "Cash", value: todayCash },
        { name: "M-Pesa", value: todayMpesa },
        { name: "Credit", value: todayCredit },
      ].filter((x) => x.value > 0);

      return {
        todayTotal,
        todayCash,
        todayMpesa,
        todayCredit,
        todayTxCount: todaySales.length,
        thisWeekTotal,
        lastWeekTotal,
        weekChange,
        lowStockCount,
        lowStockItems,
        totalOwed,
        chartData,
        topProducts,
        paymentSplit,
      };
    },
    enabled: !!currentOrg,
    refetchInterval: 60_000, // refresh every minute
  });

  const PIE_COLORS = ["#22c55e", "#3b82f6", "#f59e0b"];

  const chartColors =
    resolvedTheme === "dark"
      ? { grid: "#1F2937", text: "#9CA3AF", bar: "hsl(239, 84%, 67%)" }
      : { grid: "#E5E7EB", text: "#6B7280", bar: "hsl(239, 84%, 67%)" };

  const todayStr = new Date().toLocaleDateString("en-KE", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {currentOrg?.name || "Dashboard"}
            </h1>
            <p className="text-muted-foreground text-sm">{todayStr}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/pos")}>
            Open POS <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>

        {/* ── Today hero ── */}
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground mb-1">Total Sales Today</p>
            <p className="text-4xl font-bold text-foreground">
              {isSuccess ? formatAmount(data?.todayTotal || 0) : "—"}
            </p>
            <div className="flex items-center gap-1 mt-1">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {data?.todayTxCount ?? 0} transactions
              </span>
            </div>
          </CardContent>
        </Card>

        {/* ── Payment split ── */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Banknote className="h-4 w-4 text-success" />
                <span className="text-xs text-muted-foreground">Cash</span>
              </div>
              <p className="text-lg font-bold text-foreground">
                {isSuccess ? formatAmount(data?.todayCash || 0) : "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Smartphone className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">M-Pesa</span>
              </div>
              <p className="text-lg font-bold text-foreground">
                {isSuccess ? formatAmount(data?.todayMpesa || 0) : "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <CreditCard className="h-4 w-4 text-warning" />
                <span className="text-xs text-muted-foreground">Deni</span>
              </div>
              <p className="text-lg font-bold text-foreground">
                {isSuccess ? formatAmount(data?.todayCredit || 0) : "—"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── Week comparison + Pie ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">This Week vs Last Week</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-foreground">
                {isSuccess ? formatAmount(data?.thisWeekTotal || 0) : "—"}
              </p>
              {isSuccess && data && (
                <div className="flex items-center gap-1 mt-1">
                  {data.weekChange >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-success" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-destructive" />
                  )}
                  <span
                    className={`text-sm font-medium ${
                      data.weekChange >= 0 ? "text-success" : "text-destructive"
                    }`}
                  >
                    {data.weekChange >= 0 ? "+" : ""}{data.weekChange}%
                  </span>
                  <span className="text-xs text-muted-foreground">
                    vs last week ({formatAmount(data.lastWeekTotal)})
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment pie chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Today's Payment Mix</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              {data?.paymentSplit && data.paymentSplit.length > 0 ? (
                <div className="flex items-center gap-4">
                  <PieChart width={100} height={100}>
                    <Pie
                      data={data.paymentSplit}
                      cx={45}
                      cy={45}
                      innerRadius={28}
                      outerRadius={45}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {data.paymentSplit.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                  <div className="space-y-1.5">
                    {data.paymentSplit.map((item, i) => (
                      <div key={item.name} className="flex items-center gap-2">
                        <div
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span className="text-xs text-muted-foreground">
                          {item.name}: {formatAmount(item.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">No sales today yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── 7-day sparkline ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sales – Last 7 Days</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.chartData && data.chartData.some((d) => d.total > 0) ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.chartData} barSize={32}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                  <XAxis dataKey="name" stroke={chartColors.text} fontSize={12} />
                  <YAxis stroke={chartColors.text} fontSize={12} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v: any) => formatAmount(v)}
                    contentStyle={{
                      backgroundColor: resolvedTheme === "dark" ? "#111827" : "#fff",
                      border: `1px solid ${resolvedTheme === "dark" ? "#1F2937" : "#E5E7EB"}`,
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="total" fill={chartColors.bar} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-center py-8 text-sm">
                No sales data yet — start making sales from the POS
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Top products today + Alerts ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Top 5 products today */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" /> Top Products Today
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data?.topProducts && data.topProducts.length > 0 ? (
                <div className="space-y-2">
                  {data.topProducts.map((p, i) => (
                    <div key={p.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold text-muted-foreground w-5">
                          #{i + 1}
                        </span>
                        <span className="text-sm text-foreground truncate">{p.name}</span>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <div className="text-sm font-medium">{formatAmount(p.revenue)}</div>
                        <div className="text-xs text-muted-foreground">×{p.qty}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No sales recorded today yet
                </p>
              )}
            </CardContent>
          </Card>

          {/* Alerts */}
          <div className="space-y-3">
            {/* Low stock alert */}
            <Card
              className={`cursor-pointer hover:border-warning/50 transition-colors ${
                (data?.lowStockCount || 0) > 0 ? "border-warning/30 bg-warning/5" : ""
              }`}
              onClick={() => navigate("/products")}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-warning/10 flex items-center justify-center">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Low Stock Items</p>
                    {data?.lowStockItems && data.lowStockItems.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {data.lowStockItems.slice(0, 2).map((p: any) => p.name).join(", ")}
                        {data.lowStockCount > 2 ? ` +${data.lowStockCount - 2} more` : ""}
                      </p>
                    )}
                  </div>
                </div>
                <Badge
                  variant={
                    (data?.lowStockCount || 0) > 0 ? "destructive" : "secondary"
                  }
                  className="shrink-0"
                >
                  {data?.lowStockCount ?? 0}
                </Badge>
              </CardContent>
            </Card>

            {/* Pending debts */}
            <Card
              className={`cursor-pointer hover:border-destructive/50 transition-colors ${
                (data?.totalOwed || 0) > 0 ? "border-destructive/30 bg-destructive/5" : ""
              }`}
              onClick={() => navigate("/debtors")}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <CreditCard className="h-4 w-4 text-destructive" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Pending Deni (Credit)</p>
                    <p className="text-xs text-muted-foreground">Outstanding from customers</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-destructive shrink-0">
                  {isSuccess ? formatAmount(data?.totalOwed || 0) : "—"}
                </span>
              </CardContent>
            </Card>

            {/* AI card */}
            <AIRecommendationCard
              recommendation={recommendation}
              loading={aiLoading}
              onAccept={() => {}}
              onDismiss={dismiss}
            />
          </div>
        </div>

        <HealthScoreCard />
      </div>
      <AiAssistant />
    </AppLayout>
  );
}
