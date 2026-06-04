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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Loader2, DollarSign, MessageCircle, Phone } from "lucide-react";

function ageDays(d: string | null) {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

function bucket(days: number | null): "current" | "1-30" | "31-60" | "61-90" | "90+" {
  if (days === null || days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

const BUCKET_COLOR: Record<string, string> = {
  current: "bg-muted text-muted-foreground",
  "1-30": "bg-blue-500/10 text-blue-600",
  "31-60": "bg-amber-500/10 text-amber-600",
  "61-90": "bg-orange-500/10 text-orange-600",
  "90+": "bg-destructive/10 text-destructive",
};

export default function Debtors() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [payOpen, setPayOpen] = useState<any>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");

  const { data: debts = [], isLoading } = useQuery({
    queryKey: ["debtors", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await (supabase as any)
        .from("credit_sales")
        .select("*, credit_payments(id, amount, payment_date, payment_method)")
        .eq("organization_id", currentOrg.id)
        .eq("is_settled", false)
        .order("created_at", { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!currentOrg,
  });

  const recordPayment = useMutation({
    mutationFn: async () => {
      if (!payOpen) throw new Error("No debt");
      const amt = Number(payAmount);
      if (!amt || amt <= 0) throw new Error("Enter amount");
      const { error } = await (supabase as any).from("credit_payments").insert({
        organization_id: currentOrg!.id,
        credit_sale_id: payOpen.id,
        amount: amt, payment_method: payMethod,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Payment recorded" });
      qc.invalidateQueries({ queryKey: ["debtors"] });
      setPayOpen(null); setPayAmount(""); setPayMethod("cash");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const markReminderSent = useMutation({
    mutationFn: async (debt: any) => {
      const { error } = await (supabase as any).from("credit_sales").update({
        last_reminder_at: new Date().toISOString(),
        reminder_count: (debt.reminder_count || 0) + 1,
      }).eq("id", debt.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["debtors"] }),
  });

  const sendWhatsApp = (debt: any) => {
    if (!debt.phone) { toast({ title: "No phone", variant: "destructive" }); return; }
    const balance = Number(debt.total_amount) - Number(debt.amount_paid || 0);
    const msg = `Hi ${debt.customer_name}, friendly reminder: you have an outstanding balance of ${formatAmount(balance)} with ${currentOrg?.name}. Please settle when convenient. Thank you!`;
    const phone = debt.phone.replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
    markReminderSent.mutate(debt);
  };

  const sendSMS = (debt: any) => {
    if (!debt.phone) { toast({ title: "No phone", variant: "destructive" }); return; }
    const balance = Number(debt.total_amount) - Number(debt.amount_paid || 0);
    const msg = `Hi ${debt.customer_name}, reminder: balance of ${formatAmount(balance)} with ${currentOrg?.name}. Asante!`;
    window.open(`sms:${debt.phone}?body=${encodeURIComponent(msg)}`, "_blank");
    markReminderSent.mutate(debt);
  };

  const enriched = debts.map((d: any) => {
    const balance = Number(d.total_amount) - Number(d.amount_paid || 0);
    const days = ageDays(d.due_date || d.created_at);
    const overdueDays = d.due_date ? ageDays(d.due_date) : null;
    const b = bucket(overdueDays !== null ? overdueDays : days);
    return { ...d, balance, days, overdueDays, bucket: b };
  });

  const totals = enriched.reduce((acc: any, d: any) => {
    acc.total += d.balance;
    acc[d.bucket] = (acc[d.bucket] || 0) + d.balance;
    return acc;
  }, { total: 0, current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 });

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><AlertCircle className="h-6 w-6" /> Debtors</h1>
          <p className="text-sm text-muted-foreground">Aging report, payment tracking, and reminders</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Total AR</CardTitle></CardHeader><CardContent><div className="text-lg font-bold">{formatAmount(totals.total)}</div></CardContent></Card>
          {(["current", "1-30", "31-60", "61-90", "90+"] as const).map((k) => (
            <Card key={k}>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground uppercase">{k === "current" ? "Not due" : `${k} days`}</CardTitle></CardHeader>
              <CardContent><div className="text-lg font-bold">{formatAmount(totals[k] || 0)}</div></CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle>Outstanding Debts</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : enriched.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">All paid up! No outstanding debts.</p>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Customer</TableHead><TableHead>Phone</TableHead>
                  <TableHead>Due</TableHead><TableHead>Age</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Reminders</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {enriched.map((d: any) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.customer_name}</TableCell>
                      <TableCell className="text-xs">{d.phone || "—"}</TableCell>
                      <TableCell className="text-xs">{d.due_date || "—"}</TableCell>
                      <TableCell><Badge className={BUCKET_COLOR[d.bucket]}>{d.bucket === "current" ? "current" : `${d.bucket}d`}</Badge></TableCell>
                      <TableCell className="text-right">{formatAmount(Number(d.total_amount))}</TableCell>
                      <TableCell className="text-right">{formatAmount(Number(d.amount_paid || 0))}</TableCell>
                      <TableCell className="text-right font-bold text-destructive">{formatAmount(d.balance)}</TableCell>
                      <TableCell className="text-xs">{d.reminder_count || 0}</TableCell>
                      <TableCell className="space-x-1 whitespace-nowrap">
                        <Button size="sm" onClick={() => { setPayOpen(d); setPayAmount(String(d.balance)); }}>
                          <DollarSign className="h-3 w-3 mr-1" />Pay
                        </Button>
                        <Button size="icon" variant="outline" onClick={() => sendWhatsApp(d)} title="WhatsApp">
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="outline" onClick={() => sendSMS(d)} title="SMS">
                          <Phone className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!payOpen} onOpenChange={(o) => { if (!o) setPayOpen(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Record Payment — {payOpen?.customer_name}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Balance: <span className="font-bold text-destructive">{formatAmount(payOpen?.balance || 0)}</span>
              </div>
              <div><Label>Amount</Label><Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></div>
              <div>
                <Label>Method</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="mpesa">M-Pesa</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {payOpen?.credit_payments?.length > 0 && (
                <div>
                  <Label className="text-xs">Past payments</Label>
                  <div className="mt-1 space-y-1 max-h-32 overflow-y-auto text-xs">
                    {payOpen.credit_payments.map((p: any) => (
                      <div key={p.id} className="flex justify-between border rounded px-2 py-1">
                        <span>{p.payment_date} · {p.payment_method}</span>
                        <span className="font-medium">{formatAmount(Number(p.amount))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <Button className="w-full" onClick={() => recordPayment.mutate()} disabled={recordPayment.isPending}>
                {recordPayment.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Record Payment
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
