import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format, subDays } from "date-fns";
import type { DateRange } from "react-day-picker";

const COLORS = ["hsl(239, 84%, 67%)", "hsl(160, 84%, 39%)", "hsl(38, 92%, 50%)", "hsl(0, 84%, 60%)"];

export default function Analytics() {
  const { currentOrg } = useOrg();
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 90),
    to: new Date(),
  });

  const fromStr = dateRange?.from?.toISOString() || "";
  const toStr = dateRange?.to?.toISOString() || "";

  const { data, isLoading } = useQuery({
    queryKey: ["analytics", currentOrg?.id, fromStr, toStr],
    queryFn: async () => {
      if (!currentOrg) return null;
      let ordersQuery = supabase.from("orders").select("*").eq("organization_id", currentOrg.id);
      let custQuery = supabase.from("customers").select("created_at").eq("organization_id", currentOrg.id).order("created_at");

      if (dateRange?.from) {
        ordersQuery = ordersQuery.gte("created_at", dateRange.from.toISOString());
        custQuery = custQuery.gte("created_at", dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        ordersQuery = ordersQuery.lte("created_at", dateRange.to.toISOString());
        custQuery = custQuery.lte("created_at", dateRange.to.toISOString());
      }

      const [ordersRes, custRes] = await Promise.all([ordersQuery, custQuery]);
      const orders = ordersRes.data || [];

      const statusCounts: Record<string, number> = { pending: 0, completed: 0, cancelled: 0 };
      orders.forEach(o => { statusCounts[o.status as string] = (statusCounts[o.status as string] || 0) + 1; });
      const ordersByStatus = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

      const monthly: Record<string, number> = {};
      orders.filter(o => o.status === "completed").forEach(o => {
        const month = new Date(o.created_at).toLocaleDateString("en", { month: "short", year: "2-digit" });
        monthly[month] = (monthly[month] || 0) + Number(o.amount);
      });
      const revenueData = Object.entries(monthly).map(([name, revenue]) => ({ name, revenue }));

      const customers = custRes.data || [];
      const growthMap: Record<string, number> = {};
      let cumulative = 0;
      customers.forEach(c => {
        const month = new Date(c.created_at).toLocaleDateString("en", { month: "short", year: "2-digit" });
        cumulative++;
        growthMap[month] = cumulative;
      });
      const customerGrowth = Object.entries(growthMap).map(([name, total]) => ({ name, total }));

      return { ordersByStatus, revenueData, customerGrowth };
    },
    enabled: !!currentOrg,
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
            <p className="text-muted-foreground">Insights into your business performance</p>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <CalendarIcon className="h-4 w-4" />
                {dateRange?.from ? format(dateRange.from, "MMM d") : "Start"} – {dateRange?.to ? format(dateRange.to, "MMM d, yyyy") : "End"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Orders by Status</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={data?.ordersByStatus || []} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                      {(data?.ordersByStatus || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Revenue Over Time</CardTitle></CardHeader>
              <CardContent>
                {(data?.revenueData?.length || 0) > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={data?.revenueData}>
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
                {(data?.customerGrowth?.length || 0) > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={data?.customerGrowth}>
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
        )}
      </div>
    </AppLayout>
  );
}
