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
  Wifi, WifiOff, Check, ArrowLeft, CreditCard, Printer, MessageCircle,
  Percent, RefreshCw, AlertTriangle,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import {
  addToOfflineQueue, isOnline, isReachable, syncOfflineSales,
  getOfflineQueue, retryFailedSale, discardOfflineSale,
  getAllOfflineSales, type OfflineSale,
} from "@/lib/offlineSync";

interface CartItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  stock: number;
  unit: string;
  tax_rate: number;
  discount_pct: number;
}

type PaymentMethod = "cash" | "mpesa" | "mixed";
type CheckoutStep = "cart" | "payment" | "complete" | "pending_audit";

// ── 80mm thermal receipt print styles ─────────────────────────────────
const PRINT_STYLE = `
@media print {
  @page { size: 80mm auto; margin: 4mm; }
  body > *:not(.print-receipt-root) { display: none !important; }
  .print-receipt-root { display: block !important; font-family: monospace; font-size: 11px; width: 72mm; }
  .no-print { display: none !important; }
}
`;

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
  const [orderDiscount, setOrderDiscount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastSale, setLastSale] = useState<{
    total: number; subtotal: number; tax: number; discount: number;
    change: number; method: PaymentMethod; items: CartItem[]; phone: string;
    customer: string; ref: string;
  } | null>(null);
  const [online, setOnline] = useState(isOnline());
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingSales, setPendingSales] = useState<OfflineSale[]>([]);
  const [syncing, setSyncing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Refresh pending count from IndexedDB
  const refreshPending = useCallback(async () => {
    const q = await getOfflineQueue();
    setPendingCount(q.length);
    const all = await getAllOfflineSales();
    setPendingSales(all.filter(s => s.sync_status === "pending" || s.sync_status === "failed"));
  }, []);

  useEffect(() => {
    refreshPending();
    const recheck = async () => {
      const ok = await isReachable();
      setOnline(ok);
      if (ok) {
        const r = await syncOfflineSales();
        await refreshPending();
        if (r.synced > 0) toast({ title: `✅ Synced ${r.synced} offline sale${r.synced > 1 ? "s" : ""}` });
      }
    };
    window.addEventListener("online", recheck);
    window.addEventListener("offline", () => setOnline(false));
    const interval = setInterval(recheck, 30000);
    recheck();
    return () => {
      window.removeEventListener("online", recheck);
      window.removeEventListener("offline", () => setOnline(false));
      clearInterval(interval);
    };
  }, [toast, refreshPending]);

  const handleManualSync = async () => {
    setSyncing(true);
    const r = await syncOfflineSales();
    await refreshPending();
    setSyncing(false);
    toast({ title: r.synced > 0 ? `Synced ${r.synced} sale(s)` : "Nothing to sync" });
  };

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

  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !search) return;
    const q = search.trim().toLowerCase();
    const exact = products.find((p: any) =>
      (p.barcode && p.barcode.toLowerCase() === q) ||
      (p.sku && p.sku.toLowerCase() === q)
    );
    if (exact) { addToCart(exact); setSearch(""); }
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
    let subtotal = 0, lineDiscount = 0, tax = 0;
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
    return { subtotal, discount: lineDiscount + flatDisc, tax, total };
  }, [cart, orderDiscount]);

  const changeAmount = useMemo(() => {
    return Math.max(0, (parseFloat(cashReceived) || 0) - totals.total);
  }, [cashReceived, totals.total]);

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
      if (newQty <= 0 || newQty > i.stock) return i;
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
    if (!isCredit && paymentMethod === "cash" && received < totals.total) {
      toast({ title: "Cash received is less than total", variant: "destructive" });
      return;
    }
    if (!isCredit && paymentMethod === "mixed" && (received + mpesaPaid) < totals.total) {
      toast({ title: "Payment is less than total", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    const change = paymentMethod === "cash" ? changeAmount : 0;

    const saleData: OfflineSale = {
      id: crypto.randomUUID(),
      organization_id: currentOrg!.id,
      total_amount: totals.total,
      payment_method: isCredit ? "credit" : paymentMethod,
      cash_received: paymentMethod === "mixed" ? received : received,
      change_given: change,
      is_credit: isCredit,
      customer_name: isCredit ? creditName.trim() : (creditName.trim() || null),
      notes: null,
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

    const reachable = await isReachable();

    if (reachable) {
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
            notes: saleData.notes,
            created_by: saleData.created_by,
            subtotal: saleData.subtotal,
            discount_amount: saleData.discount_amount,
            tax_amount: saleData.tax_amount,
          } as any)
          .select("id")
          .single();
        if (saleErr) throw saleErr;

        if (cart.length > 0) {
          await supabase.from("sale_items").insert(
            cart.map((item) => ({
              sale_id: saleRow.id,
              product_id: item.product_id,
              product_name: item.name,
              quantity: item.quantity,
              unit_price: item.price,
              organization_id: currentOrg!.id,
            })) as any
          );
        }

        // Decrement stock
        for (const item of cart) {
          const { data: prod } = await supabase.from("products").select("stock_quantity").eq("id", item.product_id).single();
          if (prod) {
            const newQty = Math.max(0, (prod as any).stock_quantity - item.quantity);
            await supabase.from("products").update({ stock_quantity: newQty } as any).eq("id", item.product_id);
          }
        }

        if (isCredit) {
          let linkedCustomerId: string | null = null;
          try {
            const { data: existing } = await supabase.from("customers").select("id").eq("organization_id", saleData.organization_id).ilike("name", creditName.trim()).maybeSingle();
            if (existing?.id) {
              linkedCustomerId = existing.id;
              if (customerPhone) await supabase.from("customers").update({ phone: customerPhone } as any).eq("id", existing.id);
            } else {
              const { data: created } = await supabase.from("customers").insert({ organization_id: saleData.organization_id, name: creditName.trim(), phone: customerPhone || null } as any).select("id").single();
              linkedCustomerId = created?.id || null;
            }
          } catch { /* non-fatal */ }
          await supabase.from("credit_sales").insert({ organization_id: saleData.organization_id, customer_id: linkedCustomerId, customer_name: creditName.trim(), phone: customerPhone || null, total_amount: totals.total, amount_paid: 0, sale_id: saleRow.id } as any);
        }
      } catch (err: any) {
        await addToOfflineQueue(saleData);
        await refreshPending();
        toast({ title: "Saved offline", description: "Will sync when connected" });
      }
    } else {
      await addToOfflineQueue(saleData);
      await refreshPending();
      toast({ title: "Saved offline", description: "Will sync when connected" });
    }

    setLastSale({
      total: totals.total,
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
    queryClient.invalidateQueries({ queryKey: ["dashboard_v2"] });
    setSubmitting(false);
  };

  const resetSale = () => {
    setCart([]); setSearch(""); setStep("cart"); setPaymentMethod("cash");
    setCashReceived(""); setMpesaAmount(""); setIsCredit(false); setCreditName("");
    setCustomerPhone(""); setOrderDiscount(""); setLastSale(null);
  };

  const buildReceiptText = (s: typeof lastSale) => {
    if (!s) return "";
    const w = (left: string, right: string, width = 32) => {
      const gap = width - left.length - right.length;
      return left + " ".repeat(Math.max(1, gap)) + right;
    };
    const lines: string[] = [
      currentOrg?.name?.toUpperCase() || "RECEIPT",
      "================================",
      `Ref: ${s.ref}`,
      `Date: ${new Date().toLocaleString("en-KE")}`,
      s.customer ? `Customer: ${s.customer}` : "",
      "--------------------------------",
      ...s.items.map((i) => w(`${i.name} x${i.quantity}`, `${(i.price * i.quantity).toFixed(2)}`)),
      "--------------------------------",
      w("Subtotal", s.subtotal.toFixed(2)),
      s.discount > 0 ? w("Discount", `-${s.discount.toFixed(2)}`) : "",
      s.tax > 0 ? w("Tax", s.tax.toFixed(2)) : "",
      w("TOTAL", `KES ${s.total.toFixed(2)}`),
      `Payment: ${s.method.toUpperCase()}`,
      s.change > 0 ? w("Change", s.change.toFixed(2)) : "",
      "================================",
      "       Thank you! Asante!       ",
    ].filter(Boolean);
    return lines.join("\n");
  };

  const handlePrint = () => {
    const printWin = window.open("", "_blank", "width=400,height=600");
    if (!printWin || !lastSale) return;
    const lines = buildReceiptText(lastSale).split("\n");
    printWin.document.write(`
      <html><head><title>Receipt</title>
      <style>
        @page { size: 80mm auto; margin: 4mm; }
        body { font-family: monospace; font-size: 12px; width: 72mm; margin: 0; }
        pre { white-space: pre-wrap; word-break: break-word; }
      </style></head>
      <body><pre>${lines.join("\n")}</pre></body></html>
    `);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); printWin.close(); }, 300);
  };

  const handleWhatsApp = () => {
    if (!lastSale) return;
    const phone = (lastSale.phone || "").replace(/[^\d]/g, "");
    if (!phone) { toast({ title: "No phone number for this sale", variant: "destructive" }); return; }
    const normalized = phone.startsWith("0") ? "254" + phone.slice(1) : phone;
    window.open(`https://wa.me/${normalized}?text=${encodeURIComponent(buildReceiptText(lastSale))}`, "_blank");
  };

  // ── PENDING AUDIT VIEW ────────────────────────────────────────────────
  if (step === "pending_audit") {
    return (
      <AppLayout>
        <style>{PRINT_STYLE}</style>
        <div className="max-w-lg mx-auto space-y-4 px-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setStep("cart")}><ArrowLeft className="h-4 w-4" /></Button>
            <h1 className="text-lg font-bold">Offline Sales Queue</h1>
          </div>

          {pendingSales.length === 0 ? (
            <Card><CardContent className="p-8 text-center">
              <Check className="h-8 w-8 text-success mx-auto mb-2" />
              <p className="text-muted-foreground">All sales are synced</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-3">
              {pendingSales.map((sale) => (
                <Card key={sale.id} className={sale.sync_status === "failed" ? "border-destructive/30 bg-destructive/5" : "border-warning/30 bg-warning/5"}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant={sale.sync_status === "failed" ? "destructive" : "secondary"} className="text-xs">
                            {sale.sync_status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(sale.created_at).toLocaleString("en-KE", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="font-medium mt-1">KES {Number(sale.total_amount).toFixed(2)}</p>
                        {sale.customer_name && <p className="text-xs text-muted-foreground">{sale.customer_name}</p>}
                        {sale.sync_error && <p className="text-xs text-destructive mt-1 truncate">{sale.sync_error}</p>}
                        <p className="text-xs text-muted-foreground mt-0.5">{sale.items.length} item(s) · Attempt #{sale.sync_attempts || 0}</p>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={async () => {
                          await retryFailedSale(sale.id);
                          const r = await syncOfflineSales();
                          await refreshPending();
                          toast({ title: r.synced > 0 ? "Synced!" : "Still pending" });
                        }}>
                          <RefreshCw className="h-3 w-3" /> Retry
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive gap-1" onClick={async () => {
                          if (confirm("Discard this sale permanently?")) {
                            await discardOfflineSale(sale.id);
                            await refreshPending();
                          }
                        }}>
                          <Trash2 className="h-3 w-3" /> Discard
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              <Button className="w-full gap-2" onClick={handleManualSync} disabled={syncing}>
                {syncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Sync All Now
              </Button>
            </div>
          )}
        </div>
      </AppLayout>
    );
  }

  // ── COMPLETE VIEW ─────────────────────────────────────────────────────
  if (step === "complete" && lastSale) {
    return (
      <AppLayout>
        <style>{PRINT_STYLE}</style>
        <div className="max-w-md mx-auto space-y-4 px-2 print-receipt-root">
          <div className="flex flex-col items-center gap-4 pt-4 no-print">
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

          {/* 80mm receipt */}
          <Card className="print:shadow-none print:border-none">
            <CardContent className="p-4 font-mono text-xs whitespace-pre-wrap break-words">
              {buildReceiptText(lastSale)}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 no-print">
            <Button variant="outline" onClick={handlePrint} className="h-12 gap-2"><Printer className="h-4 w-4" /> Print Receipt</Button>
            <Button variant="outline" onClick={handleWhatsApp} className="h-12 gap-2"><MessageCircle className="h-4 w-4" /> WhatsApp</Button>
          </div>
          <Button onClick={resetSale} size="lg" className="w-full h-14 text-lg no-print">New Sale</Button>
        </div>
      </AppLayout>
    );
  }

  // ── PAYMENT VIEW ──────────────────────────────────────────────────────
  if (step === "payment") {
    return (
      <AppLayout>
        <div className="max-w-md mx-auto space-y-4 px-2">
          <Button variant="ghost" onClick={() => setStep("cart")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>

          <div className="text-center py-2 space-y-1">
            <p className="text-muted-foreground text-sm">Total Due</p>
            <p className="text-4xl font-bold text-foreground">{formatAmount(totals.total)}</p>
            {(totals.discount > 0 || totals.tax > 0) && (
              <p className="text-xs text-muted-foreground">
                Sub {formatAmount(totals.subtotal)}
                {totals.discount > 0 && ` · Disc -${formatAmount(totals.discount)}`}
                {totals.tax > 0 && ` · Tax ${formatAmount(totals.tax)}`}
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(["cash", "mpesa", "mixed"] as PaymentMethod[]).map((m) => (
              <Button key={m} variant={paymentMethod === m ? "default" : "outline"} className="h-14 gap-1" onClick={() => setPaymentMethod(m)}>
                {m === "cash" ? <><Banknote className="h-4 w-4" /> Cash</> : m === "mpesa" ? <><Smartphone className="h-4 w-4" /> M-Pesa</> : "Mixed"}
              </Button>
            ))}
          </div>

          <Button variant={isCredit ? "default" : "outline"} className="w-full h-12 gap-2" onClick={() => setIsCredit(!isCredit)}>
            <CreditCard className="h-4 w-4" /> {isCredit ? "Credit Sale (Deni) ✓" : "Credit Sale (Deni)"}
          </Button>

          {isCredit && (
            <Input placeholder="Customer name *" value={creditName} onChange={(e) => setCreditName(e.target.value)} className="h-12" autoFocus />
          )}
          <Input placeholder="Customer phone (for WhatsApp receipt, e.g. 0712345678)" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="h-12" />

          {!isCredit && paymentMethod === "cash" && (
            <div className="space-y-3">
              <Input type="number" placeholder="Cash received (KES)" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} className="h-14 text-xl text-center" autoFocus />
              {parseFloat(cashReceived) >= totals.total && (
                <div className="text-center p-3 rounded-xl bg-success/10">
                  <p className="text-sm text-muted-foreground">Change</p>
                  <p className="text-2xl font-bold text-success">{formatAmount(changeAmount)}</p>
                </div>
              )}
              <div className="grid grid-cols-4 gap-2">
                {[50, 100, 200, 500, 1000, 2000, 5000].map((amt) => (
                  <Button key={amt} variant="outline" size="sm" className="h-10" onClick={() => setCashReceived(String(amt))}>{amt}</Button>
                ))}
                <Button variant="outline" size="sm" className="h-10" onClick={() => setCashReceived(String(Math.ceil(totals.total)))}>Exact</Button>
              </div>
            </div>
          )}

          {!isCredit && paymentMethod === "mpesa" && (
            <Card className="bg-success/5 border-success/20">
              <CardContent className="p-4 text-center space-y-2">
                <Smartphone className="h-8 w-8 text-success mx-auto" />
                <p className="text-sm text-muted-foreground">Ask customer to confirm M-Pesa payment</p>
                <p className="text-2xl font-bold text-foreground">{formatAmount(totals.total)}</p>
                <p className="text-xs text-muted-foreground">Verify SMS confirmation before proceeding</p>
              </CardContent>
            </Card>
          )}

          {!isCredit && paymentMethod === "mixed" && (
            <div className="space-y-2">
              <Input type="number" placeholder="Cash portion (KES)" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} className="h-12" />
              <Input type="number" placeholder="M-Pesa portion (KES)" value={mpesaAmount} onChange={(e) => setMpesaAmount(e.target.value)} className="h-12" />
              <div className="text-center">
                <span className={`text-sm font-medium ${((parseFloat(cashReceived) || 0) + (parseFloat(mpesaAmount) || 0)) >= totals.total ? "text-success" : "text-destructive"}`}>
                  Paid: {formatAmount((parseFloat(cashReceived) || 0) + (parseFloat(mpesaAmount) || 0))} / {formatAmount(totals.total)}
                </span>
              </div>
            </div>
          )}

          <Button
            onClick={completeSale}
            disabled={submitting ||
              (!isCredit && paymentMethod === "cash" && (parseFloat(cashReceived) || 0) < totals.total) ||
              (!isCredit && paymentMethod === "mixed" && ((parseFloat(cashReceived) || 0) + (parseFloat(mpesaAmount) || 0)) < totals.total)
            }
            size="lg" className="w-full h-16 text-xl"
          >
            {submitting ? "Processing…" : "Complete Sale"}
          </Button>
        </div>
      </AppLayout>
    );
  }

  // ── CART / PRODUCT GRID ───────────────────────────────────────────────
  return (
    <AppLayout>
      <style>{PRINT_STYLE}</style>
      <div className="space-y-4 pb-36">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">Point of Sale</h1>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <Button variant="outline" size="sm" className="gap-1 text-warning border-warning/30 h-8" onClick={() => setStep("pending_audit")}>
                <AlertTriangle className="h-3.5 w-3.5" /> {pendingCount} pending
              </Button>
            )}
            <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${online ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
              {online ? <><Wifi className="h-3 w-3" /> Online</> : <><WifiOff className="h-3 w-3" /> Offline</>}
            </div>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            placeholder="Search or scan barcode / SKU — press Enter to add"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKey}
            className="pl-9 h-12 text-base"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {filtered.map((product: any) => {
            const inCart = cart.find((i) => i.product_id === product.id);
            const isLow = product.stock_quantity > 0 && product.stock_quantity <= product.low_stock_threshold;
            const outOfStock = product.stock_quantity <= 0;
            return (
              <button
                key={product.id}
                onClick={() => !outOfStock && addToCart(product)}
                disabled={outOfStock}
                className={`relative p-3 rounded-xl border text-left transition-all active:scale-95 select-none ${
                  inCart ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/50"
                } ${outOfStock ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                <p className="font-medium text-foreground text-sm truncate">{product.name}</p>
                <p className="text-primary font-bold text-base mt-1">{formatAmount(product.price)}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className={`text-xs ${outOfStock ? "text-destructive font-medium" : isLow ? "text-warning font-medium" : "text-muted-foreground"}`}>
                    {outOfStock ? "Out of stock" : `${product.stock_quantity} ${product.unit_of_measure || ""}`}
                  </span>
                  {inCart && <Badge className="h-5 min-w-[20px] flex items-center justify-center text-xs">{inCart.quantity}</Badge>}
                </div>
              </button>
            );
          })}
        </div>
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">No products found</p>}

        {/* Sticky cart bar */}
        {cart.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-3 shadow-lg z-50">
            <div className="max-w-screen-md mx-auto">
              <div className="max-h-52 overflow-y-auto space-y-2 mb-3">
                {cart.map((item) => (
                  <div key={item.product_id} className="space-y-1 pb-1 border-b border-border/40 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-foreground truncate flex-1">{item.name}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.product_id, -1)}><Minus className="h-3 w-3" /></Button>
                        <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.product_id, 1)}><Plus className="h-3 w-3" /></Button>
                        <span className="text-sm font-medium w-20 text-right">{formatAmount(item.price * item.quantity * (1 - item.discount_pct / 100))}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(item.product_id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pl-1">
                      <Percent className="h-3 w-3 text-muted-foreground" />
                      <Input type="number" placeholder="Disc%" value={item.discount_pct || ""} onChange={(e) => setLineDiscount(item.product_id, parseFloat(e.target.value) || 0)} className="h-6 w-16 text-xs" />
                      {item.tax_rate > 0 && <span className="text-[10px] text-muted-foreground">VAT {item.tax_rate}%</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mb-2">
                <Input type="number" placeholder="Order discount (flat amount off)" value={orderDiscount} onChange={(e) => setOrderDiscount(e.target.value)} className="h-9 text-sm" />
              </div>
              {(totals.discount > 0 || totals.tax > 0) && (
                <p className="text-xs text-muted-foreground text-center mb-1">
                  Sub {formatAmount(totals.subtotal)}{totals.discount > 0 && ` · Disc -${formatAmount(totals.discount)}`}{totals.tax > 0 && ` · Tax ${formatAmount(totals.tax)}`}
                </p>
              )}
              <Button onClick={() => setStep("payment")} className="w-full h-14 text-lg gap-2">
                <ShoppingCart className="h-5 w-5" />
                Charge {formatAmount(totals.total)} · {cart.reduce((s, i) => s + i.quantity, 0)} items
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
