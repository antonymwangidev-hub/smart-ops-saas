import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Banknote, Smartphone, ShoppingCart, CreditCard, Loader2, ChevronLeft, ChevronRight, Calendar } from "lucide-react";

function toLocalISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function DailySummary() {
  const { currentOrg } = useOrg();
  const { formatAmount } = useCurrency();

  const today = useMemo(() => toLocalISODate(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const isToday = selectedDate === today;

  const { dayStart, dayEnd } = useMemo(() => {
    const start = new Date(selectedDate + "T00:00:00");
    const end = new Date(selectedDate + "T23:59:59.999");
    return { dayStart: start, dayEnd: end };
  }, [selectedDate]);

  const shiftDay = (delta: number) => {
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + delta);
    const next = toLocalISODate(d);
    if (next <= today) setSelectedDate(next);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["daily_summary", currentOrg?.id, selectedDate],
    queryFn: async () => {
      if (!currentOrg) return null;

      const { data: sales } = await supabase
        .from("sales")
        .select("*")
        .eq("organization_id", currentOrg.id)
        .gte("created_at", dayStart.toISOString())
        .lte("created_at", dayEnd.toISOString())
        .order("created_at", { ascending: false }) as any;

      const allSales = (sales || []) as any[];
      const totalSales = allSales.reduce((s: number, sale: any) => s + Number(sale.total_amount), 0);
      const cashSales = allSales.filter((s: any) => s.payment_method === "cash" && !s.is_credit);
      const mpesaSales = allSales.filter((s: any) => s.payment_method === "mpesa" && !s.is_credit);
      const creditSales = allSales.filter((s: any) => s.is_credit);
      const cashTotal = cashSales.reduce((s: number, sale: any) => s + Number(sale.total_amount), 0);
      const mpesaTotal = mpesaSales.reduce((s: number, sale: any) => s + Number(sale.total_amount), 0);
      const creditTotal = creditSales.reduce((s: number, sale: any) => s + Number(sale.total_amount), 0);

      return {
        totalSales, cashTotal, mpesaTotal, creditTotal,
        transactionCount: allSales.length,
        cashCount: cashSales.length,
        mpesaCount: mpesaSales.length,
        creditCount: creditSales.length,
        recentSales: allSales.slice(0, 20),
      };
    },
    enabled: !!currentOrg,
    refetchInterval: isToday ? 30000 : false,
  });

  const summary = data || {
    totalSales: 0, cashTotal: 0, mpesaTotal: 0, creditTotal: 0,
    transactionCount: 0, cashCount: 0, mpesaCount: 0, creditCount: 0, recentSales: [],
  };

  const dateLabel = new Date(selectedDate + "T12:00:00").toLocaleDateString("en-KE", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  return (
    <AppLayout>
      <div className="space-y-4 px-1">
        <div>
          <h1 className="text-xl font-bold text-foreground">{isToday ? "Today's Summary" : "Sales History"}</h1>
          <p className="text-sm text-muted-foreground">{dateLabel}</p>
        </div>

        {/* Date navigator — persistent daily history */}
        <Card>
          <CardContent className="p-3 flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => shiftDay(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="relative flex-1">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="date"
                value={selectedDate}
                max={today}
                onChange={(e) => setSelectedDate(e.target.value || today)}
                className="h-9 pl-9"
              />
            </div>
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => shiftDay(1)} disabled={isToday}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!isToday && (
              <Button variant="ghost" size="sm" className="h-9 shrink-0" onClick={() => setSelectedDate(today)}>Today</Button>
            )}
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <>
            {/* Total sales hero */}
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <CardContent className="py-6 text-center">
                <p className="text-sm text-muted-foreground mb-1">{isToday ? "Total Sales Today" : "Total Sales"}</p>
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
