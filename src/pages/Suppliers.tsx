import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Truck, Plus, Loader2, Phone, Mail, FileText, Download,
  AlertTriangle, CheckCircle2, Clock, DollarSign,
} from "lucide-react";

interface Supplier {
  id: string;
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  payment_terms?: string | null;
  notes?: string | null;
  outstanding_balance: number;
  is_active: boolean;
  created_at: string;
}

// Parse payment terms string into days: "Net 30" -> 30, "60 days" -> 60, etc.
function parseTermsDays(terms: string | null): number {
  if (!terms) return 30;
  const match = terms.match(/\d+/);
  return match ? parseInt(match[0]) : 30;
}

// Aging bucket for a purchase order
function agingBucket(dueDateStr: string): { label: string; color: string } {
  const now = Date.now();
  const due = new Date(dueDateStr).getTime();
  const days = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  if (days > 14) return { label: `Due in ${days}d`, color: "text-muted-foreground" };
  if (days >= 0) return { label: `Due in ${days}d`, color: "text-warning" };
  if (days >= -30) return { label: `${Math.abs(days)}d overdue`, color: "text-destructive" };
  return { label: `${Math.abs(days)}d overdue`, color: "text-destructive font-bold" };
}

export default function Suppliers() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: "", contact_person: "", phone: "", email: "", address: "", payment_terms: "Net 30", notes: "" });
  const [tab, setTab] = useState("suppliers");

  // LPO creation state
  const [lpoOpen, setLpoOpen] = useState(false);
  const [lpoSupplierId, setLpoSupplierId] = useState("");
  const [lpoItems, setLpoItems] = useState([{ description: "", quantity: 1, unit_price: 0, unit: "pcs" }]);
  const [lpoNotes, setLpoNotes] = useState("");
  const [lpoDeliveryDate, setLpoDeliveryDate] = useState("");

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await (supabase as any).from("suppliers").select("*").eq("organization_id", currentOrg.id).order("name");
      return (data || []) as Supplier[];
    },
    enabled: !!currentOrg,
  });

  // Pending purchase orders (not fully received or cancelled) for payable aging
  const { data: pendingPOs = [] } = useQuery({
    queryKey: ["pending_pos", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await (supabase as any)
        .from("purchase_orders")
        .select("*, suppliers(name, payment_terms)")
        .eq("organization_id", currentOrg.id)
        .in("status", ["draft", "approved", "ordered"])
        .order("created_at", { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!currentOrg,
  });

  const resetForm = () => {
    setEditing(null);
    setForm({ name: "", contact_person: "", phone: "", email: "", address: "", payment_terms: "Net 30", notes: "" });
  };

  const startEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ name: s.name, contact_person: s.contact_person || "", phone: s.phone || "", email: s.email || "", address: s.address || "", payment_terms: s.payment_terms || "Net 30", notes: s.notes || "" });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!currentOrg || !form.name.trim()) throw new Error("Name required");
      const payload = { name: form.name, contact_person: form.contact_person || null, phone: form.phone || null, email: form.email || null, address: form.address || null, payment_terms: form.payment_terms || null, notes: form.notes || null };
      if (editing) {
        const { error } = await (supabase as any).from("suppliers").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("suppliers").insert({ organization_id: currentOrg.id, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast({ title: editing ? "Supplier updated" : "Supplier added" }); qc.invalidateQueries({ queryKey: ["suppliers"] }); setOpen(false); resetForm(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Compute payables with due dates
  const payables = pendingPOs.map((po: any) => {
    const supplier = suppliers.find((s) => s.id === po.supplier_id);
    const terms = supplier?.payment_terms || po.suppliers?.payment_terms || "Net 30";
    const termsDays = parseTermsDays(terms);
    const created = new Date(po.created_at);
    const dueDate = new Date(created.getTime() + termsDays * 24 * 60 * 60 * 1000);
    const aging = agingBucket(dueDate.toISOString());
    return { ...po, supplierName: supplier?.name || po.suppliers?.name || "Unknown", dueDate, aging, terms };
  });

  const dueThisWeek = payables.filter((p) => {
    const days = (p.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= 7;
  });
  const overdue = payables.filter((p) => p.dueDate.getTime() < Date.now());
  const totalPayable = payables.reduce((s: number, p: any) => s + Number(p.total || 0), 0);

  const totalOutstanding = suppliers.reduce((s, x) => s + Number(x.outstanding_balance || 0), 0);

  // LPO generation
  const lpoTotal = lpoItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const lpoNumber = `LPO-${Date.now().toString().slice(-8)}`;

  const printLPO = () => {
    const supplier = suppliers.find((s) => s.id === lpoSupplierId);
    if (!supplier) return;
    const w = window.open("", "_blank", "width=800,height=600");
    if (!w) return;
    const esc = (s: unknown) =>
      String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const rows = lpoItems.map((i) =>
      `<tr><td>${esc(i.description)}</td><td>${esc(i.quantity)}</td><td>${esc(i.unit)}</td><td>KES ${i.unit_price.toFixed(2)}</td><td>KES ${(i.quantity * i.unit_price).toFixed(2)}</td></tr>`
    ).join("");
    w.document.write(`
      <html><head><title>LPO ${esc(lpoNumber)}</title>
      <style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px}
      h2{margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f0f0f0}
      .header{display:flex;justify-content:space-between;margin-bottom:16px}
      .footer{margin-top:24px;font-size:11px;color:#666}
      .total{font-weight:bold;font-size:14px;margin-top:12px;text-align:right}
      .sig{margin-top:40px;display:flex;justify-content:space-between}
      .sig div{border-top:1px solid #000;padding-top:4px;width:200px;text-align:center;font-size:11px}
      @media print{@page{margin:15mm}}</style></head>
      <body>
      <div class="header">
        <div><h2>${esc(currentOrg?.name || "Company")}</h2><p>LOCAL PURCHASE ORDER</p></div>
        <div style="text-align:right"><strong>LPO No: ${esc(lpoNumber)}</strong><br>Date: ${esc(new Date().toLocaleDateString("en-KE"))}<br>${lpoDeliveryDate ? `Delivery By: ${esc(lpoDeliveryDate)}` : ""}</div>
      </div>
      <p><strong>To:</strong> ${esc(supplier.name)}<br>${esc(supplier.address || "")}<br>${esc(supplier.phone || "")} ${esc(supplier.email || "")}</p>
      <table><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th>Total</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="total">Grand Total: KES ${lpoTotal.toFixed(2)}</div>
      ${lpoNotes ? `<p style="margin-top:12px"><strong>Notes:</strong> ${esc(lpoNotes)}</p>` : ""}
      <div class="sig">
        <div>Authorized Signatory</div>
        <div>Supplier Acknowledgment</div>
      </div>
      <div class="footer">This is a computer-generated document. Generated by SmartOps on ${esc(new Date().toLocaleString("en-KE"))}</div>
      </body></html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 400);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Truck className="h-6 w-6" /> Suppliers</h1>
            <p className="text-sm text-muted-foreground">Manage vendors, credit terms, and payable aging</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setLpoOpen(true)} className="gap-2">
              <FileText className="h-4 w-4" /> Create LPO
            </Button>
            <Button onClick={() => { resetForm(); setOpen(true); }}><Plus className="h-4 w-4 mr-2" />Add Supplier</Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Suppliers</p><p className="text-2xl font-bold">{suppliers.length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Outstanding</p><p className="text-2xl font-bold text-destructive">{formatAmount(totalOutstanding)}</p></CardContent></Card>
          <Card className={overdue.length > 0 ? "border-destructive/30" : ""}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Overdue POs</p>
              <p className={`text-2xl font-bold ${overdue.length > 0 ? "text-destructive" : ""}`}>{overdue.length}</p>
            </CardContent>
          </Card>
          <Card className={dueThisWeek.length > 0 ? "border-warning/30" : ""}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Due This Week</p>
              <p className={`text-2xl font-bold ${dueThisWeek.length > 0 ? "text-warning" : ""}`}>{dueThisWeek.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Alerts */}
        {overdue.length > 0 && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Overdue Payments</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {overdue.slice(0, 3).map((p) => `${p.supplierName}: ${formatAmount(p.total)}`).join(" · ")}
                  {overdue.length > 3 && ` +${overdue.length - 3} more`}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
            <TabsTrigger value="payables">
              Payable Aging {payables.length > 0 && <Badge className="ml-2 h-5 text-[10px]">{payables.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* ── SUPPLIERS TAB ── */}
          <TabsContent value="suppliers">
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                {isLoading ? <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
                  : suppliers.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No suppliers yet. Add your first one.</p>
                  : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Supplier</TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead>Terms</TableHead>
                          <TableHead className="text-right">Outstanding</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {suppliers.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell>
                              <div className="font-medium">{s.name}</div>
                              {s.contact_person && <div className="text-xs text-muted-foreground">{s.contact_person}</div>}
                              {s.address && <div className="text-xs text-muted-foreground">{s.address}</div>}
                            </TableCell>
                            <TableCell>
                              <div className="text-xs space-y-0.5">
                                {s.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</div>}
                                {s.email && <div className="flex items-center gap-1"><Mail className="h-3 w-3" />{s.email}</div>}
                              </div>
                            </TableCell>
                            <TableCell><Badge variant="outline">{s.payment_terms || "Net 30"}</Badge></TableCell>
                            <TableCell className="text-right font-medium">
                              <span className={Number(s.outstanding_balance) > 0 ? "text-destructive" : "text-muted-foreground"}>
                                {formatAmount(Number(s.outstanding_balance) || 0)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" onClick={() => startEdit(s)}>Edit</Button>
                                <Button size="sm" variant="ghost" onClick={() => { setLpoSupplierId(s.id); setLpoOpen(true); }} className="gap-1">
                                  <FileText className="h-3.5 w-3.5" /> LPO
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── PAYABLE AGING TAB ── */}
          <TabsContent value="payables">
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base">Payable Aging Report</CardTitle>
                <p className="text-sm text-muted-foreground">Total due: <span className="font-bold text-foreground">{formatAmount(totalPayable)}</span></p>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {payables.length === 0 ? (
                  <div className="p-8 text-center">
                    <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2" />
                    <p className="text-muted-foreground">No pending payables</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>PO Number</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Terms</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Aging</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payables.map((po: any) => (
                        <TableRow key={po.id}>
                          <TableCell className="font-mono text-sm">{po.po_number}</TableCell>
                          <TableCell className="font-medium">{po.supplierName}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(po.created_at).toLocaleDateString("en-KE")}
                          </TableCell>
                          <TableCell><Badge variant="outline">{po.terms}</Badge></TableCell>
                          <TableCell className="text-xs">
                            {po.dueDate.toLocaleDateString("en-KE")}
                          </TableCell>
                          <TableCell>
                            <Badge variant={po.status === "approved" ? "default" : "secondary"}>{po.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatAmount(po.total || 0)}</TableCell>
                          <TableCell>
                            <span className={`text-xs font-medium ${po.aging.color}`}>{po.aging.label}</span>
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

        {/* ── Supplier form dialog ── */}
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
          <DialogContent className="w-[95vw] max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Edit Supplier" : "New Supplier"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Contact Person</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
                <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              </div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Address / Town</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div>
                <Label>Payment Terms</Label>
                <Select value={form.payment_terms} onValueChange={(v) => setForm({ ...form, payment_terms: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Cash on Delivery", "Net 7", "Net 14", "Net 30", "Net 45", "Net 60", "Net 90"].map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
              <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full">
                {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── LPO Dialog ── */}
        <Dialog open={lpoOpen} onOpenChange={setLpoOpen}>
          <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Create Local Purchase Order</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Supplier *</Label>
                  <Select value={lpoSupplierId} onValueChange={setLpoSupplierId}>
                    <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Expected Delivery Date</Label>
                  <Input type="date" value={lpoDeliveryDate} onChange={(e) => setLpoDeliveryDate(e.target.value)} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Items</Label>
                  <Button size="sm" variant="outline" onClick={() => setLpoItems([...lpoItems, { description: "", quantity: 1, unit_price: 0, unit: "pcs" }])}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Row
                  </Button>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-1 text-xs text-muted-foreground px-1">
                    <span className="col-span-5">Description</span>
                    <span className="col-span-2">Qty</span>
                    <span className="col-span-2">Unit</span>
                    <span className="col-span-2">Unit Price</span>
                    <span className="col-span-1" />
                  </div>
                  {lpoItems.map((item, i) => (
                    <div key={i} className="grid grid-cols-12 gap-1">
                      <Input className="col-span-5 h-9" placeholder="Item description" value={item.description} onChange={(e) => setLpoItems(lpoItems.map((it, idx) => idx === i ? { ...it, description: e.target.value } : it))} />
                      <Input className="col-span-2 h-9" type="number" min="1" value={item.quantity} onChange={(e) => setLpoItems(lpoItems.map((it, idx) => idx === i ? { ...it, quantity: parseInt(e.target.value) || 1 } : it))} />
                      <Input className="col-span-2 h-9" placeholder="pcs" value={item.unit} onChange={(e) => setLpoItems(lpoItems.map((it, idx) => idx === i ? { ...it, unit: e.target.value } : it))} />
                      <Input className="col-span-2 h-9" type="number" min="0" step="0.01" placeholder="0.00" value={item.unit_price || ""} onChange={(e) => setLpoItems(lpoItems.map((it, idx) => idx === i ? { ...it, unit_price: parseFloat(e.target.value) || 0 } : it))} />
                      <Button className="col-span-1 h-9" variant="ghost" size="icon" onClick={() => setLpoItems(lpoItems.filter((_, idx) => idx !== i))} disabled={lpoItems.length === 1}>
                        <span className="text-destructive text-base">×</span>
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
                <span className="font-medium">Grand Total</span>
                <span className="text-lg font-bold">{formatAmount(lpoTotal)}</span>
              </div>

              <div><Label>Notes / Special Instructions</Label><Textarea value={lpoNotes} onChange={(e) => setLpoNotes(e.target.value)} rows={2} placeholder="e.g. Deliver to Gikomba warehouse, call on arrival" /></div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setLpoOpen(false)}>Cancel</Button>
                <Button onClick={printLPO} disabled={!lpoSupplierId || lpoItems.every((i) => !i.description)} className="gap-2">
                  <Download className="h-4 w-4" /> Generate & Print LPO
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
