
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Phone, Smartphone } from "lucide-react";

interface MpesaPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  amount: number;
  customerName?: string;
}

export function MpesaPaymentDialog({
  open,
  onOpenChange,
  orderId,
  amount,
  customerName,
}: MpesaPaymentDialogProps) {
  const { currentOrg } = useOrg();
  const { formatAmount } = useCurrency();
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !phone) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("mpesa-stk-push", {
        body: {
          phone,
          amount,
          order_id: orderId,
          organization_id: currentOrg.id,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      setSent(true);
      toast({
        title: "STK Push Sent",
        description: "Check the customer's phone to complete payment.",
      });
    } catch (err: any) {
      toast({
        title: "Payment Failed",
        description: err.message || "Could not initiate M-Pesa payment",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSent(false);
    setPhone("");
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
            <div className="mx-auto w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
              <Phone className="h-8 w-8 text-success" />
            </div>
            <h3 className="font-semibold text-foreground">STK Push Sent!</h3>
            <p className="text-sm text-muted-foreground">
              A payment prompt has been sent to <strong>{phone}</strong>.
              <br />
              The customer should enter their M-Pesa PIN to complete the payment.
            </p>
            <p className="text-sm text-muted-foreground">
              The order will be automatically marked as completed once payment is confirmed.
            </p>
            <Button onClick={handleClose} variant="outline" className="mt-4">
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1">
              <p className="text-sm text-muted-foreground">
                {customerName ? `Customer: ${customerName}` : "Order Payment"}
              </p>
              <p className="text-lg font-bold text-foreground">
                {formatAmount(amount)}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="e.g. 0712345678 or 254712345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Enter the customer's Safaricom number
              </p>
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
