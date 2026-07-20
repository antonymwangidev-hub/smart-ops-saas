import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle, Boxes, TrendingDown, Layers, Users, Truck,
  Download, CalendarClock, Wallet, BarChart3, Loader2,
} from "lucide-react";
import { exportToCSV } from "@/lib/csvExport";
import { subDays } from "date-fns";

/**
 * Reports Hub — Phase 4
 *
 * Central hub for all operational reports. Groups quick links to existing
 * dedicated reports (Analytics, Expiry, Debtors) and provides inline
 * tabbed views for reports that are simple enough to render in-page:
 *   • Inventory Valuation   — stock_qty × cost_price, per product
 *   • Low Stock             — stock_qty ≤ reorder_level
 *   • Category Performance  — 30-day revenue by category
 *   • Slow Movers           — products with zero sales in 60 days
 *   • Top Customers         — 90-day revenue by customer
 *   • Supplier Performance  — PO count, value, outstanding balance
 *
 * All queries are strictly org-scoped through RLS.
 */
export default function Reports() {
  const { currentOrg } = useOrg();
  const { formatAmount: fmt } = useCurrency();
  const orgId = currentOrg?.id;

  // ── Inventory Valuation ─────────────────────────────────────────────
  const inventoryQ = useQuery({
    queryKey: ["reports.inventory", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, category, stock_quantity, cost_price, price, reorder_level")
        .eq("organization_id", orgId!)
        .order("stock_quantity", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Sales (last 60 days) — reused for Category / Slow Movers / Customers
  const salesQ = useQuery({
    queryKey: ["reports.sales60", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const since = subDays(new Date(), 90).toISOString();
      const { data, error } = await supabase
        .from("sale_items")
        .select("product_id, product_name, quantity, unit_price, discount_amount, created_at, sales(customer_id, customer_name, total_amount, created_at)")
        .eq("organization_id", orgId!)
        .gte("created_at", since);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Supplier Performance ────────────────────────────────────────────
  const suppliersQ = useQuery({
    queryKey: ["reports.suppliers", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: suppliers, error } = await supabase
        .from("suppliers")
        .select("id, name, outstanding_balance, credit_terms_days, is_preferred")
        .eq("organization_id", orgId!);
      if (error) throw error;

      const { data: pos } = await supabase
        .from("purchase_orders")
        .select("supplier_id, total, status")
        .eq("organization_id", orgId!);

      return (suppliers ?? []).map((s) => {
        const supPos = (pos ?? []).filter((p) => p.supplier_id === s.id);
        const totalValue = supPos.reduce((sum, p) => sum + Number(p.total ?? 0), 0);
        const receivedCount = supPos.filter((p) => p.status === "received").length;
        return {
          ...s,
          po_count: supPos.length,
          received_count: receivedCount,
          total_value: totalValue,
        };
      }).sort((a, b) => b.total_value - a.total_value);
    },
  });

  // ── Derived: inventory metrics ──────────────────────────────────────
  const inventoryStats = useMemo(() => {
    const products = inventoryQ.data ?? [];
    const totalValue = products.reduce(
      (s, p) => s + Number(p.stock_quantity ?? 0) * Number(p.cost_price ?? 0), 0
    );
    const retailValue = products.reduce(
      (s, p) => s + Number(p.stock_quantity ?? 0) * Number(p.price ?? 0), 0
    );
    const lowStock = products.filter(
      (p) => Number(p.stock_quantity ?? 0) <= Number(p.reorder_level ?? 0) && (p.reorder_level ?? 0) > 0
    );
    const outOfStock = products.filter((p) => Number(p.stock_quantity ?? 0) <= 0);
    return { totalValue, retailValue, lowStock, outOfStock, products };
  }, [inventoryQ.data]);

  // ── Derived: category revenue (30d) ─────────────────────────────────
  const categoryPerformance = useMemo(() => {
    const items = salesQ.data ?? [];
    const products = inventoryQ.data ?? [];
    const prodCat = new Map(products.map((p) => [p.id, p.category || "Uncategorized"]));
    const totals = new Map<string, { revenue: number; units: number }>();
    for (const it of items) {
      const cat = prodCat.get(it.product_id) || "Uncategorized";
      const rev = Number(it.quantity) * Number(it.unit_price) - Number(it.discount_amount ?? 0);
      const cur = totals.get(cat) || { revenue: 0, units: 0 };
      cur.revenue += rev;
      cur.units += Number(it.quantity);
      totals.set(cat, cur);
    }
    return Array.from(totals.entries())
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [salesQ.data, inventoryQ.data]);

  // ── Derived: slow movers (no sales in 60d) ──────────────────────────
  const slowMovers = useMemo(() => {
    const items = salesQ.data ?? [];
    const sold = new Set(items.map((i) => i.product_id));
    return (inventoryQ.data ?? [])
      .filter((p) => !sold.has(p.id) && Number(p.stock_quantity ?? 0) > 0)
      .sort((a, b) =>
        Number(b.stock_quantity ?? 0) * Number(b.cost_price ?? 0) -
        Number(a.stock_quantity ?? 0) * Number(a.cost_price ?? 0)
      );
  }, [salesQ.data, inventoryQ.data]);

  // ── Derived: top customers (90d) ────────────────────────────────────
  const topCustomers = useMemo(() => {
    const items = salesQ.data ?? [];
    const totals = new Map<string, { name: string; revenue: number; orders: Set<string> }>();
    for (const it of items) {
      const s: any = (it as any).sales;
      if (!s?.customer_id) continue;
      const key = s.customer_id as string;
      const cur = totals.get(key) || { name: s.customer_name || "Customer", revenue: 0, orders: new Set() };
      const rev = Number(it.quantity) * Number(it.unit_price) - Number(it.discount_amount ?? 0);
      cur.revenue += rev;
      totals.set(key, cur);
    }
    return Array.from(totals.entries())
      .map(([id, v]) => ({ id, name: v.name, revenue: v.revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20);
  }, [salesQ.data]);

  const loading = inventoryQ.isLoading || salesQ.isLoading;

  // ── Quick-link tiles (top of hub) ───────────────────────────────────
  const quickLinks = [
    { to: "/analytics", icon: BarChart3, title: "Sales Analytics", desc: "Revenue trends, order status, customer growth" },
    { to: "/reports/expiry", icon: CalendarClock, title: "Expiry Report", desc: "Batches expiring in 30/60/90 days" },
    { to: "/debtors", icon: Wallet, title: "Credit Aging", desc: "Outstanding customer credit by age bucket" },
    { to: "/finance", icon: TrendingDown, title: "Cash Flow", desc: "Income vs expenses, profit & loss" },
  ];

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Reports Hub</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Operational insights across inventory, sales, customers and suppliers.
            </p>
          </div>
        </div>

        {/* Quick-link tiles */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickLinks.map((l) => (
            <Link key={l.to} to={l.to} className="group">
              <Card className="h-full transition-all hover:border-primary/40 hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary">
                      <l.icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-sm group-hover:text-primary">{l.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{l.desc}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* KPI strip */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Inventory Value (cost)</div>
              <div className="text-xl font-semibold mt-1">{fmt(inventoryStats.totalValue)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Inventory Value (retail)</div>
              <div className="text-xl font-semibold mt-1">{fmt(inventoryStats.retailValue)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Low-Stock SKUs</div>
              <div className="text-xl font-semibold mt-1">{inventoryStats.lowStock.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Out of Stock</div>
              <div className="text-xl font-semibold mt-1">{inventoryStats.outOfStock.length}</div>
            </CardContent>
          </Card>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="valuation" className="w-full">
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="valuation"><Boxes className="h-4 w-4 mr-1.5" />Valuation</TabsTrigger>
              <TabsTrigger value="lowstock"><AlertTriangle className="h-4 w-4 mr-1.5" />Low Stock</TabsTrigger>
              <TabsTrigger value="category"><Layers className="h-4 w-4 mr-1.5" />Categories</TabsTrigger>
              <TabsTrigger value="slow"><TrendingDown className="h-4 w-4 mr-1.5" />Slow Movers</TabsTrigger>
              <TabsTrigger value="customers"><Users className="h-4 w-4 mr-1.5" />Top Customers</TabsTrigger>
              <TabsTrigger value="suppliers"><Truck className="h-4 w-4 mr-1.5" />Suppliers</TabsTrigger>
            </TabsList>

            {/* Inventory Valuation */}
            <TabsContent value="valuation">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Inventory Valuation</CardTitle>
                  <Button size="sm" variant="outline" onClick={() =>
                    exportToCSV(
                      inventoryStats.products.map((p) => ({
                        SKU: p.sku, Product: p.name, Category: p.category,
                        Stock: p.stock_quantity, Cost: p.cost_price, Price: p.price,
                        CostValue: Number(p.stock_quantity ?? 0) * Number(p.cost_price ?? 0),
                        RetailValue: Number(p.stock_quantity ?? 0) * Number(p.price ?? 0),
                      })),
                      "inventory_valuation"
                    )
                  }>
                    <Download className="h-3.5 w-3.5 mr-1.5" />Export
                  </Button>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead className="text-right">Cost Value</TableHead>
                        <TableHead className="text-right">Retail Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventoryStats.products.slice(0, 200).map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{p.sku}</TableCell>
                          <TableCell className="text-right">{p.stock_quantity}</TableCell>
                          <TableCell className="text-right">{fmt(Number(p.cost_price ?? 0))}</TableCell>
                          <TableCell className="text-right">{fmt(Number(p.stock_quantity ?? 0) * Number(p.cost_price ?? 0))}</TableCell>
                          <TableCell className="text-right">{fmt(Number(p.stock_quantity ?? 0) * Number(p.price ?? 0))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Low Stock */}
            <TabsContent value="lowstock">
              <Card>
                <CardHeader><CardTitle className="text-base">Low Stock (at or below reorder level)</CardTitle></CardHeader>
                <CardContent>
                  {inventoryStats.lowStock.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">All products are above their reorder levels.</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Stock</TableHead>
                          <TableHead className="text-right">Reorder Level</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inventoryStats.lowStock.map((p) => {
                          const out = Number(p.stock_quantity ?? 0) <= 0;
                          return (
                            <TableRow key={p.id}>
                              <TableCell className="font-medium">{p.name}</TableCell>
                              <TableCell className="text-muted-foreground">{p.category || "—"}</TableCell>
                              <TableCell className="text-right">{p.stock_quantity}</TableCell>
                              <TableCell className="text-right">{p.reorder_level}</TableCell>
                              <TableCell>
                                <Badge variant={out ? "destructive" : "secondary"}>
                                  {out ? "Out of stock" : "Reorder"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Category Performance */}
            <TabsContent value="category">
              <Card>
                <CardHeader><CardTitle className="text-base">Category Performance (last 90 days)</CardTitle></CardHeader>
                <CardContent>
                  {categoryPerformance.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">No sales in the last 90 days.</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Units Sold</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">% of Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          const total = categoryPerformance.reduce((s, c) => s + c.revenue, 0) || 1;
                          return categoryPerformance.map((c) => (
                            <TableRow key={c.category}>
                              <TableCell className="font-medium">{c.category}</TableCell>
                              <TableCell className="text-right">{c.units}</TableCell>
                              <TableCell className="text-right">{fmt(c.revenue)}</TableCell>
                              <TableCell className="text-right">{((c.revenue / total) * 100).toFixed(1)}%</TableCell>
                            </TableRow>
                          ));
                        })()}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Slow Movers */}
            <TabsContent value="slow">
              <Card>
                <CardHeader><CardTitle className="text-base">Slow Movers (no sales in 90 days, stock &gt; 0)</CardTitle></CardHeader>
                <CardContent>
                  {slowMovers.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">Every stocked product moved recently. Great job!</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Stock</TableHead>
                          <TableHead className="text-right">Tied-up Capital</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {slowMovers.slice(0, 100).map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell className="text-muted-foreground">{p.category || "—"}</TableCell>
                            <TableCell className="text-right">{p.stock_quantity}</TableCell>
                            <TableCell className="text-right">{fmt(Number(p.stock_quantity ?? 0) * Number(p.cost_price ?? 0))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Top Customers */}
            <TabsContent value="customers">
              <Card>
                <CardHeader><CardTitle className="text-base">Top Customers (last 90 days)</CardTitle></CardHeader>
                <CardContent>
                  {topCustomers.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">No linked customer sales yet.</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topCustomers.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="font-medium">{c.name}</TableCell>
                            <TableCell className="text-right">{fmt(c.revenue)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Supplier Performance */}
            <TabsContent value="suppliers">
              <Card>
                <CardHeader><CardTitle className="text-base">Supplier Performance</CardTitle></CardHeader>
                <CardContent>
                  {(suppliersQ.data ?? []).length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">No suppliers yet.</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Supplier</TableHead>
                          <TableHead className="text-right">POs</TableHead>
                          <TableHead className="text-right">Received</TableHead>
                          <TableHead className="text-right">Total Value</TableHead>
                          <TableHead className="text-right">Outstanding</TableHead>
                          <TableHead>Terms</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(suppliersQ.data ?? []).map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">
                              {s.name}
                              {s.is_preferred && <Badge variant="secondary" className="ml-2">Preferred</Badge>}
                            </TableCell>
                            <TableCell className="text-right">{s.po_count}</TableCell>
                            <TableCell className="text-right">{s.received_count}</TableCell>
                            <TableCell className="text-right">{fmt(s.total_value)}</TableCell>
                            <TableCell className="text-right">{fmt(Number(s.outstanding_balance ?? 0))}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                              {s.credit_terms_days ? `Net ${s.credit_terms_days}d` : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}
