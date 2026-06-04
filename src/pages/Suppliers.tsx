import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Truck, Plus, Loader2, Phone, Mail } from "lucide-react";

interface Supplier {
  id: string;
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  payment_terms?: string | null;
  outstanding_balance: number;
  is_active: boolean;
}

export default function Suppliers() {
  const { currentOrg } = useOrg();
  const { formatAmount } = useCurrency();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({
    name: "", contact_person: "", phone: "", email: "", address: "", payment_terms: "", notes: "",
  });

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await (supabase as any)
        .from("suppliers")
        .select("*")
        .eq("organization_id", currentOrg.id)
        .order("created_at", { ascending: false });
      return (data || []) as Supplier[];
    },
    enabled: !!currentOrg,
  });

  const resetForm = () => {
    setEditing(null);
    setForm({ name: "", contact_person: "", phone: "", email: "", address: "", payment_terms: "", notes: "" });
  };

  const startEdit = (s: Supplier) => {
    setEditing(s);
    setForm({
      name: s.name, contact_person: s.contact_person || "", phone: s.phone || "",
      email: s.email || "", address: s.address || "", payment_terms: s.payment_terms || "", notes: "",
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!currentOrg) throw new Error("No org");
      if (!form.name.trim()) throw new Error("Name required");
      if (editing) {
        const { error } = await (supabase as any).from("suppliers").update({
          name: form.name, contact_person: form.contact_person || null, phone: form.phone || null,
          email: form.email || null, address: form.address || null, payment_terms: form.payment_terms || null,
          notes: form.notes || null,
        }).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("suppliers").insert({
          organization_id: currentOrg.id,
          name: form.name, contact_person: form.contact_person || null, phone: form.phone || null,
          email: form.email || null, address: form.address || null, payment_terms: form.payment_terms || null,
          notes: form.notes || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: editing ? "Supplier updated" : "Supplier added" });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      setOpen(false);
      resetForm();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const totalOutstanding = suppliers.reduce((s, x) => s + Number(x.outstanding_balance || 0), 0);

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Truck className="h-6 w-6" /> Suppliers</h1>
            <p className="text-sm text-muted-foreground">Manage vendors and outstanding balances</p>
          </div>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Supplier</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit Supplier" : "New Supplier"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Contact Person</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
                  <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                </div>
                <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                <div><Label>Payment Terms</Label><Input placeholder="e.g. Net 30" value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} /></div>
                <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full">
                  {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Suppliers</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{suppliers.length}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Outstanding</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-destructive">{formatAmount(totalOutstanding)}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Active</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{suppliers.filter((s) => s.is_active).length}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>All Suppliers</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : suppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No suppliers yet. Add your first one.</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Contact</TableHead><TableHead>Terms</TableHead><TableHead className="text-right">Outstanding</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {suppliers.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="font-medium">{s.name}</div>
                        {s.contact_person && <div className="text-xs text-muted-foreground">{s.contact_person}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs space-y-0.5">
                          {s.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</div>}
                          {s.email && <div className="flex items-center gap-1"><Mail className="h-3 w-3" />{s.email}</div>}
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{s.payment_terms || "—"}</Badge></TableCell>
                      <TableCell className="text-right font-medium">
                        <span className={Number(s.outstanding_balance) > 0 ? "text-destructive" : ""}>
                          {formatAmount(Number(s.outstanding_balance) || 0)}
                        </span>
                      </TableCell>
                      <TableCell><Button size="sm" variant="outline" onClick={() => startEdit(s)}>Edit</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
