import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { format, differenceInDays, parseISO } from "date-fns";
import { AlertTriangle, Calendar, Package, Download } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";

export default function ExpiryReport() {
  const { currentOrg } = useOrg();
  const { formatAmount: fmtMoney } = useCurrency();

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["expiry_report", currentOrg?.id],
    enabled: !!currentOrg?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_batches")
        .select("id, batch_number, expiry_date, quantity_remaining, unit_cost, storage_location, products(name, sku, category)")
        .eq("organization_id", currentOrg!.id)
        .not("expiry_date", "is", null)
        .order("expiry_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const buckets = useMemo(() => {
    const today = new Date();
    const expired: any[] = [];
    const in30: any[] = [];
    const in60: any[] = [];
    const in90: any[] = [];
    for (const b of batches) {
      if (b.quantity_remaining <= 0) continue;
      const days = differenceInDays(parseISO(b.expiry_date!), today);
      const enriched = { ...b, days_to_expiry: days, value_at_risk: b.quantity_remaining * (b.unit_cost ?? 0) };
      if (days < 0) expired.push(enriched);
      else if (days <= 30) in30.push(enriched);
      else if (days <= 60) in60.push(enriched);
      else if (days <= 90) in90.push(enriched);
    }
    return { expired, in30, in60, in90 };
  }, [batches]);

  const totals = useMemo(() => ({
    expiredValue: buckets.expired.reduce((s, b) => s + b.value_at_risk, 0),
    riskValue: [...buckets.in30, ...buckets.in60, ...buckets.in90].reduce((s, b) => s + b.value_at_risk, 0),
  }), [buckets]);

  const exportCSV = () => {
    const rows = [
      ["Bucket", "Product", "SKU", "Batch", "Expiry", "Days", "Remaining", "Unit cost", "Value at risk"],
      ...[
        ...buckets.expired.map((b) => ["Expired", b]),
        ...buckets.in30.map((b) => ["≤30d", b]),
        ...buckets.in60.map((b) => ["31–60d", b]),
        ...buckets.in90.map((b) => ["61–90d", b]),
      ].map(([bucket, b]: any) => [
        bucket, b.products?.name ?? "", b.products?.sku ?? "",
        b.batch_number, b.expiry_date, b.days_to_expiry,
        b.quantity_remaining, b.unit_cost, b.value_at_risk.toFixed(2),
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `expiry-report-${format(new Date(), "yyyy-MM-dd")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const Section = ({ title, tone, items, icon: Icon }: any) => (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${tone}`}>
            <Icon className="h-4 w-4" />
          </div>
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        <Badge variant="outline">{items.length}</Badge>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">Nothing here — good news.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead className="text-right">Value at risk</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((b: any) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <div className="font-medium text-sm">{b.products?.name ?? "—"}</div>
                    {b.products?.sku && <div className="text-xs text-muted-foreground">{b.products.sku}</div>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{b.batch_number}</TableCell>
                  <TableCell className="text-sm">
                    <div>{format(parseISO(b.expiry_date), "dd MMM yyyy")}</div>
                    <div className="text-xs text-muted-foreground">
                      {b.days_to_expiry < 0 ? `${Math.abs(b.days_to_expiry)}d ago` : `in ${b.days_to_expiry}d`}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{b.quantity_remaining}</TableCell>
                  <TableCell className="text-right font-medium">{fmtMoney(b.value_at_risk)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );

  return (
    <AppLayout>
      <div className="p-4 md:p-8 space-y-6 max-w-[1600px] mx-auto">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Expiry Report</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Batches by remaining shelf life. Prioritise clearance and restock decisions.
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={exportCSV}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-bold">{fmtMoney(totals.expiredValue)}</div>
                <div className="text-xs text-muted-foreground">Value already expired</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-warning/10 text-warning flex items-center justify-center">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-bold">{fmtMoney(totals.riskValue)}</div>
                <div className="text-xs text-muted-foreground">Value expiring within 90 days</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <Card><CardContent className="p-10 text-center text-muted-foreground">Loading…</CardContent></Card>
        ) : (
          <div className="grid gap-4">
            <Section title="Already expired" items={buckets.expired}
              tone="bg-destructive/10 text-destructive" icon={AlertTriangle} />
            <Section title="Expiring within 30 days" items={buckets.in30}
              tone="bg-destructive/10 text-destructive" icon={Calendar} />
            <Section title="Expiring 31–60 days" items={buckets.in60}
              tone="bg-warning/10 text-warning" icon={Calendar} />
            <Section title="Expiring 61–90 days" items={buckets.in90}
              tone="bg-primary/10 text-primary" icon={Package} />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
