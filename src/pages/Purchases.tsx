import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Plus, Loader2, Trash2, CheckCircle2, DollarSign } from "lucide-react";

interface POItem {
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_cost: number;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-blue-500/10 text-blue-600",
  ordered: "bg-amber-500/10 text-amber-600",
  received: "bg-emerald-500/10 text-emerald-600",
  cancelled: "bg-destructive/10 text-destructive",
};

export default function Purchases() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [payOpen, setPayOpen] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [supplierId, setSupplierId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<POItem[]>([{ product_id: null, product_name: "", quantity: 1, unit_cost: 0 }]);

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers_pick", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await (supabase as any).from("suppliers").select("id, name").eq("organization_id", currentOrg.id).eq("is_active", true);
      return (data || []) as any[];
    },
    enabled: !!currentOrg,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products_pick", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase.from("products").select("id, name, cost_price").eq("organization_id", currentOrg.id);
      return (data || []) as any[];
    },
    enabled: !!currentOrg,
  });

  const { data: pos = [], isLoading } = useQuery({
    queryKey: ["purchase_orders", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await (supabase as any)
        .from("purchase_orders")
        .select("*, suppliers(name), purchase_order_items(*)")
        .eq("organization_id", currentOrg.id)
        .order("created_at", { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!currentOrg,
  });

  const addRow = () => setItems([...items, { product_id: null, product_name: "", quantity: 1, unit_cost: 0 }]);
  const removeRow = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<POItem>) => setItems(items.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const pickProduct = (i: number, pid: string) => {
    const p = products.find((x: any) => x.id === pid);
    if (p) updateRow(i, { product_id: p.id, product_name: p.name, unit_cost: Number(p.cost_price) || 0 });
  };

  const subtotal = items.reduce((s, it) => s + (Number(it.quantity) * Number(it.unit_cost)), 0);

  const reset = () => {
    setSupplierId(""); setExpectedDate(""); setNotes("");
    setItems([{ product_id: null, product_name: "", quantity: 1, unit_cost: 0 }]);
  };

  const createPO = useMutation({
    mutationFn: async () => {
      if (!currentOrg) throw new Error("No org");
      if (!supplierId) throw new Error("Select a supplier");
      const valid = items.filter((it) => it.product_name && it.quantity > 0);
      if (valid.length === 0) throw new Error("Add at least one item");
      const poNumber = `PO-${Date.now()}`;
      const total = valid.reduce((s, it) => s + (it.quantity * it.unit_cost), 0);
      const { data: po, error } = await (supabase as any).from("purchase_orders").insert({
        organization_id: currentOrg.id, supplier_id: supplierId, po_number: poNumber,
        status: "draft", expected_date: expectedDate || null, notes: notes || null,
        subtotal: total, total, created_by: user?.id,
      }).select().single();
      if (error) throw error;
      const { error: iErr } = await (supabase as any).from("purchase_order_items").insert(
        valid.map((it) => ({
          purchase_order_id: po.id,
          product_id: it.product_id, product_name: it.product_name,
          quantity: it.quantity, unit_cost: it.unit_cost, subtotal: it.quantity * it.unit_cost,
        }))
      );
      if (iErr) throw iErr;
    },
    onSuccess: () => {
      toast({ title: "Purchase order created" });
      qc.invalidateQueries({ queryKey: ["purchase_orders"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      setOpen(false); reset();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase as any).from("purchase_orders").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast({ title: `Marked ${vars.status}` });
      qc.invalidateQueries({ queryKey: ["purchase_orders"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const recordPayment = useMutation({
    mutationFn: async (poId: string) => {
      const po = pos.find((p: any) => p.id === poId);
      if (!po) throw new Error("PO not found");
      const amt = Number(payAmount);
      if (!amt || amt <= 0) throw new Error("Enter amount");
      const { error } = await (supabase as any).from("supplier_payments").insert({
        organization_id: currentOrg!.id,
        supplier_id: po.supplier_id, purchase_order_id: poId,
        amount: amt, payment_method: payMethod, created_by: user?.id,
      });
      if (error) throw error;
      await (supabase as any).from("purchase_orders").update({ amount_paid: Number(po.amount_paid || 0) + amt }).eq("id", poId);
    },
    onSuccess: () => {
      toast({ title: "Payment recorded" });
      qc.invalidateQueries({ queryKey: ["purchase_orders"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      setPayOpen(null); setPayAmount(""); setPayMethod("cash");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardList className="h-6 w-6" /> Purchase Orders</h1>
            <p className="text-sm text-muted-foreground">Create POs, track receipts, and pay suppliers</p>
          </div>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New PO</Button></DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Purchase Order</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Supplier *</Label>
                    <Select value={supplierId} onValueChange={setSupplierId}>
                      <SelectTrigger><SelectValue placeholder="Choose supplier" /></SelectTrigger>
                      <SelectContent>{suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Expected Date</Label><Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} /></div>
                </div>
                <div>
                  <Label>Items</Label>
                  <div className="space-y-2 mt-2">
                    {items.map((it, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-5">
                          <Select value={it.product_id || ""} onValueChange={(v) => pickProduct(i, v)}>
                            <SelectTrigger><SelectValue placeholder="Pick product or type below" /></SelectTrigger>
                            <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                          </Select>
                          <Input className="mt-1" placeholder="or custom name" value={it.product_name} onChange={(e) => updateRow(i, { product_name: e.target.value })} />
                        </div>
                        <div className="col-span-2"><Label className="text-xs">Qty</Label><Input type="number" min={1} value={it.quantity} onChange={(e) => updateRow(i, { quantity: Number(e.target.value) })} /></div>
                        <div className="col-span-3"><Label className="text-xs">Unit cost</Label><Input type="number" min={0} step="0.01" value={it.unit_cost} onChange={(e) => updateRow(i, { unit_cost: Number(e.target.value) })} /></div>
                        <div className="col-span-1 text-sm text-right font-medium">{formatAmount(it.quantity * it.unit_cost)}</div>
                        <Button size="icon" variant="ghost" onClick={() => removeRow(i)} className="col-span-1"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={addRow}><Plus className="h-3 w-3 mr-1" />Add row</Button>
                  </div>
                </div>
                <div><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
                <div className="flex items-center justify-between border-t pt-3">
                  <span className="text-sm text-muted-foreground">Total</span>
                  <span className="text-xl font-bold">{formatAmount(subtotal)}</span>
                </div>
                <Button onClick={() => createPO.mutate()} disabled={createPO.isPending} className="w-full">
                  {createPO.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create PO
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader><CardTitle>All Purchase Orders</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : pos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No purchase orders yet.</p>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>PO #</TableHead><TableHead>Supplier</TableHead><TableHead>Status</TableHead>
                  <TableHead>Items</TableHead><TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {pos.map((p: any) => {
                    const balance = Number(p.total) - Number(p.amount_paid || 0);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">{p.po_number}</TableCell>
                        <TableCell>{p.suppliers?.name || "—"}</TableCell>
                        <TableCell><Badge className={STATUS_COLORS[p.status] || ""}>{p.status}</Badge></TableCell>
                        <TableCell className="text-xs">{p.purchase_order_items?.length || 0}</TableCell>
                        <TableCell className="text-right">{formatAmount(Number(p.total))}</TableCell>
                        <TableCell className="text-right">
                          {formatAmount(Number(p.amount_paid || 0))}
                          {balance > 0 && <div className="text-xs text-destructive">owe {formatAmount(balance)}</div>}
                        </TableCell>
                        <TableCell className="space-x-1">
                          {p.status === "draft" && <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: p.id, status: "approved" })}>Approve</Button>}
                          {p.status === "approved" && <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: p.id, status: "ordered" })}>Mark Ordered</Button>}
                          {p.status === "ordered" && <Button size="sm" onClick={() => updateStatus.mutate({ id: p.id, status: "received" })}><CheckCircle2 className="h-3 w-3 mr-1" />Receive</Button>}
                          {balance > 0 && p.status !== "draft" && p.status !== "cancelled" && (
                            <Button size="sm" variant="outline" onClick={() => { setPayOpen(p.id); setPayAmount(String(balance)); }}>
                              <DollarSign className="h-3 w-3 mr-1" />Pay
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!payOpen} onOpenChange={(o) => { if (!o) setPayOpen(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Amount</Label><Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></div>
              <div>
                <Label>Method</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="mpesa">M-Pesa</SelectItem>
                    <SelectItem value="bank">Bank Transfer</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={() => payOpen && recordPayment.mutate(payOpen)} disabled={recordPayment.isPending}>
                {recordPayment.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Record Payment
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
