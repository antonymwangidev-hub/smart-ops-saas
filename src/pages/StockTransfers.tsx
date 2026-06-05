import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeftRight, Plus, Trash2 } from "lucide-react";

interface Branch { id: string; name: string; }
interface Product { id: string; name: string; sku: string | null; }
interface Transfer {
  id: string; reference: string | null; status: string; notes: string | null;
  source_branch_id: string; destination_branch_id: string;
  transferred_at: string | null; received_at: string | null; created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted", in_transit: "bg-amber-500/20 text-amber-300",
  received: "bg-emerald-500/20 text-emerald-300", cancelled: "bg-destructive/20 text-destructive",
};

export default function StockTransfers() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ source_branch_id: "", destination_branch_id: "", reference: "", notes: "" });
  const [lines, setLines] = useState<{ product_id: string; quantity: number }[]>([]);

  const load = async () => {
    if (!currentOrg) return;
    const [bRes, pRes, tRes] = await Promise.all([
      supabase.from("branches" as any).select("id, name").eq("organization_id", currentOrg.id).eq("is_active", true),
      supabase.from("products").select("id, name, sku").eq("organization_id", currentOrg.id).eq("is_active", true),
      supabase.from("stock_transfers" as any).select("*").eq("organization_id", currentOrg.id).order("created_at", { ascending: false }).limit(50),
    ]);
    setBranches((bRes.data as any) || []);
    setProducts((pRes.data as any) || []);
    setTransfers((tRes.data as any) || []);
  };

  useEffect(() => { load(); }, [currentOrg]);

  const addLine = () => setLines([...lines, { product_id: "", quantity: 1 }]);
  const updateLine = (i: number, k: string, v: any) => setLines(lines.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));

  const create = async () => {
    if (!currentOrg || !form.source_branch_id || !form.destination_branch_id) return toast.error("Pick source & destination");
    if (form.source_branch_id === form.destination_branch_id) return toast.error("Source must differ from destination");
    if (lines.length === 0 || lines.some(l => !l.product_id || l.quantity <= 0)) return toast.error("Add valid line items");

    const { data: t, error } = await supabase.from("stock_transfers" as any).insert({
      organization_id: currentOrg.id, source_branch_id: form.source_branch_id,
      destination_branch_id: form.destination_branch_id, reference: form.reference || null,
      notes: form.notes || null, created_by: user?.id, status: "draft",
    }).select().single();
    if (error || !t) return toast.error(error?.message || "Failed");

    const { error: iErr } = await supabase.from("stock_transfer_items" as any).insert(
      lines.map(l => ({ transfer_id: (t as any).id, product_id: l.product_id, quantity: l.quantity }))
    );
    if (iErr) return toast.error(iErr.message);
    toast.success("Transfer created");
    setOpen(false); setForm({ source_branch_id: "", destination_branch_id: "", reference: "", notes: "" }); setLines([]);
    load();
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("stock_transfers" as any).update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Marked ${status.replace("_", " ")}`); load();
  };

  const bName = (id: string) => branches.find(b => b.id === id)?.name || "—";

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><ArrowLeftRight className="h-6 w-6" /> Stock Transfers</h1>
            <p className="text-sm text-muted-foreground">Move stock between branches</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New transfer</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>New stock transfer</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>From branch</Label>
                    <Select value={form.source_branch_id} onValueChange={(v) => setForm({ ...form, source_branch_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                      <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>To branch</Label>
                    <Select value={form.destination_branch_id} onValueChange={(v) => setForm({ ...form, destination_branch_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
                      <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Reference</Label><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
                <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                <div>
                  <div className="flex items-center justify-between mb-2"><Label>Items</Label><Button size="sm" variant="outline" onClick={addLine}><Plus className="h-3 w-3" /></Button></div>
                  <div className="space-y-2">
                    {lines.map((l, i) => (
                      <div key={i} className="flex gap-2">
                        <Select value={l.product_id} onValueChange={(v) => updateLine(i, "product_id", v)}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Product" /></SelectTrigger>
                          <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</SelectItem>)}</SelectContent>
                        </Select>
                        <Input type="number" className="w-24" value={l.quantity} onChange={(e) => updateLine(i, "quantity", parseFloat(e.target.value) || 0)} />
                        <Button size="sm" variant="ghost" onClick={() => removeLine(i)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                      </div>
                    ))}
                  </div>
                </div>
                <Button onClick={create} className="w-full">Create transfer</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-3">
          {transfers.map(t => (
            <Card key={t.id}>
              <CardHeader className="pb-2 flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-base">{bName(t.source_branch_id)} → {bName(t.destination_branch_id)}</CardTitle>
                  <p className="text-xs text-muted-foreground">{t.reference || new Date(t.created_at).toLocaleDateString()}</p>
                </div>
                <Badge className={STATUS_COLORS[t.status]}>{t.status.replace("_", " ")}</Badge>
              </CardHeader>
              <CardContent>
                {t.notes && <p className="text-sm text-muted-foreground mb-2">{t.notes}</p>}
                <div className="flex gap-2">
                  {t.status === "draft" && <Button size="sm" onClick={() => updateStatus(t.id, "in_transit")}>Mark in transit</Button>}
                  {t.status === "in_transit" && <Button size="sm" onClick={() => updateStatus(t.id, "received")}>Mark received</Button>}
                  {(t.status === "draft" || t.status === "in_transit") && <Button size="sm" variant="outline" onClick={() => updateStatus(t.id, "cancelled")}>Cancel</Button>}
                </div>
              </CardContent>
            </Card>
          ))}
          {transfers.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No transfers yet.</p>}
        </div>
      </div>
    </AppLayout>
  );
}
