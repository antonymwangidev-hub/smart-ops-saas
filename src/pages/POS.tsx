import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
import {
  ShoppingCart, Plus, Minus, Trash2, Search, Banknote, Smartphone,
  Wifi, WifiOff, Check, ArrowLeft, CreditCard, Printer, MessageCircle, Percent,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { addToOfflineQueue, isOnline, isReachable, syncOfflineSales, getOfflineQueue, type OfflineSale } from "@/lib/offlineSync";

interface CartItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  stock: number;
  unit: string;
  tax_rate: number;
  discount_pct: number; // line-level discount %
}

type PaymentMethod = "cash" | "mpesa" | "mixed";
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
  const [mpesaAmount, setMpesaAmount] = useState("");
  const [isCredit, setIsCredit] = useState(false);
  const [creditName, setCreditName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderDiscount, setOrderDiscount] = useState(""); // flat amount off whole sale
  const [submitting, setSubmitting] = useState(false);
  const [mpesaState, setMpesaState] = useState<"idle" | "sending" | "waiting" | "confirmed" | "failed">("idle");
  const [mpesaCheckoutId, setMpesaCheckoutId] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<{
    total: number; subtotal: number; tax: number; discount: number;
    change: number; method: PaymentMethod; items: CartItem[]; phone: string;
    customer: string; ref: string;
  } | null>(null);
  const [online, setOnline] = useState(isOnline());
  const [pendingCount, setPendingCount] = useState(getOfflineQueue().length);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const recheck = async () => {
      const ok = await isReachable();
      setOnline(ok);
      if (ok) {
        const r = await syncOfflineSales();
        setPendingCount(getOfflineQueue().length);
        if (r.synced > 0) toast({ title: `Synced ${r.synced} offline sale${r.synced > 1 ? "s" : ""}` });
      }
    };
    const onOnline = () => { recheck(); };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    // Periodic reachability check (covers wifi <-> mobile data transitions silently)
    const interval = setInterval(recheck, 30000);
    recheck();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(interval);
    };
  }, [toast]);

  const { data: products = [] } = useQuery({
    queryKey: ["pos_products", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from("products")
        .select("id, name, price, stock_quantity, category, sku, is_active, low_stock_threshold, barcode, unit_of_measure, tax_rate" as any)
        .eq("organization_id", currentOrg.id)
        .eq("is_active", true)
        .order("name");
      return (data || []) as any[];
    },
    enabled: !!currentOrg,
  });

  // Barcode/SKU exact-match auto-add
  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !search) return;
    const q = search.trim().toLowerCase();
    const exact = products.find((p: any) =>
      (p.barcode && p.barcode.toLowerCase() === q) ||
      (p.sku && p.sku.toLowerCase() === q)
    );
    if (exact) {
      addToCart(exact);
      setSearch("");
    }
  };

  const filtered = useMemo(() => {
    if (!search) return products;
    const s = search.toLowerCase();
    return products.filter((p: any) =>
      p.name.toLowerCase().includes(s) ||
      p.category?.toLowerCase().includes(s) ||
      p.sku?.toLowerCase().includes(s) ||
      p.barcode?.toLowerCase().includes(s)
    );
  }, [products, search]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let lineDiscount = 0;
    let tax = 0;
    for (const i of cart) {
      const gross = i.price * i.quantity;
      const disc = gross * (i.discount_pct / 100);
      const net = gross - disc;
      subtotal += gross;
      lineDiscount += disc;
      tax += net * (i.tax_rate / 100);
    }
    const flatDisc = Math.min(parseFloat(orderDiscount) || 0, subtotal - lineDiscount);
    const total = Math.max(0, subtotal - lineDiscount - flatDisc + tax);
    return {
      subtotal,
      discount: lineDiscount + flatDisc,
      tax,
      total,
    };
  }, [cart, orderDiscount]);

  const cartTotal = totals.total;
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
      return [...prev, {
        product_id: product.id,
        name: product.name,
        price: Number(product.price),
        quantity: 1,
        stock: product.stock_quantity,
        unit: product.unit_of_measure || "pcs",
        tax_rate: Number(product.tax_rate) || 0,
        discount_pct: 0,
      }];
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

  const setLineDiscount = (productId: string, pct: number) => {
    setCart((prev) => prev.map((i) => i.product_id === productId ? { ...i, discount_pct: Math.max(0, Math.min(100, pct)) } : i));
  };

  const removeItem = useCallback((productId: string) => {
    setCart((prev) => prev.filter((i) => i.product_id !== productId));
  }, []);

  const completeSale = async () => {
    if (cart.length === 0) return;
    if (isCredit && !creditName.trim()) {
      toast({ title: "Enter customer name for credit sale", variant: "destructive" });
      return;
    }
    const received = parseFloat(cashReceived) || 0;
    const mpesaPaid = parseFloat(mpesaAmount) || 0;

    if (!isCredit) {
      if (paymentMethod === "cash" && received < cartTotal) {
        toast({ title: "Cash received is less than total", variant: "destructive" });
        return;
      }
      if (paymentMethod === "mixed" && (received + mpesaPaid + 0.001) < cartTotal) {
        toast({ title: "Cash + M-Pesa is less than total", variant: "destructive" });
        return;
      }
    }

    setSubmitting(true);
    const change = paymentMethod === "cash" && !isCredit ? Math.max(0, received - cartTotal) : 0;
    const persistedMethod: any = isCredit ? "credit" : paymentMethod;
    const persistedCash = paymentMethod === "cash" ? received : (paymentMethod === "mixed" ? received : 0);

    const noteParts: string[] = [];
    if (paymentMethod === "mixed") noteParts.push(`Mixed: cash ${received}, mpesa ${mpesaPaid}`);
    if (customerPhone) noteParts.push(`Phone: ${customerPhone}`);
    const noteStr = noteParts.length ? noteParts.join(" | ") : null;

    const saleData: OfflineSale & { subtotal?: number; discount_amount?: number; tax_amount?: number } = {
      id: crypto.randomUUID(),
      organization_id: currentOrg!.id,
      total_amount: cartTotal,
      payment_method: persistedMethod,
      cash_received: persistedCash,
      change_given: change,
      is_credit: isCredit,
      customer_name: isCredit ? creditName.trim() : (customerPhone ? (creditName.trim() || "Walk-in") : null),
      notes: noteStr,
      created_by: user?.id || null,
      created_at: new Date().toISOString(),
      subtotal: totals.subtotal,
      discount_amount: totals.discount,
      tax_amount: totals.tax,
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
            notes: saleData.notes,
            subtotal: totals.subtotal,
            discount_amount: totals.discount,
            tax_amount: totals.tax,
          } as any)
          .select("id")
          .single();
        if (saleErr) throw saleErr;

        await supabase.from("sale_items").insert(
          cart.map((i) => ({
            sale_id: saleRow.id,
            product_id: i.product_id,
            product_name: i.name,
            quantity: i.quantity,
            unit_price: i.price,
            organization_id: saleData.organization_id,
            discount_amount: (i.price * i.quantity) * (i.discount_pct / 100),
            tax_rate: i.tax_rate,
          })) as any
        );

        if (isCredit) {
          // Auto-create/find customer record in customers table
          let linkedCustomerId: string | null = null;
          try {
            const { data: existing } = await supabase
              .from("customers")
              .select("id")
              .eq("organization_id", saleData.organization_id)
              .ilike("name", creditName.trim())
              .maybeSingle();
            if (existing?.id) {
              linkedCustomerId = existing.id;
              if (customerPhone) {
                await supabase.from("customers").update({ phone: customerPhone } as any).eq("id", existing.id);
              }
            } else {
              const { data: created } = await supabase
                .from("customers")
                .insert({
                  organization_id: saleData.organization_id,
                  name: creditName.trim(),
                  phone: customerPhone || null,
                } as any)
                .select("id")
                .single();
              linkedCustomerId = created?.id || null;
            }
          } catch { /* non-fatal */ }

          await supabase.from("credit_sales").insert({
            organization_id: saleData.organization_id,
            customer_id: linkedCustomerId,
            customer_name: creditName.trim(),
            phone: customerPhone || null,
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

    setLastSale({
      total: cartTotal,
      subtotal: totals.subtotal,
      tax: totals.tax,
      discount: totals.discount,
      change,
      method: paymentMethod,
      items: [...cart],
      phone: customerPhone,
      customer: isCredit ? creditName.trim() : (creditName.trim() || "Walk-in"),
      ref: saleData.id.slice(0, 8).toUpperCase(),
    });
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
    setMpesaAmount("");
    setIsCredit(false);
    setCreditName("");
    setCustomerPhone("");
    setOrderDiscount("");
    setLastSale(null);
    setMpesaState("idle");
    setMpesaCheckoutId(null);
  };

  // Trigger M-Pesa STK push, then wait for callback via realtime
  const triggerMpesaSTK = async () => {
    if (!customerPhone.trim()) {
      toast({ title: "Enter customer phone", description: "M-Pesa needs the payer's number", variant: "destructive" });
      return;
    }
    if (!currentOrg) return;
    setMpesaState("sending");
    try {
      const { data, error } = await supabase.functions.invoke("mpesa-stk-push", {
        body: { phone: customerPhone, amount: cartTotal, organization_id: currentOrg.id },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "STK push failed");
      setMpesaCheckoutId(data.checkout_request_id);
      setMpesaState("waiting");
      toast({ title: "STK push sent", description: `Prompt sent to ${customerPhone}` });
    } catch (err: any) {
      setMpesaState("failed");
      toast({ title: "M-Pesa failed", description: err?.message || "Could not send prompt", variant: "destructive" });
    }
  };

  // Poll mpesa_payments while waiting (realtime is excluded for this table per security memo)
  useEffect(() => {
    if (mpesaState !== "waiting" || !mpesaCheckoutId) return;
    let cancelled = false;
    const poll = async () => {
      const { data } = await supabase
        .from("mpesa_payments")
        .select("status, result_desc")
        .eq("checkout_request_id", mpesaCheckoutId)
        .maybeSingle();
      if (cancelled) return;
      if ((data as any)?.status === "completed") {
        setMpesaState("confirmed");
        toast({ title: "Payment received", description: "M-Pesa confirmed" });
      } else if ((data as any)?.status === "failed") {
        setMpesaState("failed");
        toast({ title: "Payment failed", description: (data as any)?.result_desc || "Customer declined", variant: "destructive" });
      }
    };
    const id = setInterval(poll, 3000);
    poll();
    // safety timeout after 90s
    const stop = setTimeout(() => { if (!cancelled) clearInterval(id); }, 90000);
    return () => { cancelled = true; clearInterval(id); clearTimeout(stop); };
  }, [mpesaState, mpesaCheckoutId, toast]);


  const buildReceiptText = (s: typeof lastSale) => {
    if (!s) return "";
    const lines: string[] = [];
    lines.push(`*${currentOrg?.name || "Receipt"}*`);
    lines.push(`Ref: ${s.ref}`);
    lines.push(`Date: ${new Date().toLocaleString()}`);
    if (s.customer) lines.push(`Customer: ${s.customer}`);
    lines.push("");
    for (const i of s.items) {
      lines.push(`${i.name} x${i.quantity} @ ${i.price} = ${(i.price * i.quantity).toFixed(2)}`);
    }
    lines.push("");
    lines.push(`Subtotal: ${s.subtotal.toFixed(2)}`);
    if (s.discount > 0) lines.push(`Discount: -${s.discount.toFixed(2)}`);
    if (s.tax > 0) lines.push(`Tax: ${s.tax.toFixed(2)}`);
    lines.push(`*Total: ${s.total.toFixed(2)}*`);
    lines.push(`Paid via: ${s.method.toUpperCase()}`);
    if (s.change > 0) lines.push(`Change: ${s.change.toFixed(2)}`);
    lines.push("");
    lines.push("Thank you!");
    return lines.join("\n");
  };

  const handlePrint = () => window.print();

  const handleWhatsApp = () => {
    if (!lastSale) return;
    const phone = (lastSale.phone || "").replace(/[^\d]/g, "");
    if (!phone) {
      toast({ title: "No phone number for this sale", variant: "destructive" });
      return;
    }
    const normalized = phone.startsWith("0") ? "254" + phone.slice(1) : phone;
    const url = `https://wa.me/${normalized}?text=${encodeURIComponent(buildReceiptText(lastSale))}`;
    window.open(url, "_blank");
  };

  // ---- RENDER ----

  if (step === "complete" && lastSale) {
    return (
      <AppLayout>
        <div className="max-w-md mx-auto space-y-4 px-2">
          <div className="flex flex-col items-center gap-4 pt-4 print:hidden">
            <div className="h-20 w-20 rounded-full bg-success/20 flex items-center justify-center">
              <Check className="h-10 w-10 text-success" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Sale Complete!</h2>
            <div className="text-center space-y-1">
              <p className="text-3xl font-bold text-foreground">{formatAmount(lastSale.total)}</p>
              <Badge variant="outline" className="text-base px-3 py-1">
                {lastSale.method === "cash" ? "💵 Cash" : lastSale.method === "mpesa" ? "📱 M-Pesa" : "💵+📱 Mixed"}
              </Badge>
              {lastSale.change > 0 && (
                <p className="text-xl font-semibold text-success">Change: {formatAmount(lastSale.change)}</p>
              )}
            </div>
          </div>

          {/* Receipt (printable) */}
          <Card className="print-receipt print:shadow-none print:border-none">
            <CardContent className="p-4 text-sm font-mono">
              <div className="text-center font-bold">{currentOrg?.name}</div>
              <div className="text-center text-xs text-muted-foreground mb-2">Ref {lastSale.ref} · {new Date().toLocaleString()}</div>
              {lastSale.customer && <div className="text-xs">Customer: {lastSale.customer}</div>}
              <div className="border-t border-dashed my-2" />
              {lastSale.items.map((i) => (
                <div key={i.product_id} className="flex justify-between">
                  <span className="truncate pr-2">{i.name} x{i.quantity}</span>
                  <span>{formatAmount(i.price * i.quantity)}</span>
                </div>
              ))}
              <div className="border-t border-dashed my-2" />
              <div className="flex justify-between"><span>Subtotal</span><span>{formatAmount(lastSale.subtotal)}</span></div>
              {lastSale.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{formatAmount(lastSale.discount)}</span></div>}
              {lastSale.tax > 0 && <div className="flex justify-between"><span>Tax</span><span>{formatAmount(lastSale.tax)}</span></div>}
              <div className="flex justify-between font-bold text-base mt-1"><span>Total</span><span>{formatAmount(lastSale.total)}</span></div>
              <div className="text-center text-xs text-muted-foreground mt-3">Thank you!</div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 print:hidden">
            <Button variant="outline" onClick={handlePrint} className="h-12 gap-2"><Printer className="h-4 w-4" /> Print</Button>
            <Button variant="outline" onClick={handleWhatsApp} className="h-12 gap-2"><MessageCircle className="h-4 w-4" /> WhatsApp</Button>
          </div>

          <Button onClick={resetSale} size="lg" className="w-full h-14 text-lg print:hidden">
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

          <div className="text-center py-2 space-y-1">
            <p className="text-muted-foreground text-sm">Total</p>
            <p className="text-4xl font-bold text-foreground">{formatAmount(cartTotal)}</p>
            {(totals.discount > 0 || totals.tax > 0) && (
              <p className="text-xs text-muted-foreground">
                Sub {formatAmount(totals.subtotal)}
                {totals.discount > 0 && ` · Disc -${formatAmount(totals.discount)}`}
                {totals.tax > 0 && ` · Tax ${formatAmount(totals.tax)}`}
              </p>
            )}
          </div>

          {/* Payment method */}
          <div className="grid grid-cols-3 gap-2">
            <Button variant={paymentMethod === "cash" ? "default" : "outline"} className="h-14 gap-1" onClick={() => setPaymentMethod("cash")}>
              <Banknote className="h-4 w-4" /> Cash
            </Button>
            <Button variant={paymentMethod === "mpesa" ? "default" : "outline"} className="h-14 gap-1" onClick={() => setPaymentMethod("mpesa")}>
              <Smartphone className="h-4 w-4" /> M-Pesa
            </Button>
            <Button variant={paymentMethod === "mixed" ? "default" : "outline"} className="h-14 gap-1 text-xs" onClick={() => setPaymentMethod("mixed")}>
              Mixed
            </Button>
          </div>

          {/* Credit toggle */}
          <Button variant={isCredit ? "default" : "outline"} className="w-full h-12 gap-2" onClick={() => setIsCredit(!isCredit)}>
            <CreditCard className="h-4 w-4" /> {isCredit ? "Credit Sale (Deni) ✓" : "Credit Sale (Deni)"}
          </Button>

          {isCredit && (
            <Input placeholder="Customer name *" value={creditName} onChange={(e) => setCreditName(e.target.value)} className="h-12" autoFocus />
          )}

          <Input
            placeholder="Customer phone (for receipt, e.g. 0712345678)"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="h-12"
          />

          {!isCredit && paymentMethod === "cash" && (
            <div className="space-y-3">
              <Input type="number" placeholder="Cash received" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} className="h-14 text-xl text-center" />
              {parseFloat(cashReceived) >= cartTotal && (
                <div className="text-center p-3 rounded-xl bg-success/10">
                  <p className="text-sm text-muted-foreground">Change</p>
                  <p className="text-2xl font-bold text-success">{formatAmount(changeAmount)}</p>
                </div>
              )}
              <div className="grid grid-cols-4 gap-2">
                {[50, 100, 200, 500, 1000, 2000, 5000].map((amt) => (
                  <Button key={amt} variant="outline" size="sm" className="h-10" onClick={() => setCashReceived(String(amt))}>{amt}</Button>
                ))}
                <Button variant="outline" size="sm" className="h-10" onClick={() => setCashReceived(String(Math.ceil(cartTotal)))}>Exact</Button>
              </div>
            </div>
          )}

          {!isCredit && paymentMethod === "mpesa" && (
            <Card className="bg-success/5 border-success/20">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">Confirm M-Pesa payment received</p>
                <p className="text-lg font-semibold text-foreground mt-1">{formatAmount(cartTotal)}</p>
              </CardContent>
            </Card>
          )}

          {!isCredit && paymentMethod === "mixed" && (
            <div className="space-y-2">
              <Input type="number" placeholder="Cash portion" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} className="h-12" />
              <Input type="number" placeholder="M-Pesa portion" value={mpesaAmount} onChange={(e) => setMpesaAmount(e.target.value)} className="h-12" />
              <p className="text-xs text-muted-foreground text-center">
                Paid: {formatAmount((parseFloat(cashReceived) || 0) + (parseFloat(mpesaAmount) || 0))} / {formatAmount(cartTotal)}
              </p>
            </div>
          )}

          <Button
            onClick={completeSale}
            disabled={submitting ||
              (!isCredit && paymentMethod === "cash" && (parseFloat(cashReceived) || 0) < cartTotal) ||
              (!isCredit && paymentMethod === "mixed" && ((parseFloat(cashReceived) || 0) + (parseFloat(mpesaAmount) || 0)) < cartTotal)
            }
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
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">Point of Sale</h1>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && <Badge variant="secondary" className="text-xs">{pendingCount} pending</Badge>}
            {online ? <Wifi className="h-4 w-4 text-success" /> : <WifiOff className="h-4 w-4 text-destructive" />}
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            placeholder="Search or scan barcode / SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKey}
            className="pl-9 h-12 text-base"
          />
        </div>

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
                    {outOfStock ? "Out" : `${product.stock_quantity} ${product.unit_of_measure || ""}`}
                  </span>
                  {inCart && <Badge className="h-5 min-w-[20px] flex items-center justify-center text-xs">{inCart.quantity}</Badge>}
                </div>
              </button>
            );
          })}
        </div>
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">No products found</p>}

        {cart.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-3 shadow-lg z-50">
            <div className="max-w-screen-md mx-auto">
              <div className="max-h-56 overflow-y-auto space-y-2 mb-3">
                {cart.map((item) => (
                  <div key={item.product_id} className="space-y-1 pb-1 border-b border-border/40 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-foreground truncate flex-1">{item.name}</span>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.product_id, -1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.product_id, 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                        <span className="text-sm font-medium w-20 text-right">
                          {formatAmount(item.price * item.quantity * (1 - item.discount_pct / 100))}
                        </span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(item.product_id)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pl-1">
                      <Percent className="h-3 w-3 text-muted-foreground" />
                      <Input
                        type="number"
                        placeholder="Discount %"
                        value={item.discount_pct || ""}
                        onChange={(e) => setLineDiscount(item.product_id, parseFloat(e.target.value) || 0)}
                        className="h-6 w-20 text-xs"
                      />
                      {item.tax_rate > 0 && (
                        <span className="text-[10px] text-muted-foreground">Tax {item.tax_rate}%</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 mb-2">
                <Input
                  type="number"
                  placeholder="Order discount (flat amount)"
                  value={orderDiscount}
                  onChange={(e) => setOrderDiscount(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              {(totals.discount > 0 || totals.tax > 0) && (
                <div className="text-xs text-muted-foreground text-center mb-1">
                  Sub {formatAmount(totals.subtotal)}
                  {totals.discount > 0 && ` · Disc -${formatAmount(totals.discount)}`}
                  {totals.tax > 0 && ` · Tax ${formatAmount(totals.tax)}`}
                </div>
              )}

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
