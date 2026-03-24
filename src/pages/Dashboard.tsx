import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, ShoppingCart, DollarSign, TrendingUp } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { HealthScoreCard } from "@/components/HealthScoreCard";
import { AiAssistant } from "@/components/AiAssistant";
import { useTheme } from "@/components/ThemeProvider";
import { useCurrency } from "@/contexts/CurrencyContext";

interface Stats {
  customers: number;
  orders: number;
  revenue: number;
  pendingOrders: number;
}

function AnimatedCounter({ value, prefix = "" }: { value: number | string; prefix?: string }) {
  const [display, setDisplay] = useState(0);
  const numValue = typeof value === "string" ? parseFloat(value.replace(/[^0-9.-]/g, "")) : value;

  useEffect(() => {
    const duration = 800;
    const start = Date.now();
    const startVal = 0;
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(startVal + (numValue - startVal) * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };
    tick();
  }, [numValue]);

  return <>{prefix}{display.toLocaleString()}</>;
}

export default function Dashboard() {
  const { currentOrg } = useOrg();
  const { resolvedTheme } = useTheme();
  const { formatAmount } = useCurrency();
  const [stats, setStats] = useState<Stats>({ customers: 0, orders: 0, revenue: 0, pendingOrders: 0 });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!currentOrg) return;
    const orgId = currentOrg.id;

    const fetchStats = async () => {
      const [custRes, orderRes] = await Promise.all([
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
        supabase.from("orders").select("*").eq("organization_id", orgId),
      ]);

      const orders = orderRes.data || [];
      const revenue = orders.filter(o => o.status === "completed").reduce((sum, o) => sum + Number(o.amount), 0);
      const pending = orders.filter(o => o.status === "pending").length;

      setStats({ customers: custRes.count || 0, orders: orders.length, revenue, pendingOrders: pending });
      setRecentOrders(orders.slice(-7).map((o, i) => ({ name: `Order ${i + 1}`, amount: Number(o.amount) })));
      setLoaded(true);
    };

    fetchStats();
  }, [currentOrg]);

  const statCards = [
    { title: "Total Customers", value: stats.customers, icon: Users, color: "text-primary", bg: "from-primary/10 to-primary/5" },
    { title: "Total Orders", value: stats.orders, icon: ShoppingCart, color: "text-secondary", bg: "from-secondary/10 to-secondary/5" },
    { title: "Revenue", value: stats.revenue, format: true, icon: DollarSign, color: "text-success", bg: "from-success/10 to-success/5" },
    { title: "Pending Orders", value: stats.pendingOrders, icon: TrendingUp, color: "text-warning", bg: "from-warning/10 to-warning/5" },
  ];

  const chartColors = resolvedTheme === "dark"
    ? { grid: "#1F2937", text: "#9CA3AF", bar: "hsl(239, 84%, 67%)" }
    : { grid: "#E5E7EB", text: "#6B7280", bar: "hsl(239, 84%, 67%)" };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back to {currentOrg?.name}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat, idx) => (
            <Card
              key={stat.title}
              className={`glass glass-hover overflow-hidden`}
              style={{ animationDelay: `${idx * 80}ms` }}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                <div className={`h-8 w-8 rounded-xl bg-gradient-to-br ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">
                  {loaded ? <AnimatedCounter value={stat.value} prefix={stat.prefix || ""} /> : "—"}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <HealthScoreCard />
        </div>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-lg">Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            {recentOrders.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={recentOrders}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                  <XAxis dataKey="name" stroke={chartColors.text} fontSize={12} />
                  <YAxis stroke={chartColors.text} fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: resolvedTheme === "dark" ? "#111827" : "#fff",
                      border: `1px solid ${resolvedTheme === "dark" ? "#1F2937" : "#E5E7EB"}`,
                      borderRadius: "12px",
                      color: resolvedTheme === "dark" ? "#E5E7EB" : "#111",
                    }}
                  />
                  <Bar dataKey="amount" fill={chartColors.bar} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-center py-8">No orders yet. Create your first order to see data here.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <AiAssistant />
    </AppLayout>
  );
}
