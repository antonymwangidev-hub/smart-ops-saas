import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Phone, Smartphone, CheckCircle2, XCircle } from "lucide-react";

interface MpesaPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  amount: number;
  customerName?: string;
}

export function MpesaPaymentDialog({ open, onOpenChange, orderId, amount, customerName }: MpesaPaymentDialogProps) {
  const { currentOrg } = useOrg();
  const { formatAmount } = useCurrency();
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"waiting" | "completed" | "failed">("waiting");

  // Subscribe to realtime payment status after STK push
  useEffect(() => {
    if (!sent || !orderId) return;

    const channel = supabase
      .channel(`mpesa-payment-${orderId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "mpesa_payments",
        filter: `order_id=eq.${orderId}`,
      }, (payload) => {
        const newStatus = (payload.new as any).status;
        if (newStatus === "completed") {
          setPaymentStatus("completed");
          toast({ title: "Payment Confirmed", description: "M-Pesa payment received successfully!" });
        } else if (newStatus === "failed") {
          setPaymentStatus("failed");
          toast({ title: "Payment Failed", description: (payload.new as any).result_desc || "Payment was not completed", variant: "destructive" });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sent, orderId, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !phone) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("mpesa-stk-push", {
        body: { phone, amount, order_id: orderId, organization_id: currentOrg.id },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      setSent(true);
      setPaymentStatus("waiting");
    } catch (err: any) {
      toast({ title: "Payment Failed", description: err.message || "Could not initiate M-Pesa payment", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSent(false);
    setPhone("");
    setPaymentStatus("waiting");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            M-Pesa Payment
          </DialogTitle>
        </DialogHeader>

        {sent ? (
          <div className="text-center py-6 space-y-3">
            {paymentStatus === "completed" ? (
              <>
                <div className="mx-auto w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-success" />
                </div>
                <h3 className="font-semibold text-foreground">Payment Confirmed!</h3>
                <p className="text-sm text-muted-foreground">M-Pesa payment of {formatAmount(amount)} has been received.</p>
              </>
            ) : paymentStatus === "failed" ? (
              <>
                <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                  <XCircle className="h-8 w-8 text-destructive" />
                </div>
                <h3 className="font-semibold text-foreground">Payment Failed</h3>
                <p className="text-sm text-muted-foreground">The payment was not completed. Please try again.</p>
              </>
            ) : (
              <>
                <div className="mx-auto w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 text-warning animate-spin" />
                </div>
                <h3 className="font-semibold text-foreground">Waiting for Payment…</h3>
                <p className="text-sm text-muted-foreground">
                  A payment prompt has been sent to <strong>{phone}</strong>.
                  <br />The customer should enter their M-Pesa PIN to complete the payment.
                </p>
              </>
            )}
            <Button onClick={handleClose} variant="outline" className="mt-4">Close</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1">
              <p className="text-sm text-muted-foreground">{customerName ? `Customer: ${customerName}` : "Order Payment"}</p>
              <p className="text-lg font-bold text-foreground">{formatAmount(amount)}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input id="phone" type="tel" placeholder="e.g. 0712345678 or 254712345678" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              <p className="text-xs text-muted-foreground">Enter the customer's Safaricom number</p>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send M-Pesa Prompt
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
