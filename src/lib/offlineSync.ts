/**
 * Offline sync for POS sales — IndexedDB (Dexie) with localStorage fallback.
 *
 * Key design decisions:
 * - isReachable() uses navigator.onLine only — no raw fetch() probe.
 *   Raw fetch to Supabase health endpoint always fails on mobile due to CORS.
 * - syncOfflineSales() fully handles credit sales: inserts credit_sales record.
 * - customer_phone is stored in OfflineSale so it survives offline→sync.
 */
import Dexie, { Table } from "dexie";
import { supabase } from "@/integrations/supabase/client";

export interface OfflineSale {
  id: string;
  organization_id: string;
  total_amount: number;
  payment_method: "cash" | "mpesa" | "mixed" | "credit";
  cash_received: number;
  change_given: number;
  is_credit: boolean;
  customer_name: string | null;
  customer_phone: string | null; // ← stored so credit_sales has it on sync
  notes: string | null;
  created_by: string | null;
  created_at: string;
  subtotal?: number;
  discount_amount?: number;
  tax_amount?: number;
  items: {
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
  }[];
  sync_status?: "pending" | "failed" | "syncing";
  sync_error?: string | null;
  sync_attempts?: number;
}

// ── IndexedDB ──────────────────────────────────────────────────────────
class SmartOpsDB extends Dexie {
  offline_sales!: Table<OfflineSale, string>;
  constructor() {
    super("smartops_offline_v2");
    this.version(1).stores({
      offline_sales: "id, organization_id, created_at, sync_status",
    });
  }
}

let _db: SmartOpsDB | null = null;
function getDB(): SmartOpsDB {
  if (!_db) _db = new SmartOpsDB();
  return _db;
}

// ── Public API ─────────────────────────────────────────────────────────

export async function getOfflineQueue(): Promise<OfflineSale[]> {
  try {
    const all = await getDB().offline_sales.toArray();
    return all.filter(
      (s) => s.sync_status === "pending" || s.sync_status === "failed" || s.sync_status === "syncing"
    );
  } catch {
    try { return JSON.parse(localStorage.getItem("smartops_offline_sales") || "[]"); }
    catch { return []; }
  }
}

export async function getAllOfflineSales(): Promise<OfflineSale[]> {
  try {
    const all = await getDB().offline_sales.toArray();
    return all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } catch { return []; }
}

export async function addToOfflineQueue(sale: OfflineSale): Promise<void> {
  const record: OfflineSale = { ...sale, sync_status: "pending", sync_error: null, sync_attempts: 0 };
  try {
    await getDB().offline_sales.put(record);
  } catch {
    try {
      const existing = JSON.parse(localStorage.getItem("smartops_offline_sales") || "[]");
      existing.push(record);
      localStorage.setItem("smartops_offline_sales", JSON.stringify(existing));
    } catch { /* silent */ }
  }
}

async function markSynced(saleId: string): Promise<void> {
  try { await getDB().offline_sales.delete(saleId); }
  catch {
    try {
      const q = JSON.parse(localStorage.getItem("smartops_offline_sales") || "[]");
      localStorage.setItem("smartops_offline_sales", JSON.stringify(q.filter((s: OfflineSale) => s.id !== saleId)));
    } catch { /* silent */ }
  }
}

async function markFailed(saleId: string, errorMsg: string): Promise<void> {
  try {
    const db = getDB();
    const sale = await db.offline_sales.get(saleId);
    if (sale) {
      await db.offline_sales.put({
        ...sale, sync_status: "failed", sync_error: errorMsg,
        sync_attempts: (sale.sync_attempts || 0) + 1,
      });
    }
  } catch { /* silent */ }
}

/**
 * Main sync loop — called on network restore and manually.
 * Handles regular sales AND credit (deni) sales fully.
 */
