import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Plus, Search, Package, Calendar, AlertTriangle, Trash2 } from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";

interface Batch {
  id: string;
  product_id: string;
  supplier_id: string | null;
  batch_number: string;
  manufacturing_date: string | null;
  expiry_date: string | null;
  quantity_received: number;
  quantity_remaining: number;
  unit_cost: number;
  storage_location: string | null;
  notes: string | null;
  received_at: string;
  products?: { name: string; sku: string | null } | null;
  suppliers?: { name: string } | null;
}

type FilterKey = "all" | "active" | "expiring_30" | "expiring_90" | "expired" | "depleted";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All batches" },
  { key: "active", label: "In stock" },
  { key: "expiring_30", label: "Expiring ≤ 30 days" },
  { key: "expiring_90", label: "Expiring ≤ 90 days" },
  { key: "expired", label: "Expired" },
  { key: "depleted", label: "Depleted" },
];

function expiryBadge(expiry: string | null, remaining: number) {
  if (remaining <= 0) return <Badge variant="outline">Depleted</Badge>;
  if (!expiry) return <Badge variant="secondary">No expiry</Badge>;
  const days = differenceInDays(parseISO(expiry), new Date());
  if (days < 0) return <Badge variant="destructive">Expired {Math.abs(days)}d ago</Badge>;
  if (days <= 30) return <Badge className="bg-destructive/10 text-destructive border-destructive/30">Expires in {days}d</Badge>;
  if (days <= 90) return <Badge className="bg-warning/10 text-warning border-warning/30">Expires in {days}d</Badge>;
  return <Badge variant="outline">Expires in {days}d</Badge>;
}

