import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, DollarSign, BarChart3 } from "lucide-react";

export default function Finance() {
  const { currentOrg } = useOrg();
  const { formatAmount } = useCurrency();
  const [from, setFrom] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const { data: sales = [] } = useQuery({
    queryKey: ["fin_sales", currentOrg?.id, from, to],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await (supabase as any).from("sales")
        .select("id, total_amount, payment_method, created_at")
        .eq("organization_id", currentOrg.id)
        .gte("created_at", from).lte("created_at", to + "T23:59:59");
      return (data || []) as any[];
    },
    enabled: !!currentOrg,
  });

  const { data: saleItems = [] } = useQuery({
    queryKey: ["fin_sale_items", currentOrg?.id, from, to],
    queryFn: async () => {
      if (!currentOrg) return [];
      const ids = sales.map((s: any) => s.id);
      if (ids.length === 0) return [];
      const { data } = await supabase.from("sale_items")
        .select("product_id, quantity, unit_price, sale_id")
        .in("sale_id", ids);
      return (data || []) as any[];
    },
    enabled: !!currentOrg && sales.length > 0,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["fin_products", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase.from("products").select("id, cost_price").eq("organization_id", currentOrg.id);
      return (data || []) as any[];
    },
    enabled: !!currentOrg,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["fin_expenses", currentOrg?.id, from, to],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await (supabase as any).from("expenses")
        .select("amount, category_name, payment_method, expense_date")
        .eq("organization_id", currentOrg.id)
        .gte("expense_date", from).lte("expense_date", to);
      return (data || []) as any[];
    },
    enabled: !!currentOrg,
  });

  const { data: creditPayments = [] } = useQuery({
    queryKey: ["fin_credit_payments", currentOrg?.id, from, to],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await (supabase as any).from("credit_payments")
        .select("amount, payment_method, payment_date")
        .eq("organization_id", currentOrg.id)
        .gte("payment_date", from).lte("payment_date", to);
      return (data || []) as any[];
    },
    enabled: !!currentOrg,
  });

  const totals = useMemo(() => {
    const revenue = sales.reduce((s: number, x: any) => s + Number(x.total_amount), 0);
    const costMap = new Map(products.map((p: any) => [p.id, Number(p.cost_price) || 0]));
    const cogs = saleItems.reduce((s: number, it: any) => s + (costMap.get(it.product_id) || 0) * Number(it.quantity), 0);
    const totalExp = expenses.reduce((s: number, e: any) => s + Number(e.amount), 0);
    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - totalExp;

    const byCat: Record<string, number> = {};
    expenses.forEach((e: any) => {
      const k = e.category_name || "Uncategorized";
      byCat[k] = (byCat[k] || 0) + Number(e.amount);
    });

    const cashIn: Record<string, number> = {};
    sales.forEach((s: any) => {
      const m = s.payment_method || "cash";
      cashIn[m] = (cashIn[m] || 0) + Number(s.total_amount);
    });
    creditPayments.forEach((p: any) => {
      const m = p.payment_method || "cash";
      cashIn[m] = (cashIn[m] || 0) + Number(p.amount);
    });

    const cashOut: Record<string, number> = {};
    expenses.forEach((e: any) => {
      const m = e.payment_method || "cash";
      cashOut[m] = (cashOut[m] || 0) + Number(e.amount);
    });

    const totalIn = Object.values(cashIn).reduce((s, n) => s + n, 0);
    const totalOut = Object.values(cashOut).reduce((s, n) => s + n, 0);

    return { revenue, cogs, grossProfit, totalExp, netProfit, byCat, cashIn, cashOut, totalIn, totalOut };
  }, [sales, saleItems, products, expenses, creditPayments]);

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="h-6 w-6" /> Finance</h1>
            <p className="text-sm text-muted-foreground">Profit & Loss and Cash Flow</p>
          </div>
          <div className="flex gap-2 items-end">
            <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><TrendingUp className="h-4 w-4" />Revenue</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatAmount(totals.revenue)}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Gross Profit</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-emerald-600">{formatAmount(totals.grossProfit)}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><TrendingDown className="h-4 w-4" />Expenses</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-destructive">{formatAmount(totals.totalExp)}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><DollarSign className="h-4 w-4" />Net Profit</CardTitle></CardHeader><CardContent><div className={`text-2xl font-bold ${totals.netProfit >= 0 ? "text-emerald-600" : "text-destructive"}`}>{formatAmount(totals.netProfit)}</div></CardContent></Card>
        </div>

        <Tabs defaultValue="pnl">
          <TabsList><TabsTrigger value="pnl">P&L</TabsTrigger><TabsTrigger value="cash">Cash Flow</TabsTrigger><TabsTrigger value="expenses">Expense Breakdown</TabsTrigger></TabsList>

          <TabsContent value="pnl" className="mt-4">
            <Card>
              <CardHeader><CardTitle>Profit & Loss Statement</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
