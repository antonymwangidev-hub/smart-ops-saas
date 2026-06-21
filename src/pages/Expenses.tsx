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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Wallet, Plus, Loader2, Trash2, Tag } from "lucide-react";

export default function Expenses() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [form, setForm] = useState({
    description: "", amount: "", category_id: "", payment_method: "cash",
    expense_date: new Date().toISOString().slice(0, 10), reference: "", notes: "",
    is_recurring: false, recurring_period: "monthly",
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["expense_categories", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await (supabase as any).from("expense_categories").select("*").eq("organization_id", currentOrg.id).order("name");
      return (data || []) as any[];
    },
    enabled: !!currentOrg,
  });

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["expenses", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await (supabase as any).from("expenses").select("*").eq("organization_id", currentOrg.id).order("expense_date", { ascending: false }).limit(100);
      return (data || []) as any[];
    },
    enabled: !!currentOrg,
  });

  const reset = () => setForm({
    description: "", amount: "", category_id: "", payment_method: "cash",
    expense_date: new Date().toISOString().slice(0, 10), reference: "", notes: "",
    is_recurring: false, recurring_period: "monthly",
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!currentOrg) throw new Error("No org");
      if (!form.description || !form.amount) throw new Error("Description and amount required");
      const cat = categories.find((c: any) => c.id === form.category_id);
      const { error } = await (supabase as any).from("expenses").insert({
        organization_id: currentOrg.id,
        description: form.description, amount: Number(form.amount),
        category_id: form.category_id || null, category_name: cat?.name || null,
        payment_method: form.payment_method, expense_date: form.expense_date,
        reference: form.reference || null, notes: form.notes || null,
        is_recurring: form.is_recurring, recurring_period: form.is_recurring ? form.recurring_period : null,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Expense added" });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setOpen(false); reset();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addCat = useMutation({
    mutationFn: async () => {
      if (!currentOrg || !newCat.trim()) throw new Error("Name required");
      const { error } = await (supabase as any).from("expense_categories").insert({ organization_id: currentOrg.id, name: newCat.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Category added" });
      qc.invalidateQueries({ queryKey: ["expense_categories"] });
      setNewCat(""); setCatOpen(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast({ title: "Deleted" }); qc.invalidateQueries({ queryKey: ["expenses"] }); },
  });

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const todayTotal = expenses.filter((e: any) => e.expense_date === today).reduce((s: number, e: any) => s + Number(e.amount), 0);
  const monthTotal = expenses.filter((e: any) => e.expense_date >= monthStart).reduce((s: number, e: any) => s + Number(e.amount), 0);
  const allTotal = expenses.reduce((s: number, e: any) => s + Number(e.amount), 0);

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="h-6 w-6" /> Expenses</h1>
            <p className="text-sm text-muted-foreground">Track business spending by category</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={catOpen} onOpenChange={setCatOpen}>
              <DialogTrigger asChild><Button variant="outline"><Tag className="h-4 w-4 mr-2" />Categories</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Expense Categories</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input placeholder="New category" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
                    <Button onClick={() => addCat.mutate()} disabled={addCat.isPending}>Add</Button>
                  </div>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {categories.map((c: any) => <div key={c.id} className="p-2 border rounded text-sm">{c.name}</div>)}
                    {categories.length === 0 && <p className="text-xs text-muted-foreground">No categories yet</p>}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Expense</Button></DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>New Expense</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Description *</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Amount *</Label><Input type="number" min={0} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
                    <div><Label>Date</Label><Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Category</Label>
                      <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                        <SelectContent>{categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Method</Label>
                      <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="mpesa">M-Pesa</SelectItem>
                          <SelectItem value="bank">Bank</SelectItem>
                          <SelectItem value="card">Card</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div><Label>Reference</Label><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
                  <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                  <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full">
                    {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save Expense
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Today</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatAmount(todayTotal)}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">This Month</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatAmount(monthTotal)}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">All Time (last 100)</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatAmount(allTotal)}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Recent Expenses</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : expenses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No expenses logged yet.</p>
            ) : (
              <div className="overflow-x-auto">
<Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Description</TableHead>
                  <TableHead>Category</TableHead><TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {expenses.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs">{e.expense_date}</TableCell>
                      <TableCell>
                        <div className="font-medium">{e.description}</div>
                        {e.is_recurring && <Badge variant="outline" className="text-xs">recurring · {e.recurring_period}</Badge>}
                      </TableCell>
                      <TableCell><Badge variant="secondary">{e.category_name || "—"}</Badge></TableCell>
                      <TableCell className="text-xs uppercase">{e.payment_method}</TableCell>
                      <TableCell className="text-right font-medium">{formatAmount(Number(e.amount))}</TableCell>
                      <TableCell><Button size="icon" variant="ghost" onClick={() => del.mutate(e.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
</div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
