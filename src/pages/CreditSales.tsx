import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CreditCard, Loader2, Check, Search, Plus } from "lucide-react";

export default function CreditSales() {
  const { currentOrg } = useOrg();
  const { formatAmount } = useCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [payDialog, setPayDialog] = useState<any>(null);
  const [payAmount, setPayAmount] = useState("");
  const [addDialog, setAddDialog] = useState(false);
  const [newDeni, setNewDeni] = useState({ customer_name: "", phone: "", total_amount: "", notes: "" });

  const { data: credits = [], isLoading } = useQuery({
    queryKey: ["credit_sales", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from("credit_sales")
        .select("*")
        .eq("organization_id", currentOrg.id)
        .order("is_settled", { ascending: true })
        .order("created_at", { ascending: false }) as any;
      return (data || []) as any[];
    },
    enabled: !!currentOrg,
  });

  const filtered = credits.filter((c: any) =>
    !search || c.customer_name?.toLowerCase().includes(search.toLowerCase())
  );

  const totalOwed = credits
    .filter((c: any) => !c.is_settled)
    .reduce((s: number, c: any) => s + (Number(c.total_amount) - Number(c.amount_paid)), 0);

  const recordPayment = useMutation({
    mutationFn: async () => {
      if (!payDialog) return;
      const amount = parseFloat(payAmount) || 0;
      if (amount <= 0) throw new Error("Enter a valid amount");
      const newPaid = Math.min(Number(payDialog.total_amount), Number(payDialog.amount_paid) + amount);
      const settled = newPaid >= Number(payDialog.total_amount);
      await supabase
        .from("credit_sales")
        .update({ amount_paid: newPaid, is_settled: settled } as any)
        .eq("id", payDialog.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit_sales"] });
      setPayDialog(null);
      setPayAmount("");
      toast({ title: "Payment recorded" });
    },
    onError: (err: any) => toast({ title: err.message, variant: "destructive" }),
  });

  const addCredit = useMutation({
    mutationFn: async () => {
      if (!currentOrg) throw new Error("No org");
      if (!newDeni.customer_name.trim()) throw new Error("Enter customer name");
      const amt = parseFloat(newDeni.total_amount) || 0;
      if (amt <= 0) throw new Error("Enter valid amount");
      await supabase.from("credit_sales").insert({
        organization_id: currentOrg.id,
        customer_name: newDeni.customer_name.trim(),
        phone: newDeni.phone.trim() || null,
        total_amount: amt,
        amount_paid: 0,
        notes: newDeni.notes.trim() || null,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit_sales"] });
      setAddDialog(false);
      setNewDeni({ customer_name: "", phone: "", total_amount: "", notes: "" });
      toast({ title: "Credit sale recorded" });
    },
    onError: (err: any) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <AppLayout>
      <div className="space-y-4 px-1">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Credit Sales (Deni)</h1>
            <p className="text-sm text-muted-foreground">Outstanding: {formatAmount(totalOwed)}</p>
          </div>
          <Button size="sm" onClick={() => setAddDialog(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search customer…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-11" />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No credit sales</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((credit: any) => {
              const owed = Number(credit.total_amount) - Number(credit.amount_paid);
              return (
                <Card key={credit.id} className={credit.is_settled ? "opacity-60" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">{credit.customer_name}</p>
                        {credit.phone && <p className="text-xs text-muted-foreground">{credit.phone}</p>}
                      </div>
                      {credit.is_settled ? (
                        <Badge variant="outline" className="bg-success/10 text-success">
                          <Check className="h-3 w-3 mr-1" /> Paid
                        </Badge>
                      ) : (
                        <div className="text-right">
                          <p className="text-lg font-bold text-destructive">{formatAmount(owed)}</p>
                          <p className="text-xs text-muted-foreground">of {formatAmount(credit.total_amount)}</p>
                        </div>
                      )}
                    </div>
                    {!credit.is_settled && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-3 h-10"
                        onClick={() => { setPayDialog(credit); setPayAmount(""); }}
                      >
                        Record Payment
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Payment dialog */}
      <Dialog open={!!payDialog} onOpenChange={(open) => !open && setPayDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          {payDialog && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {payDialog.customer_name} owes {formatAmount(Number(payDialog.total_amount) - Number(payDialog.amount_paid))}
              </p>
              <Input
                type="number"
                placeholder="Amount paid"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="h-14 text-xl text-center"
                autoFocus
              />
              <Button onClick={() => recordPayment.mutate()} className="w-full h-12" disabled={recordPayment.isPending}>
                {recordPayment.isPending ? "Saving…" : "Record Payment"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add credit dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Credit Sale</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Customer Name *</Label>
              <Input value={newDeni.customer_name} onChange={(e) => setNewDeni({ ...newDeni, customer_name: e.target.value })} className="h-12" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={newDeni.phone} onChange={(e) => setNewDeni({ ...newDeni, phone: e.target.value })} className="h-12" />
            </div>
            <div>
              <Label>Amount Owed *</Label>
              <Input type="number" value={newDeni.total_amount} onChange={(e) => setNewDeni({ ...newDeni, total_amount: e.target.value })} className="h-12 text-lg" />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={newDeni.notes} onChange={(e) => setNewDeni({ ...newDeni, notes: e.target.value })} className="h-12" />
            </div>
            <Button onClick={() => addCredit.mutate()} className="w-full h-12" disabled={addCredit.isPending}>
              {addCredit.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
