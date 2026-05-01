import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ShoppingCart, Plus, Minus, Trash2, Search, Banknote, Smartphone,
  Wifi, WifiOff, Check, ArrowLeft, CreditCard,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { addToOfflineQueue, isOnline, syncOfflineSales, getOfflineQueue, type OfflineSale } from "@/lib/offlineSync";

interface CartItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  stock: number;
}

type PaymentMethod = "cash" | "mpesa";
type CheckoutStep = "cart" | "payment" | "complete";

export default function POS() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [step, setStep] = useState<CheckoutStep>("cart");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [isCredit, setIsCredit] = useState(false);
  const [creditName, setCreditName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastSale, setLastSale] = useState<{ total: number; change: number; method: PaymentMethod } | null>(null);
  const [online, setOnline] = useState(isOnline());
  const [pendingCount, setPendingCount] = useState(getOfflineQueue().length);

  useEffect(() => {
    const onOnline = () => { setOnline(true); syncOfflineSales().then(() => setPendingCount(getOfflineQueue().length)); };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

  const { data: products = [] } = useQuery({
    queryKey: ["pos_products", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from("products")
        .select("id, name, price, stock_quantity, category, is_active, low_stock_threshold")
        .eq("organization_id", currentOrg.id)
        .eq("is_active", true)
        .order("name");
      return (data || []) as any[];
    },
    enabled: !!currentOrg,
  });

  const filtered = useMemo(() => {
    if (!search) return products;
    const s = search.toLowerCase();
    return products.filter((p: any) => p.name.toLowerCase().includes(s) || p.category?.toLowerCase().includes(s));
  }, [products, search]);

  const cartTotal = useMemo(() => cart.reduce((sum, i) => sum + i.price * i.quantity, 0), [cart]);
  const changeAmount = useMemo(() => {
    const received = parseFloat(cashReceived) || 0;
    return Math.max(0, received - cartTotal);
  }, [cashReceived, cartTotal]);

  const addToCart = useCallback((product: any) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock_quantity) return prev;
        return prev.map((i) => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      if (product.stock_quantity <= 0) return prev;
      return [...prev, { product_id: product.id, name: product.name, price: product.price, quantity: 1, stock: product.stock_quantity }];
    });
  }, []);

  const updateQty = useCallback((productId: string, delta: number) => {
    setCart((prev) => prev.map((i) => {
      if (i.product_id !== productId) return i;
      const newQty = i.quantity + delta;
      if (newQty <= 0) return i;
      if (newQty > i.stock) return i;
      return { ...i, quantity: newQty };
    }));
  }, []);

  const removeItem = useCallback((productId: string) => {
    setCart((prev) => prev.filter((i) => i.product_id !== productId));
  }, []);

  const completeSale = async () => {
    if (cart.length === 0) return;
    if (isCredit && !creditName.trim()) {
      toast({ title: "Enter customer name for credit sale", variant: "destructive" });
      return;
    }
    if (paymentMethod === "cash" && !isCredit) {
      const received = parseFloat(cashReceived) || 0;
      if (received < cartTotal) {
        toast({ title: "Cash received is less than total", variant: "destructive" });
        return;
      }
    }

    setSubmitting(true);
    const received = parseFloat(cashReceived) || 0;
    const change = paymentMethod === "cash" && !isCredit ? Math.max(0, received - cartTotal) : 0;

    const saleData: OfflineSale = {
      id: crypto.randomUUID(),
      organization_id: currentOrg!.id,
      total_amount: cartTotal,
      payment_method: paymentMethod,
      cash_received: paymentMethod === "cash" ? received : 0,
      change_given: change,
      is_credit: isCredit,
      customer_name: isCredit ? creditName.trim() : null,
      notes: null,
      created_by: user?.id || null,
      created_at: new Date().toISOString(),
      items: cart.map((i) => ({
        product_id: i.product_id,
        product_name: i.name,
        quantity: i.quantity,
        unit_price: i.price,
      })),
    };

    if (online) {
      try {
        const { data: saleRow, error: saleErr } = await supabase
          .from("sales")
          .insert({
            organization_id: saleData.organization_id,
            total_amount: saleData.total_amount,
            payment_method: saleData.payment_method,
            cash_received: saleData.cash_received,
            change_given: saleData.change_given,
            is_credit: saleData.is_credit,
            customer_name: saleData.customer_name,
            created_by: saleData.created_by,
          } as any)
          .select("id")
          .single();
        if (saleErr) throw saleErr;

        await supabase.from("sale_items").insert(
          saleData.items.map((item) => ({
            sale_id: saleRow.id,
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            organization_id: saleData.organization_id,
          })) as any
        );

        if (isCredit) {
          await supabase.from("credit_sales").insert({
            organization_id: saleData.organization_id,
            customer_name: creditName.trim(),
            total_amount: cartTotal,
            amount_paid: 0,
            sale_id: saleRow.id,
          } as any);
        }
      } catch (err: any) {
        addToOfflineQueue(saleData);
        setPendingCount(getOfflineQueue().length);
        toast({ title: "Saved offline", description: "Will sync when connected" });
      }
    } else {
      addToOfflineQueue(saleData);
      setPendingCount(getOfflineQueue().length);
      toast({ title: "Saved offline", description: "Will sync when connected" });
    }

    setLastSale({ total: cartTotal, change, method: paymentMethod });
    setStep("complete");
    queryClient.invalidateQueries({ queryKey: ["pos_products"] });
    queryClient.invalidateQueries({ queryKey: ["daily_summary"] });
    setSubmitting(false);
  };

  const resetSale = () => {
    setCart([]);
    setSearch("");
    setStep("cart");
    setPaymentMethod("cash");
    setCashReceived("");
    setIsCredit(false);
    setCreditName("");
    setLastSale(null);
  };

  // ---- RENDER ----

  if (step === "complete" && lastSale) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6 px-4">
          <div className="h-20 w-20 rounded-full bg-success/20 flex items-center justify-center">
            <Check className="h-10 w-10 text-success" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Sale Complete!</h2>
          <div className="text-center space-y-2">
            <p className="text-3xl font-bold text-foreground">{formatAmount(lastSale.total)}</p>
            <Badge variant="outline" className="text-base px-3 py-1">
              {lastSale.method === "cash" ? "💵 Cash" : "📱 M-Pesa"}
            </Badge>
            {lastSale.method === "cash" && lastSale.change > 0 && (
              <p className="text-xl font-semibold text-success">Change: {formatAmount(lastSale.change)}</p>
            )}
          </div>
          <Button onClick={resetSale} size="lg" className="w-full max-w-xs h-14 text-lg">
            New Sale
          </Button>
        </div>
      </AppLayout>
    );
  }

  if (step === "payment") {
    return (
      <AppLayout>
        <div className="max-w-md mx-auto space-y-4 px-2">
          <Button variant="ghost" onClick={() => setStep("cart")} className="gap-2 mb-2">
            <ArrowLeft className="h-4 w-4" /> Back to cart
          </Button>

          <div className="text-center py-4">
            <p className="text-muted-foreground text-sm">Total</p>
            <p className="text-4xl font-bold text-foreground">{formatAmount(cartTotal)}</p>
          </div>

          {/* Payment method */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant={paymentMethod === "cash" ? "default" : "outline"}
              className="h-16 text-lg gap-2"
              onClick={() => setPaymentMethod("cash")}
            >
              <Banknote className="h-5 w-5" /> Cash
            </Button>
            <Button
              variant={paymentMethod === "mpesa" ? "default" : "outline"}
              className="h-16 text-lg gap-2"
              onClick={() => setPaymentMethod("mpesa")}
            >
              <Smartphone className="h-5 w-5" /> M-Pesa
            </Button>
          </div>

          {/* Credit toggle */}
          <Button
            variant={isCredit ? "default" : "outline"}
            className="w-full h-14 text-base gap-2"
            onClick={() => setIsCredit(!isCredit)}
          >
            <CreditCard className="h-5 w-5" /> {isCredit ? "Credit Sale (Deni) ✓" : "Credit Sale (Deni)"}
          </Button>

          {isCredit && (
            <Input
              placeholder="Customer name"
              value={creditName}
              onChange={(e) => setCreditName(e.target.value)}
              className="h-14 text-lg"
              autoFocus
            />
          )}

          {paymentMethod === "cash" && !isCredit && (
            <div className="space-y-3">
              <Input
                type="number"
                placeholder="Cash received"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                className="h-14 text-xl text-center"
                autoFocus
              />
              {parseFloat(cashReceived) >= cartTotal && (
                <div className="text-center p-3 rounded-xl bg-success/10">
                  <p className="text-sm text-muted-foreground">Change</p>
                  <p className="text-2xl font-bold text-success">{formatAmount(changeAmount)}</p>
                </div>
              )}
              {/* Quick cash buttons */}
              <div className="grid grid-cols-4 gap-2">
                {[50, 100, 200, 500, 1000, 2000, 5000].map((amt) => (
                  <Button
                    key={amt}
                    variant="outline"
                    size="sm"
                    className="h-10"
                    onClick={() => setCashReceived(String(amt))}
                  >
                    {amt}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10"
                  onClick={() => setCashReceived(String(Math.ceil(cartTotal)))}
                >
                  Exact
                </Button>
              </div>
            </div>
          )}

          {paymentMethod === "mpesa" && !isCredit && (
            <Card className="bg-success/5 border-success/20">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">Confirm M-Pesa payment received from customer</p>
                <p className="text-lg font-semibold text-foreground mt-1">{formatAmount(cartTotal)}</p>
              </CardContent>
            </Card>
          )}

          <Button
            onClick={completeSale}
            disabled={submitting || (paymentMethod === "cash" && !isCredit && (parseFloat(cashReceived) || 0) < cartTotal)}
            size="lg"
            className="w-full h-16 text-xl"
          >
            {submitting ? "Processing…" : `Complete Sale`}
          </Button>
        </div>
      </AppLayout>
    );
  }

  // Cart / product selection view
  return (
    <AppLayout>
      <div className="space-y-4 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">Point of Sale</h1>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <Badge variant="secondary" className="text-xs">{pendingCount} pending</Badge>
            )}
            {online ? (
              <Wifi className="h-4 w-4 text-success" />
            ) : (
              <WifiOff className="h-4 w-4 text-destructive" />
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-12 text-base"
          />
        </div>

        {/* Product grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {filtered.map((product: any) => {
            const inCart = cart.find((i) => i.product_id === product.id);
            const isLow = product.stock_quantity <= product.low_stock_threshold;
            const outOfStock = product.stock_quantity <= 0;

            return (
              <button
                key={product.id}
                onClick={() => !outOfStock && addToCart(product)}
                disabled={outOfStock}
                className={`relative p-3 rounded-xl border text-left transition-all active:scale-95 ${
                  inCart ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/50"
                } ${outOfStock ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <p className="font-medium text-foreground text-sm truncate">{product.name}</p>
                <p className="text-primary font-bold text-base mt-1">{formatAmount(product.price)}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className={`text-xs ${isLow ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                    {outOfStock ? "Out of stock" : `${product.stock_quantity} left`}
                  </span>
                  {inCart && (
                    <Badge className="h-5 min-w-[20px] flex items-center justify-center text-xs">
                      {inCart.quantity}
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-8">No products found</p>
        )}

        {/* Floating cart bar */}
        {cart.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-3 shadow-lg z-50">
            <div className="max-w-screen-md mx-auto">
              {/* Mini cart items */}
              <div className="max-h-40 overflow-y-auto space-y-2 mb-3">
                {cart.map((item) => (
                  <div key={item.product_id} className="flex items-center justify-between">
                    <span className="text-sm text-foreground truncate flex-1">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.product_id, -1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.product_id, 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                      <span className="text-sm font-medium w-20 text-right">{formatAmount(item.price * item.quantity)}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(item.product_id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button onClick={() => setStep("payment")} className="w-full h-14 text-lg gap-2">
                <ShoppingCart className="h-5 w-5" />
                Charge {formatAmount(cartTotal)} ({cart.reduce((s, i) => s + i.quantity, 0)} items)
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
