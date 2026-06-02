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
import { useToast } from "@/hooks/use-toast";
import { Undo2, Plus, Loader2 } from "lucide-react";

export default function Returns() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [saleId, setSaleId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});

  // Recent sales for return selection
  const { data: sales = [] } = useQuery({
    queryKey: ["sales_for_returns", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from("sales")
        .select("id, total_amount, customer_name, created_at, payment_method" as any)
        .eq("organization_id", currentOrg.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data || []) as any[];
    },
    enabled: !!currentOrg,
  });

  const { data: saleItems = [] } = useQuery({
    queryKey: ["sale_items_for_return", saleId],
    queryFn: async () => {
      if (!saleId) return [];
      const { data } = await supabase
        .from("sale_items")
        .select("id, product_id, product_name, quantity, unit_price")
        .eq("sale_id", saleId);
      return (data || []) as any[];
    },
    enabled: !!saleId,
  });

  // Past returns
  const { data: returns = [] } = useQuery({
    queryKey: ["sale_returns", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from("sale_returns" as any)
        .select("*")
        .eq("organization_id", currentOrg.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data || []) as any[];
    },
    enabled: !!currentOrg,
  });

  const refundAmount = saleItems.reduce((sum: number, i: any) => {
    const q = returnQty[i.id] || 0;
    return sum + (q * Number(i.unit_price));
  }, 0);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrg) throw new Error("No org");
      const items = saleItems
        .map((i: any) => ({ ...i, qty: returnQty[i.id] || 0 }))
        .filter((i: any) => i.qty > 0 && i.qty <= i.quantity);
      if (items.length === 0) throw new Error("Select at least one item to return");

      const { data: ret, error: e1 } = await supabase
        .from("sale_returns" as any)
        .insert({
          organization_id: currentOrg.id,
          sale_id: saleId || null,
          reason: reason || null,
          refund_amount: refundAmount,
          refund_method: refundMethod,
          processed_by: user?.id || null,
        } as any)
        .select("id")
        .single();
      if (e1) throw e1;

      const { error: e2 } = await supabase.from("sale_return_items" as any).insert(
        items.map((i: any) => ({
          organization_id: currentOrg.id,
          sale_return_id: (ret as any).id,
          product_id: i.product_id,
          product_name: i.product_name,
          quantity: i.qty,
          unit_price: i.unit_price,
        })) as any
      );
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast({ title: "Return recorded", description: "Stock restored automatically" });
      qc.invalidateQueries({ queryKey: ["sale_returns"] });
      qc.invalidateQueries({ queryKey: ["pos_products"] });
      setOpen(false);
      setSaleId("");
      setReason("");
      setReturnQty({});
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Returns & Refunds</h1>
            <p className="text-muted-foreground">Record returned items — stock is restored automatically</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> New Return</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Record a Return</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Original sale</Label>
                  <Select value={saleId} onValueChange={setSaleId}>
                    <SelectTrigger><SelectValue placeholder="Choose recent sale" /></SelectTrigger>
                    <SelectContent>
                      {sales.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>
                          {new Date(s.created_at).toLocaleDateString()} · {formatAmount(s.total_amount)} · {s.customer_name || "Walk-in"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {saleId && saleItems.length > 0 && (
                  <div className="space-y-2">
                    <Label>Items to return</Label>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {saleItems.map((i: any) => (
                        <div key={i.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-border">
                          <div className="flex-1">
                            <p className="text-sm font-medium">{i.product_name}</p>
                            <p className="text-xs text-muted-foreground">{i.quantity} sold @ {formatAmount(i.unit_price)}</p>
                          </div>
                          <Input
                            type="number"
                            min={0}
                            max={i.quantity}
                            value={returnQty[i.id] || ""}
                            onChange={(e) => setReturnQty({ ...returnQty, [i.id]: parseInt(e.target.value) || 0 })}
                            className="w-20 h-9"
                            placeholder="Qty"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Reason</Label>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Defective, wrong item, customer changed mind…" />
                </div>

                <div className="space-y-2">
                  <Label>Refund method</Label>
                  <Select value={refundMethod} onValueChange={setRefundMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="mpesa">M-Pesa</SelectItem>
                      <SelectItem value="exchange">Exchange / Store credit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                  <span className="text-sm text-muted-foreground">Refund total</span>
                  <span className="text-lg font-bold">{formatAmount(refundAmount)}</span>
                </div>

                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || refundAmount <= 0} className="w-full h-12">
                  {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Confirm Return
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Undo2 className="h-5 w-5" /> Recent Returns</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {returns.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-6">No returns yet</p>
            ) : returns.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div>
                  <p className="text-sm font-medium">{r.reason || "Return"}</p>
                  <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()} · {r.refund_method}</p>
                </div>
                <Badge variant="outline" className="text-base">{formatAmount(r.refund_amount)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