export default function Batches() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    product_id: "",
    supplier_id: "",
    batch_number: "",
    manufacturing_date: "",
    expiry_date: "",
    quantity_received: "",
    unit_cost: "",
    storage_location: "",
    notes: "",
  });

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["product_batches", currentOrg?.id],
    enabled: !!currentOrg?.id,
    queryFn: async (): Promise<Batch[]> => {
      const { data, error } = await supabase
        .from("product_batches")
        .select("*, products(name, sku), suppliers(name)")
        .eq("organization_id", currentOrg!.id)
        .order("expiry_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products_min", currentOrg?.id],
    enabled: !!currentOrg?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, sku")
        .eq("organization_id", currentOrg!.id)
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers_min", currentOrg?.id],
    enabled: !!currentOrg?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("organization_id", currentOrg!.id)
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
  });

  const createBatch = useMutation({
    mutationFn: async () => {
      if (!form.product_id || !form.batch_number || !form.quantity_received) {
        throw new Error("Product, batch number and quantity are required");
      }
      const qty = Number(form.quantity_received);
      const { error } = await supabase.from("product_batches").insert({
        organization_id: currentOrg!.id,
        product_id: form.product_id,
        supplier_id: form.supplier_id || null,
        batch_number: form.batch_number.trim(),
        manufacturing_date: form.manufacturing_date || null,
        expiry_date: form.expiry_date || null,
        quantity_received: qty,
        quantity_remaining: qty,
        unit_cost: Number(form.unit_cost) || 0,
        storage_location: form.storage_location || null,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Batch added" });
      qc.invalidateQueries({ queryKey: ["product_batches"] });
      setOpen(false);
      setForm({
        product_id: "", supplier_id: "", batch_number: "",
        manufacturing_date: "", expiry_date: "", quantity_received: "",
        unit_cost: "", storage_location: "", notes: "",
      });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteBatch = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_batches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Batch deleted" });
      qc.invalidateQueries({ queryKey: ["product_batches"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    const today = new Date();
    return batches.filter((b) => {
      if (search) {
        const q = search.toLowerCase();
        const match = b.batch_number.toLowerCase().includes(q)
          || b.products?.name?.toLowerCase().includes(q)
          || b.products?.sku?.toLowerCase().includes(q);
        if (!match) return false;
      }
      const days = b.expiry_date ? differenceInDays(parseISO(b.expiry_date), today) : null;
      switch (filter) {
        case "active": return b.quantity_remaining > 0 && (days === null || days >= 0);
        case "expiring_30": return b.quantity_remaining > 0 && days !== null && days >= 0 && days <= 30;
        case "expiring_90": return b.quantity_remaining > 0 && days !== null && days >= 0 && days <= 90;
        case "expired": return days !== null && days < 0;
        case "depleted": return b.quantity_remaining <= 0;
        default: return true;
      }
    });
  }, [batches, search, filter]);

  const counts = useMemo(() => {
    const today = new Date();
    let expiring30 = 0, expired = 0, active = 0;
    for (const b of batches) {
      const days = b.expiry_date ? differenceInDays(parseISO(b.expiry_date), today) : null;
      if (days !== null && days < 0) expired++;
      else if (b.quantity_remaining > 0) {
        active++;
        if (days !== null && days <= 30) expiring30++;
      }
    }
    return { expiring30, expired, active };
  }, [batches]);

  return (
    <AppLayout>
      <div className="p-4 md:p-8 space-y-6 max-w-[1600px] mx-auto">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Batch Tracking</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track expiry dates and inventory batches. Critical for medicines, vaccines and feeds.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Add batch</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Record a new batch</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Product *</Label>
                  <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}{p.sku ? ` — ${p.sku}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Batch number *</Label>
                    <Input value={form.batch_number}
                      onChange={(e) => setForm({ ...form, batch_number: e.target.value })}
                      placeholder="e.g. BX-2025-042" />
                  </div>
                  <div>
                    <Label>Supplier</Label>
                    <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                      <SelectContent>
                        {suppliers.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Manufacturing date</Label>
                    <Input type="date" value={form.manufacturing_date}
                      onChange={(e) => setForm({ ...form, manufacturing_date: e.target.value })} />
                  </div>
                  <div>
                    <Label>Expiry date</Label>
                    <Input type="date" value={form.expiry_date}
                      onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Quantity received *</Label>
                    <Input type="number" min="1" value={form.quantity_received}
                      onChange={(e) => setForm({ ...form, quantity_received: e.target.value })} />
                  </div>
                  <div>
                    <Label>Unit cost (KES)</Label>
                    <Input type="number" min="0" step="0.01" value={form.unit_cost}
                      onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Storage location</Label>
                  <Input value={form.storage_location}
                    onChange={(e) => setForm({ ...form, storage_location: e.target.value })}
                    placeholder="e.g. Fridge A, Shelf 3" />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea rows={2} value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => createBatch.mutate()} disabled={createBatch.isPending}>
                  {createBatch.isPending ? "Saving…" : "Save batch"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Package className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-bold">{counts.active}</div>
                <div className="text-xs text-muted-foreground">Active batches</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-warning/10 text-warning flex items-center justify-center">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-bold">{counts.expiring30}</div>
                <div className="text-xs text-muted-foreground">Expiring in 30 days</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-bold">{counts.expired}</div>
                <div className="text-xs text-muted-foreground">Expired batches</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters + Search */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by product, SKU or batch number"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <Button key={f.key} size="sm"
                variant={filter === f.key ? "default" : "outline"}
                onClick={() => setFilter(f.key)}>
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Batch #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                    No batches match this filter.
                  </TableCell></TableRow>
                ) : filtered.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <div className="font-medium">{b.products?.name ?? "—"}</div>
                      {b.products?.sku && <div className="text-xs text-muted-foreground">{b.products.sku}</div>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{b.batch_number}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{b.suppliers?.name ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm">{b.expiry_date ? format(parseISO(b.expiry_date), "dd MMM yyyy") : "—"}</span>
                        {expiryBadge(b.expiry_date, b.quantity_remaining)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">{b.quantity_remaining}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{b.quantity_received}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{b.storage_location ?? "—"}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost"
                        onClick={() => {
                          if (confirm(`Delete batch ${b.batch_number}?`)) deleteBatch.mutate(b.id);
                        }}>
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