export async function syncOfflineSales(): Promise<{ synced: number; failed: number }> {
  const queue = await getOfflineQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0, failed = 0;

  for (const sale of queue) {
    try {
      // Mark syncing to prevent double-submission
      try {
        const db = getDB();
        const existing = await db.offline_sales.get(sale.id);
        if (existing) await db.offline_sales.put({ ...existing, sync_status: "syncing" });
      } catch { /* silent */ }

      // 1 ── Insert sale row
      const { data: saleRow, error: saleErr } = await supabase
        .from("sales")
        .insert({
          organization_id: sale.organization_id,
          total_amount: sale.total_amount,
          payment_method: sale.payment_method,
          cash_received: sale.cash_received,
          change_given: sale.change_given,
          is_credit: sale.is_credit,
          customer_name: sale.customer_name,
          notes: sale.notes,
          created_by: sale.created_by,
          created_at: sale.created_at,
          subtotal: sale.subtotal,
          discount_amount: sale.discount_amount,
          tax_amount: sale.tax_amount,
        } as any)
        .select("id")
        .single();
      if (saleErr) throw saleErr;

      // 2 ── Insert sale items
      if (sale.items.length > 0) {
        const { error: itemsErr } = await supabase.from("sale_items").insert(
          sale.items.map((item) => ({
            sale_id: saleRow.id,
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            organization_id: sale.organization_id,
          })) as any
        );
        if (itemsErr) throw itemsErr;
      }

      // 3 ── Stock reconciliation
      for (const item of sale.items) {
        if (!item.product_id) continue;
        try {
          const { data: product } = await supabase
            .from("products").select("stock_quantity").eq("id", item.product_id).single();
          if (product) {
            await supabase.from("products")
              .update({ stock_quantity: Math.max(0, (product as any).stock_quantity - item.quantity) } as any)
              .eq("id", item.product_id);
          }
        } catch { /* non-fatal — corrected on next stock take */ }
      }

      // 4 ── Credit sale: create customer + credit_sales record
      if (sale.is_credit && sale.customer_name) {
        try {
          let linkedCustomerId: string | null = null;

          // Find or create customer
          const { data: existingCustomer } = await supabase
            .from("customers")
            .select("id")
            .eq("organization_id", sale.organization_id)
            .ilike("name", sale.customer_name.trim())
            .maybeSingle();

          if (existingCustomer?.id) {
            linkedCustomerId = (existingCustomer as any).id;
            if (sale.customer_phone) {
              await supabase.from("customers")
                .update({ phone: sale.customer_phone } as any)
                .eq("id", linkedCustomerId!);
            }
          } else {
            const { data: newCustomer } = await supabase
              .from("customers")
              .insert({
                organization_id: sale.organization_id,
                name: sale.customer_name.trim(),
                phone: sale.customer_phone || null,
              } as any)
              .select("id")
              .single();
            linkedCustomerId = (newCustomer as any)?.id || null;
          }

          // Create credit_sales record
          await supabase.from("credit_sales").insert({
            organization_id: sale.organization_id,
            customer_id: linkedCustomerId,
            customer_name: sale.customer_name.trim(),
            phone: sale.customer_phone || null,
            total_amount: sale.total_amount,
            amount_paid: 0,
            is_settled: false,
            sale_id: saleRow.id,
            created_at: sale.created_at,
          } as any);
        } catch (creditErr: any) {
          // Credit record failure is non-fatal for the sale itself
          // but we log it so it can be investigated
          console.error("[offlineSync] credit_sales insert failed:", creditErr?.message);
        }
      }

      await markSynced(sale.id);
      synced++;
    } catch (err: any) {
      await markFailed(sale.id, err?.message || "Unknown error");
      failed++;
    }
  }

  return { synced, failed };
}

export async function retryFailedSale(saleId: string): Promise<boolean> {
  try {
    const db = getDB();
    const sale = await db.offline_sales.get(saleId);
    if (!sale) return false;
    await db.offline_sales.put({ ...sale, sync_status: "pending", sync_error: null });
    return true;
  } catch { return false; }
}

export async function discardOfflineSale(saleId: string): Promise<void> {
  await markSynced(saleId);
}

/** Simple online check — no fetch probe (CORS kills it on mobile) */
export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

/**
 * Classify an error as a network failure vs a data/server error.
 * Network failures → fall back to offline queue.
 * Data errors → surface to the user (don't silently swallow).
 */
export function isNetworkError(err: any): boolean {
  if (!navigator.onLine) return true;
  const msg = (err?.message || "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||   // Chrome / Edge / Firefox
    msg.includes("load failed") ||        // Safari
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("the internet connection appears to be offline") ||
    err?.name === "TypeError"             // Generic fetch failure
  );
}

// Auto-sync on network restore
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    setTimeout(() => syncOfflineSales(), 1500);
  });
}
