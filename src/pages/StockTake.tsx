import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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

export default function StockTake() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sessionNotes, setSessionNotes] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [entries, setEntries] = useState<CountEntry[]>([]);
  const [showVariancesOnly, setShowVariancesOnly] = useState(false);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["stock_take_products", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await (supabase as any)
        .from("products")
        .select("id, name, sku, category, stock_quantity, unit_of_measure, cost_price, is_active")
        .eq("organization_id", currentOrg.id)
        .eq("is_active", true)
        .order("category").order("name");
      return (data || []) as any[];
    },
    enabled: !!currentOrg,
  });

  const categories = useMemo(() => (
    [...new Set(products.map((p: any) => p.category || "Uncategorized"))].sort() as string[]
  ), [products]);

  const startSession = () => {
    setSessionId(crypto.randomUUID());
    setEntries(products.map((p: any) => ({
      product_id: p.id, product_name: p.name,
      system_qty: Number(p.stock_quantity), counted_qty: "",
      variance: 0, category: p.category || "Uncategorized",
      sku: p.sku || "", unit: p.unit_of_measure || "pcs",
      cost_price: Number(p.cost_price) || 0,
    })));
    toast({ title: "Stock count started", description: `${products.length} products loaded` });
  };

  const updateCount = (productId: string, value: string) => {
    setEntries((prev) => prev.map((e) => {
      if (e.product_id !== productId) return e;
      const counted = value === "" ? "" : Math.max(0, parseInt(value) || 0);
      return { ...e, counted_qty: counted, variance: counted === "" ? 0 : (counted as number) - e.system_qty };
    }));
  };

  const countedEntries = entries.filter((e) => e.counted_qty !== "");
  const varianceEntries = countedEntries.filter((e) => e.variance !== 0);
  const negativeVariances = varianceEntries.filter((e) => e.variance < 0);
  const positiveVariances = varianceEntries.filter((e) => e.variance > 0);
  const totalVarianceValue = varianceEntries.reduce((s, e) => s + e.variance * e.cost_price, 0);

  const filteredEntries = entries.filter((e) => {
    const q = search.toLowerCase();
    return (
      (!search || e.product_name.toLowerCase().includes(q) || e.sku.toLowerCase().includes(q)) &&
      (categoryFilter === "all" || e.category === categoryFilter) &&
      (!showVariancesOnly || (e.counted_qty !== "" && e.variance !== 0))
    );
  });

  const commitChanges = useMutation({
    mutationFn: async () => {
      if (!currentOrg || !user) throw new Error("Not authenticated");
      const toCommit = countedEntries.filter((e) => e.variance !== 0);
      if (toCommit.length === 0) throw new Error("No variances to commit");
      for (const entry of toCommit) {
        const { error } = await (supabase as any)
          .from("products")
          .update({ stock_quantity: entry.counted_qty as number, updated_at: new Date().toISOString() })
          .eq("id", entry.product_id).eq("organization_id", currentOrg.id);
        if (error) throw error;
      }
      await (supabase as any).from("activity_logs").insert({
        organization_id: currentOrg.id, user_id: user.id,
        action: "stock_take_committed",
        metadata: { session_id: sessionId, products_counted: countedEntries.length, variances: toCommit.length, total_variance_value: totalVarianceValue, notes: sessionNotes },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock_take_products"] });
      toast({ title: "✅ Stock take committed", description: "Inventory updated to match physical count." });
      setSessionId(null); setEntries([]);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (isLoading) {
    return <AppLayout><div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></AppLayout>;
  }

  // ── Start screen ──────────────────────────────────────────────────────
  if (!sessionId) {
    return (
      <AppLayout>
        <div className="space-y-4 max-w-lg mx-auto">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" /> Stock Take
            </h1>
            <p className="text-sm text-muted-foreground">Count physical stock and reconcile with system</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{products.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Products</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{categories.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Categories</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-warning">
                {products.filter((p: any) => p.stock_quantity <= 10).length}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Low stock</p>
            </CardContent></Card>
          </div>

          <div>
            <label className="text-sm font-medium">Session notes (optional)</label>
            <Textarea
              value={sessionNotes}
              onChange={(e) => setSessionNotes(e.target.value)}
              placeholder="e.g. Monthly count — Main store, John"
              rows={2}
              className="mt-1"
            />
          </div>

          <Button
            className="w-full h-14 text-base font-semibold rounded-xl"
            onClick={startSession}
            disabled={products.length === 0}
          >
            <ClipboardCheck className="h-5 w-5 mr-2" />
            Start Count ({products.length} products)
          </Button>
        </div>
      </AppLayout>
    );
  }

  // ── Active session ────────────────────────────────────────────────────
  const progressPct = entries.length ? Math.round((countedEntries.length / entries.length) * 100) : 0;

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Sticky progress header */}
        <div className="sticky top-0 z-20 bg-background pt-1 pb-2 -mx-3 px-3 border-b border-border/50">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="font-semibold text-sm text-foreground">
                {countedEntries.length} / {entries.length} counted
              </p>
              <p className="text-xs text-muted-foreground">
                {varianceEntries.length > 0
                  ? `${varianceEntries.length} variance${varianceEntries.length > 1 ? "s" : ""} found`
                  : "No variances yet"}
              </p>
            </div>
            <div className="flex gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1 text-destructive border-destructive/30">
                    <RotateCcw className="h-3.5 w-3.5" /> Discard
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="w-[95vw] max-w-sm rounded-2xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Discard count?</AlertDialogTitle>
                    <AlertDialogDescription>All counts will be lost. Inventory unchanged.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Continue</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-white" onClick={() => { setSessionId(null); setEntries([]); }}>Discard</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" className="h-9 gap-1" disabled={countedEntries.length === 0 || commitChanges.isPending}>
                    {commitChanges.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Commit
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="w-[95vw] max-w-sm rounded-2xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Commit {varianceEntries.length} variance{varianceEntries.length !== 1 ? "s" : ""}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This updates {varianceEntries.length} product{varianceEntries.length !== 1 ? "s" : ""} in inventory.
                      {totalVarianceValue !== 0 && ` Net variance: ${formatAmount(Math.abs(totalVarianceValue))} ${totalVarianceValue < 0 ? "loss" : "gain"}.`}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Review</AlertDialogCancel>
                    <AlertDialogAction onClick={() => commitChanges.mutate()}>Commit</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-2 bg-primary rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Stats row */}
          <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 text-destructive">
              <ArrowDown className="h-3 w-3" />{negativeVariances.length} short
            </span>
            <span className="flex items-center gap-1 text-success">
              <ArrowUp className="h-3 w-3" />{positiveVariances.length} over
            </span>
            {totalVarianceValue !== 0 && (
              <span className={totalVarianceValue < 0 ? "text-destructive" : "text-success"}>
                {totalVarianceValue < 0 ? "−" : "+"}{formatAmount(Math.abs(totalVarianceValue))}
              </span>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-32 h-10 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant={showVariancesOnly ? "default" : "outline"}
            size="sm"
            className="h-10 shrink-0"
            onClick={() => setShowVariancesOnly(!showVariancesOnly)}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Product cards for counting — mobile-first design */}
        <div className="space-y-2 pb-4">
          {filteredEntries.map((entry) => {
            const hasCounted = entry.counted_qty !== "";
            const hasVariance = hasCounted && entry.variance !== 0;

            return (
              <Card
                key={entry.product_id}
                className={`transition-all ${
                  hasVariance
                    ? entry.variance < 0
                      ? "border-destructive/40 bg-destructive/5"
                      : "border-success/40 bg-success/5"
                    : hasCounted
                    ? "border-primary/30 bg-primary/5"
                    : ""
                }`}
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    {/* Product info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-sm truncate">
                        {entry.product_name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {entry.sku && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {entry.sku}
                          </span>
                        )}
                        <Badge variant="outline" className="text-[10px] py-0 h-4">
                          {entry.category}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        System: <strong>{entry.system_qty} {entry.unit}</strong>
                      </p>
                    </div>

                    {/* Count input */}
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <Input
                        type="number"
                        min="0"
                        placeholder="Count"
                        value={entry.counted_qty}
                        onChange={(e) => updateCount(entry.product_id, e.target.value)}
                        className={`h-12 w-24 text-center text-lg font-bold ${
                          hasCounted ? "border-primary border-2" : ""
                        }`}
                        inputMode="numeric"
                      />
                      {/* Variance indicator */}
                      {hasVariance && (
                        <div className={`flex items-center gap-0.5 text-xs font-bold ${
                          entry.variance < 0 ? "text-destructive" : "text-success"
                        }`}>
                          {entry.variance > 0
                            ? <ArrowUp className="h-3 w-3" />
                            : <ArrowDown className="h-3 w-3" />
                          }
                          {entry.variance > 0 ? "+" : ""}{entry.variance}
                        </div>
                      )}
                      {hasCounted && !hasVariance && (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {filteredEntries.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-8">
              No products match your filters
            </p>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
