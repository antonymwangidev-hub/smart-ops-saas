import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, ShoppingCart, DollarSign, TrendingUp } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { HealthScoreCard } from "@/components/HealthScoreCard";
import { AiAssistant } from "@/components/AiAssistant";

interface Stats {
  customers: number;
  orders: number;
  revenue: number;
  pendingOrders: number;
}

export default function Dashboard() {
  const { currentOrg } = useOrg();
  const [stats, setStats] = useState<Stats>({ customers: 0, orders: 0, revenue: 0, pendingOrders: 0 });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);

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

      setStats({
        customers: custRes.count || 0,
        orders: orders.length,
        revenue,
        pendingOrders: pending,
      });

      setRecentOrders(orders.slice(-7).map((o, i) => ({
        name: `Order ${i + 1}`,
        amount: Number(o.amount),
      })));
    };

    fetchStats();
  }, [currentOrg]);

  const statCards = [
    { title: "Total Customers", value: stats.customers, icon: Users, color: "text-primary" },
    { title: "Total Orders", value: stats.orders, icon: ShoppingCart, color: "text-secondary" },
    { title: "Revenue", value: `$${stats.revenue.toLocaleString()}`, icon: DollarSign, color: "text-success" },
    { title: "Pending Orders", value: stats.pendingOrders, icon: TrendingUp, color: "text-warning" },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back to {currentOrg?.name}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Health Score */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <HealthScoreCard />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            {recentOrders.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={recentOrders}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" className="text-muted-foreground" />
                  <YAxis className="text-muted-foreground" />
                  <Tooltip />
                  <Bar dataKey="amount" fill="hsl(239, 84%, 67%)" radius={[4, 4, 0, 0]} />
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
