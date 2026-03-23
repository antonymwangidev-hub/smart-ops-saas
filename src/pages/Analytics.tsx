import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Loader2 } from "lucide-react";

const COLORS = ["hsl(239, 84%, 67%)", "hsl(160, 84%, 39%)", "hsl(38, 92%, 50%)", "hsl(0, 84%, 60%)"];

export default function Analytics() {
  const { currentOrg } = useOrg();
  const [loading, setLoading] = useState(true);
  const [ordersByStatus, setOrdersByStatus] = useState<any[]>([]);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [customerGrowth, setCustomerGrowth] = useState<any[]>([]);

  useEffect(() => {
    if (!currentOrg) return;
    const fetch = async () => {
      const [ordersRes, custRes] = await Promise.all([
        supabase.from("orders").select("*").eq("organization_id", currentOrg.id),
        supabase.from("customers").select("created_at").eq("organization_id", currentOrg.id).order("created_at"),
      ]);

      const orders = ordersRes.data || [];
      const statusCounts = { pending: 0, completed: 0, cancelled: 0 };
      orders.forEach(o => { statusCounts[o.status as keyof typeof statusCounts]++; });
      setOrdersByStatus(Object.entries(statusCounts).map(([name, value]) => ({ name, value })));

      // Group orders by month for revenue
      const monthly: Record<string, number> = {};
      orders.filter(o => o.status === "completed").forEach(o => {
        const month = new Date(o.created_at).toLocaleDateString("en", { month: "short", year: "2-digit" });
        monthly[month] = (monthly[month] || 0) + Number(o.amount);
      });
      setRevenueData(Object.entries(monthly).map(([name, revenue]) => ({ name, revenue })));

      // Customer growth
      const customers = custRes.data || [];
      const growthMap: Record<string, number> = {};
      let cumulative = 0;
      customers.forEach(c => {
        const month = new Date(c.created_at).toLocaleDateString("en", { month: "short", year: "2-digit" });
        cumulative++;
        growthMap[month] = cumulative;
      });
      setCustomerGrowth(Object.entries(growthMap).map(([name, total]) => ({ name, total })));

      setLoading(false);
    };
    fetch();
  }, [currentOrg]);

  if (loading) {
    return <AppLayout><div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground">Insights into your business performance</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Orders by Status</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={ordersByStatus} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {ordersByStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Revenue Over Time</CardTitle></CardHeader>
            <CardContent>
              {revenueData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="revenue" fill="hsl(239, 84%, 67%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground py-8">No revenue data yet</p>}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Customer Growth</CardTitle></CardHeader>
            <CardContent>
              {customerGrowth.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={customerGrowth}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="total" stroke="hsl(160, 84%, 39%)" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground py-8">No customer data yet</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
