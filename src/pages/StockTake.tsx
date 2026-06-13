import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardCheck, Plus, Search, Loader2, CheckCircle2,
  AlertTriangle, ArrowUp, ArrowDown, Minus, RotateCcw,
} from "lucide-react";

interface CountEntry {
  product_id: string;
  product_name: string;
  system_qty: number;
  counted_qty: number | "";
  variance: number;
  category: string;
  sku: string;
  unit: string;
  cost_price: number;
}

type SessionStatus = "active" | "closed";

export default function StockTake() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sessionNotes, setSessionNotes] = useState("");
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [entries, setEntries] = useState<CountEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showVariancesOnly, setShowVariancesOnly] = useState(false);

  // Load all products
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["stock_take_products", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await (supabase as any)
        .from("products")
        .select("id, name, sku, category, stock_quantity, unit_of_measure, cost_price, is_active")
        .eq("organization_id", currentOrg.id)
        .eq("is_active", true)
        .order("category", { ascending: true })
        .order("name", { ascending: true });
      return (data || []) as any[];
    },
    enabled: !!currentOrg,
  });

  const categories = useMemo(() => {
    const cats = [...new Set(products.map((p: any) => p.category || "Uncategorized"))].sort();
    return cats;
  }, [products]);

  const startSession = () => {
    const id = crypto.randomUUID();
    setSessionId(id);
    setSessionStatus("active");
    setEntries(
      products.map((p: any) => ({
        product_id: p.id,
        product_name: p.name,
        system_qty: Number(p.stock_quantity),
        counted_qty: "",
        variance: 0,
        category: p.category || "Uncategorized",
        sku: p.sku || "",
        unit: p.unit_of_measure || "pcs",
        cost_price: Number(p.cost_price) || 0,
      }))
    );
    toast({ title: "Stock take started", description: `${products.length} products loaded. Count each item physically.` });
  };

  const updateCount = (productId: string, value: string) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.product_id !== productId) return e;
        const counted = value === "" ? "" : parseInt(value) || 0;
        const variance = counted === "" ? 0 : (counted as number) - e.system_qty;
        return { ...e, counted_qty: counted, variance };
      })
    );
  };

  const countedEntries = entries.filter((e) => e.counted_qty !== "");
  const uncountedEntries = entries.filter((e) => e.counted_qty === "");
  const varianceEntries = countedEntries.filter((e) => e.variance !== 0);
  const positiveVariances = varianceEntries.filter((e) => e.variance > 0);
  const negativeVariances = varianceEntries.filter((e) => e.variance < 0);
  const totalVarianceValue = varianceEntries.reduce((s, e) => s + e.variance * e.cost_price, 0);

  const filteredEntries = entries.filter((e) => {
    const q = search.toLowerCase();
    const matchSearch = !search || e.product_name.toLowerCase().includes(q) || e.sku.toLowerCase().includes(q);
    const matchCat = categoryFilter === "all" || e.category === categoryFilter;
    const matchVariance = !showVariancesOnly || e.variance !== 0;
    return matchSearch && matchCat && matchVariance;
  });

  const commitChanges = useMutation({
    mutationFn: async () => {
      if (!currentOrg || !user) throw new Error("Not authenticated");
      const toCommit = countedEntries.filter((e) => e.variance !== 0);
      if (toCommit.length === 0) throw new Error("No variances to commit");

      // Update product stock quantities
      for (const entry of toCommit) {
        const { error } = await (supabase as any)
          .from("products")
          .update({
            stock_quantity: entry.counted_qty as number,
            updated_at: new Date().toISOString(),
          })
          .eq("id", entry.product_id)
          .eq("organization_id", currentOrg.id);
        if (error) throw error;
      }

      // Log to activity_logs
      await (supabase as any).from("activity_logs").insert({
        organization_id: currentOrg.id,
        user_id: user.id,
        action: "stock_take_committed",
        metadata: {
          session_id: sessionId,
          products_counted: countedEntries.length,
          variances: toCommit.length,
          total_variance_value: totalVarianceValue,
          notes: sessionNotes,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock_take_products"] });
      setSessionStatus("closed");
      toast({ title: "Stock take committed", description: "Inventory has been updated to match physical count." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const resetSession = () => {
    setSessionStatus(null);
    setSessionId(null);
    setEntries([]);
    setSessionNotes("");
    setSearch("");
    setCategoryFilter("all");
    setShowVariancesOnly(false);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </AppLayout>
    );
  }

  // ── NO SESSION / CLOSED ──────────────────────────────────────────────
  if (!sessionStatus || sessionStatus === "closed") {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardCheck className="h-6 w-6" /> Stock Take</h1>
            <p className="text-muted-foreground text-sm">Count your physical stock and reconcile with the system</p>
          </div>

          {sessionStatus === "closed" && (
            <Card className="border-success/30 bg-success/5">
              <CardContent className="p-6 text-center space-y-3">
                <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
                <h3 className="text-lg font-bold text-foreground">Stock Take Complete!</h3>
                <p className="text-sm text-muted-foreground">
                  Inventory has been updated. {varianceEntries.length > 0 ? `${varianceEntries.length} variance(s) resolved.` : "No variances found."}
                </p>
                <Button onClick={resetSession} className="gap-2"><RotateCcw className="h-4 w-4" /> Start New Session</Button>
              </CardContent>
            </Card>
          )}

          {!sessionStatus && (
            <Card>
              <CardContent className="p-8 space-y-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold">{products.length}</p>
                    <p className="text-xs text-muted-foreground">Total Products</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{categories.length}</p>
                    <p className="text-xs text-muted-foreground">Categories</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-warning">{products.filter((p: any) => p.stock_quantity <= p.low_stock_threshold).length}</p>
                    <p className="text-xs text-muted-foreground">Low Stock</p>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Notes (optional)</label>
                  <Textarea
                    value={sessionNotes}
                    onChange={(e) => setSessionNotes(e.target.value)}
                    placeholder="e.g. Monthly count — Main store, counted by John"
                    rows={2}
                    className="mt-1"
                  />
                </div>

                <Button className="w-full h-12 gap-2 text-base" onClick={startSession} disabled={products.length === 0}>
                  <Plus className="h-5 w-5" /> Start Stock Count ({products.length} products)
                </Button>

                {products.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground">Add products first before doing a stock take.</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </AppLayout>
    );
  }

  // ── ACTIVE SESSION ────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2"><ClipboardCheck className="h-5 w-5" /> Stock Count in Progress</h1>
            <p className="text-xs text-muted-foreground">{countedEntries.length} / {entries.length} products counted</p>
          </div>
          <div className="flex gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2 text-destructive border-destructive/30">
                  <RotateCcw className="h-4 w-4" /> Discard
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Discard stock count?</AlertDialogTitle>
                  <AlertDialogDescription>All your counts will be lost. Inventory will NOT be changed.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Continue Counting</AlertDialogCancel>
                  <AlertDialogAction onClick={resetSession} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Discard</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={countedEntries.length === 0 || commitChanges.isPending} className="gap-2">
                  {commitChanges.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Commit Changes
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Commit {varianceEntries.length} variance(s)?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will update {varianceEntries.length} product(s) in inventory to match your physical count.
                    {uncountedEntries.length > 0 && ` ${uncountedEntries.length} uncounted products will keep their current system quantity.`}
                    {totalVarianceValue !== 0 && (
                      <span className={` Net variance value: ${formatAmount(Math.abs(totalVarianceValue))} ${totalVarianceValue < 0 ? "loss" : "gain"}.`} />
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Review First</AlertDialogCancel>
                  <AlertDialogAction onClick={() => commitChanges.mutate()}>Commit to Inventory</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Progress + variance summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Counted</p>
              <p className="text-xl font-bold text-success">{countedEntries.length}</p>
              <div className="mt-1 bg-muted rounded-full h-1.5">
                <div className="bg-success rounded-full h-1.5 transition-all" style={{ width: `${entries.length ? (countedEntries.length / entries.length) * 100 : 0}%` }} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Remaining</p>
              <p className="text-xl font-bold text-muted-foreground">{uncountedEntries.length}</p>
            </CardContent>
          </Card>
          <Card className={negativeVariances.length > 0 ? "border-destructive/30" : ""}>
            <CardContent className="p-3">
              <div className="flex items-center gap-1"><ArrowDown className="h-3.5 w-3.5 text-destructive" /><p className="text-xs text-muted-foreground">Short</p></div>
              <p className="text-xl font-bold text-destructive">{negativeVariances.length}</p>
            </CardContent>
          </Card>
          <Card className={positiveVariances.length > 0 ? "border-success/30" : ""}>
            <CardContent className="p-3">
              <div className="flex items-center gap-1"><ArrowUp className="h-3.5 w-3.5 text-success" /><p className="text-xs text-muted-foreground">Over</p></div>
              <p className="text-xl font-bold text-success">{positiveVariances.length}</p>
            </CardContent>
          </Card>
        </div>

        {varianceEntries.length > 0 && (
          <Card className={`${totalVarianceValue < 0 ? "border-destructive/30 bg-destructive/5" : "border-success/30 bg-success/5"}`}>
            <CardContent className="p-3 flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 shrink-0 ${totalVarianceValue < 0 ? "text-destructive" : "text-success"}`} />
              <p className="text-sm">
                Net variance: <strong>{formatAmount(Math.abs(totalVarianceValue))}</strong>
                {totalVarianceValue < 0 ? " shrinkage (loss)" : " surplus (gain)"} across {varianceEntries.length} product(s)
              </p>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search product or SKU…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant={showVariancesOnly ? "default" : "outline"} size="sm" onClick={() => setShowVariancesOnly(!showVariancesOnly)} className="gap-1 h-9">
            <AlertTriangle className="h-3.5 w-3.5" /> Variances only
          </Button>
        </div>

        {/* Count table */}
        <Card>
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">System Qty</TableHead>
                  <TableHead className="text-center w-32">Physical Count</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.map((entry) => {
                  const counted = entry.counted_qty !== "";
                  const hasVariance = counted && entry.variance !== 0;
                  return (
                    <TableRow key={entry.product_id} className={hasVariance ? (entry.variance < 0 ? "bg-destructive/5" : "bg-success/5") : ""}>
                      <TableCell className="font-medium">{entry.product_name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{entry.sku || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{entry.category}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {entry.system_qty} <span className="text-xs">{entry.unit}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          min="0"
                          placeholder="Count…"
                          value={entry.counted_qty}
                          onChange={(e) => updateCount(entry.product_id, e.target.value)}
                          className={`h-8 w-24 text-center mx-auto ${counted ? "border-primary" : ""}`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {counted ? (
                          <div className={`flex items-center justify-end gap-1 font-medium ${entry.variance > 0 ? "text-success" : entry.variance < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                            {entry.variance > 0 ? <ArrowUp className="h-3.5 w-3.5" /> : entry.variance < 0 ? <ArrowDown className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                            {entry.variance > 0 ? "+" : ""}{entry.variance}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {filteredEntries.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">No products match your filters</div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
