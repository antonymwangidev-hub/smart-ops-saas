import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Loader2, DollarSign, MessageCircle, Phone, User, Calendar } from "lucide-react";

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

const BUCKET_STYLE: Record<string, string> = {
  current:  "bg-muted text-muted-foreground border-muted",
  "1-30":   "bg-blue-500/10 text-blue-600 border-blue-200",
  "31-60":  "bg-amber-500/10 text-amber-600 border-amber-200",
  "61-90":  "bg-orange-500/10 text-orange-600 border-orange-200",
  "90+":    "bg-destructive/10 text-destructive border-destructive/20",
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
  const [search, setSearch] = useState("");

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
      if (!payOpen) throw new Error("No debt selected");
      const amt = Number(payAmount);
      if (!amt || amt <= 0) throw new Error("Enter a valid amount");
      const { error } = await (supabase as any).from("credit_payments").insert({
        organization_id: currentOrg!.id,
        credit_sale_id: payOpen.id,
        amount: amt,
        payment_method: payMethod,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Payment recorded ✓" });
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
    if (!debt.phone) { toast({ title: "No phone number saved", variant: "destructive" }); return; }
    const balance = Number(debt.total_amount) - Number(debt.amount_paid || 0);
    const msg = `Hi ${debt.customer_name}, friendly reminder: you have an outstanding balance of ${formatAmount(balance)} with ${currentOrg?.name}. Please settle when convenient. Asante!`;
    const phone = debt.phone.replace(/[^0-9]/g, "");
    const normalized = phone.startsWith("0") ? "254" + phone.slice(1) : phone;
    window.open(`https://wa.me/${normalized}?text=${encodeURIComponent(msg)}`, "_blank");
    markReminderSent.mutate(debt);
  };

  const sendSMS = (debt: any) => {
    if (!debt.phone) { toast({ title: "No phone number saved", variant: "destructive" }); return; }
    const balance = Number(debt.total_amount) - Number(debt.amount_paid || 0);
    const msg = `Hi ${debt.customer_name}, balance: ${formatAmount(balance)} with ${currentOrg?.name}. Asante!`;
    window.open(`sms:${debt.phone}?body=${encodeURIComponent(msg)}`, "_blank");
    markReminderSent.mutate(debt);
  };

  const enriched = debts
    .map((d: any) => {
      const balance = Number(d.total_amount) - Number(d.amount_paid || 0);
      const days = ageDays(d.due_date || d.created_at);
      const overdueDays = d.due_date ? ageDays(d.due_date) : null;
      const b = bucket(overdueDays !== null ? overdueDays : days);
      return { ...d, balance, days, overdueDays, bucket: b };
    })
    .filter((d: any) =>
      !search || d.customer_name?.toLowerCase().includes(search.toLowerCase())
    );

  const totals = debts.reduce(
    (acc: any, d: any) => {
      const balance = Number(d.total_amount) - Number(d.amount_paid || 0);
      acc.total += balance;
      return acc;
    },
    { total: 0 }
  );

  const overdueCt = enriched.filter((d: any) => d.bucket !== "current").length;

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" /> Deni (Credit)
          </h1>
          <p className="text-sm text-muted-foreground">Outstanding balances from customers</p>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="border-destructive/20 bg-destructive/5">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Owed</p>
              <p className="text-2xl font-bold text-destructive">{formatAmount(totals.total)}</p>
            </CardContent>
          </Card>
          <Card className={overdueCt > 0 ? "border-warning/30 bg-warning/5" : ""}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Overdue</p>
              <p className={`text-2xl font-bold ${overdueCt > 0 ? "text-warning" : "text-foreground"}`}>
                {overdueCt} customers
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by customer name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-11"
          />
        </div>

        {/* Card list — works great on mobile */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : enriched.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
              <p className="font-medium text-foreground">
                {search ? "No matching customers" : "All paid up!"}
              </p>
              <p className="text-sm text-muted-foreground">
                {search ? "Try a different name" : "No outstanding balances"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {enriched.map((d: any) => (
              <Card
                key={d.id}
                className={`${d.bucket !== "current" ? "border-l-4 border-l-destructive" : ""}`}
              >
                <CardContent className="p-4">
                  {/* Row 1: name + badge + balance */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground truncate text-base">
                        {d.customer_name}
                      </p>
                      {d.phone && (
                        <p className="text-sm text-muted-foreground">{d.phone}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xl font-bold text-destructive">
                        {formatAmount(d.balance)}
                      </p>
                      <Badge className={`text-[10px] border ${BUCKET_STYLE[d.bucket]}`}>
                        {d.bucket === "current" ? "Not due" : `${d.bucket} days`}
                      </Badge>
                    </div>
                  </div>

                  {/* Row 2: meta info */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                    <span>Total: {formatAmount(Number(d.total_amount))}</span>
                    <span>·</span>
                    <span>Paid: {formatAmount(Number(d.amount_paid || 0))}</span>
                    {d.reminder_count > 0 && (
                      <>
                        <span>·</span>
                        <span>{d.reminder_count} reminder{d.reminder_count > 1 ? "s" : ""} sent</span>
                      </>
                    )}
                  </div>

                  {/* Row 3: action buttons — full-width on mobile */}
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      size="sm"
                      className="h-10 gap-1.5 text-sm"
                      onClick={() => { setPayOpen(d); setPayAmount(String(d.balance)); }}
                    >
                      <DollarSign className="h-4 w-4" />
                      Pay
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10 gap-1.5 text-sm"
                      onClick={() => sendWhatsApp(d)}
                    >
                      <MessageCircle className="h-4 w-4" />
                      WhatsApp
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10 gap-1.5 text-sm"
                      onClick={() => sendSMS(d)}
                    >
                      <Phone className="h-4 w-4" />
                      SMS
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Payment dialog */}
      <Dialog open={!!payOpen} onOpenChange={(o) => { if (!o) { setPayOpen(null); setPayAmount(""); } }}>
        <DialogContent className="w-[95vw] max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl bg-muted/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">{payOpen?.customer_name}</p>
              <p className="text-3xl font-bold text-destructive mt-1">
                {formatAmount(payOpen?.balance || 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">outstanding balance</p>
            </div>

            <div>
              <Label className="text-sm font-medium">Amount Received (KES)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="h-14 text-xl text-center mt-1 font-bold"
                placeholder="0"
                autoFocus
              />
            </div>

            {/* Quick amount buttons */}
            <div className="grid grid-cols-4 gap-2">
              {[100, 200, 500, 1000].map((amt) => (
                <Button
                  key={amt}
                  variant="outline"
                  size="sm"
                  className="h-10"
                  onClick={() => setPayAmount(String(amt))}
                >
                  {amt}
                </Button>
              ))}
            </div>

            <div>
              <Label className="text-sm font-medium">Payment Method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger className="h-12 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">💵 Cash</SelectItem>
                  <SelectItem value="mpesa">📱 M-Pesa</SelectItem>
                  <SelectItem value="bank">🏦 Bank</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {payOpen?.credit_payments?.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground">Previous payments</Label>
                <div className="mt-1 space-y-1 max-h-28 overflow-y-auto">
                  {payOpen.credit_payments.map((p: any) => (
                    <div key={p.id} className="flex justify-between text-xs border rounded-lg px-3 py-2">
                      <span className="text-muted-foreground">
                        {new Date(p.payment_date).toLocaleDateString("en-KE")} · {p.payment_method}
                      </span>
                      <span className="font-medium text-success">{formatAmount(Number(p.amount))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button
              className="w-full h-14 text-base font-semibold rounded-xl"
              onClick={() => recordPayment.mutate()}
              disabled={recordPayment.isPending || !payAmount || Number(payAmount) <= 0}
            >
              {recordPayment.isPending
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : `Record ${payAmount ? formatAmount(Number(payAmount)) : ""} Payment`
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
