import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Banknote, Smartphone, ShoppingCart, TrendingUp, CreditCard, Loader2 } from "lucide-react";

export default function DailySummary() {
  const { currentOrg } = useOrg();
  const { formatAmount } = useCurrency();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data, isLoading } = useQuery({
    queryKey: ["daily_summary", currentOrg?.id, todayStart.toDateString()],
    queryFn: async () => {
      if (!currentOrg) return null;

      const { data: sales } = await supabase
        .from("sales")
        .select("*")
        .eq("organization_id", currentOrg.id)
        .gte("created_at", todayStart.toISOString()) as any;

      const allSales = (sales || []) as any[];
      const totalSales = allSales.reduce((s: number, sale: any) => s + Number(sale.total_amount), 0);
      const cashSales = allSales.filter((s: any) => s.payment_method === "cash" && !s.is_credit);
      const mpesaSales = allSales.filter((s: any) => s.payment_method === "mpesa" && !s.is_credit);
      const creditSales = allSales.filter((s: any) => s.is_credit);
      const cashTotal = cashSales.reduce((s: number, sale: any) => s + Number(sale.total_amount), 0);
      const mpesaTotal = mpesaSales.reduce((s: number, sale: any) => s + Number(sale.total_amount), 0);
      const creditTotal = creditSales.reduce((s: number, sale: any) => s + Number(sale.total_amount), 0);

      return {
        totalSales,
        cashTotal,
        mpesaTotal,
        creditTotal,
        transactionCount: allSales.length,
        cashCount: cashSales.length,
        mpesaCount: mpesaSales.length,
        creditCount: creditSales.length,
        recentSales: allSales.slice(0, 10),
      };
    },
    enabled: !!currentOrg,
    refetchInterval: 30000,
  });

  const summary = data || {
    totalSales: 0, cashTotal: 0, mpesaTotal: 0, creditTotal: 0,
    transactionCount: 0, cashCount: 0, mpesaCount: 0, creditCount: 0, recentSales: [],
  };

  return (
    <AppLayout>
      <div className="space-y-4 px-1">
        <div>
          <h1 className="text-xl font-bold text-foreground">Today's Summary</h1>
          <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString("en-KE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <>
            {/* Total sales hero */}
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <CardContent className="py-6 text-center">
                <p className="text-sm text-muted-foreground mb-1">Total Sales Today</p>
                <p className="text-4xl font-bold text-foreground">{formatAmount(summary.totalSales)}</p>
                <div className="flex items-center justify-center gap-1 mt-2">
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{summary.transactionCount} transactions</span>
                </div>
              </CardContent>
            </Card>

            {/* Breakdown */}
            <div className="grid grid-cols-1 gap-3">
              <Card>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center">
                      <Banknote className="h-5 w-5 text-success" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Cash</p>
                      <p className="text-xs text-muted-foreground">{summary.cashCount} sales</p>
                    </div>
                  </div>
                  <p className="text-lg font-bold text-foreground">{formatAmount(summary.cashTotal)}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Smartphone className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">M-Pesa</p>
                      <p className="text-xs text-muted-foreground">{summary.mpesaCount} sales</p>
                    </div>
                  </div>
                  <p className="text-lg font-bold text-foreground">{formatAmount(summary.mpesaTotal)}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-warning/10 flex items-center justify-center">
                      <CreditCard className="h-5 w-5 text-warning" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Credit (Deni)</p>
                      <p className="text-xs text-muted-foreground">{summary.creditCount} sales</p>
                    </div>
                  </div>
                  <p className="text-lg font-bold text-foreground">{formatAmount(summary.creditTotal)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Recent sales */}
            {summary.recentSales.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Recent Sales</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {summary.recentSales.map((sale: any) => (
                    <div key={sale.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                      <div className="flex items-center gap-2">
                        {sale.payment_method === "cash" ? (
                          <Banknote className="h-4 w-4 text-success" />
                        ) : (
                          <Smartphone className="h-4 w-4 text-primary" />
                        )}
                        <div>
                          <span className="text-sm font-medium text-foreground">
                            {formatAmount(sale.total_amount)}
                          </span>
                          {sale.is_credit && (
                            <Badge variant="outline" className="ml-2 text-xs">Deni</Badge>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(sale.created_at).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