<Table>
                  <TableBody>
                    <TableRow><TableCell className="font-medium">Revenue (Sales)</TableCell><TableCell className="text-right">{formatAmount(totals.revenue)}</TableCell></TableRow>
                    <TableRow><TableCell className="text-muted-foreground pl-6">Cost of Goods Sold</TableCell><TableCell className="text-right text-destructive">({formatAmount(totals.cogs)})</TableCell></TableRow>
                    <TableRow className="border-t-2"><TableCell className="font-bold">Gross Profit</TableCell><TableCell className="text-right font-bold text-emerald-600">{formatAmount(totals.grossProfit)}</TableCell></TableRow>
                    <TableRow><TableCell className="text-muted-foreground pl-6">Operating Expenses</TableCell><TableCell className="text-right text-destructive">({formatAmount(totals.totalExp)})</TableCell></TableRow>
                    <TableRow className="border-t-2"><TableCell className="font-bold text-lg">Net Profit</TableCell><TableCell className={`text-right font-bold text-lg ${totals.netProfit >= 0 ? "text-emerald-600" : "text-destructive"}`}>{formatAmount(totals.netProfit)}</TableCell></TableRow>
                  </TableBody>
                </Table>
</div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cash" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-emerald-600">Cash In</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
<Table>
                    <TableHeader><TableRow><TableHead>Method</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {Object.entries(totals.cashIn).map(([k, v]) => (
                        <TableRow key={k}><TableCell className="uppercase text-xs">{k}</TableCell><TableCell className="text-right">{formatAmount(v as number)}</TableCell></TableRow>
                      ))}
                      <TableRow className="border-t-2"><TableCell className="font-bold">Total In</TableCell><TableCell className="text-right font-bold">{formatAmount(totals.totalIn)}</TableCell></TableRow>
                    </TableBody>
                  </Table>
</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-destructive">Cash Out</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
<Table>
                    <TableHeader><TableRow><TableHead>Method</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {Object.entries(totals.cashOut).map(([k, v]) => (
                        <TableRow key={k}><TableCell className="uppercase text-xs">{k}</TableCell><TableCell className="text-right">{formatAmount(v as number)}</TableCell></TableRow>
                      ))}
                      <TableRow className="border-t-2"><TableCell className="font-bold">Total Out</TableCell><TableCell className="text-right font-bold">{formatAmount(totals.totalOut)}</TableCell></TableRow>
                    </TableBody>
                  </Table>
</div>
                </CardContent>
              </Card>
            </div>
            <Card className="mt-4">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-lg">Net Cash Flow</span>
                  <span className={`text-2xl font-bold ${totals.totalIn - totals.totalOut >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                    {formatAmount(totals.totalIn - totals.totalOut)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="expenses" className="mt-4">
            <Card>
              <CardHeader><CardTitle>Expenses by Category</CardTitle></CardHeader>
              <CardContent>
                {Object.keys(totals.byCat).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No expenses in this period.</p>
                ) : (
                  <div className="overflow-x-auto">
<Table>
                    <TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">% of total</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {Object.entries(totals.byCat).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([k, v]) => (
                        <TableRow key={k}>
                          <TableCell>{k}</TableCell>
                          <TableCell className="text-right">{formatAmount(v as number)}</TableCell>
                          <TableCell className="text-right text-muted-foreground text-xs">
                            {totals.totalExp ? (((v as number) / totals.totalExp) * 100).toFixed(1) : 0}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
