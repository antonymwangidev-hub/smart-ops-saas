/**
 * Offline sync utility for POS sales.
 * Uses IndexedDB (via Dexie) for persistent, crash-safe offline storage.
 * Falls back gracefully if IndexedDB is unavailable.
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

// ─── IndexedDB via Dexie ───────────────────────────────────────────────
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

// ─── Public API ────────────────────────────────────────────────────────

export async function getOfflineQueue(): Promise<OfflineSale[]> {
  try {
    const all = await getDB().offline_sales.toArray();
    return all.filter(s => s.sync_status === "pending" || s.sync_status === "failed" || s.sync_status === "syncing");
  } catch {
    try {
      return JSON.parse(localStorage.getItem("smartops_offline_sales") || "[]");
    } catch {
      return [];
    }
  }
}

export async function getAllOfflineSales(): Promise<OfflineSale[]> {
  try {
    const all = await getDB().offline_sales.toArray();
    return all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } catch {
    return [];
  }
}

export async function addToOfflineQueue(sale: OfflineSale): Promise<void> {
  const record: OfflineSale = {
    ...sale,
    sync_status: "pending",
    sync_error: null,
    sync_attempts: 0,
  };
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
  try {
    await getDB().offline_sales.delete(saleId);
  } catch {
    try {
      const queue = JSON.parse(localStorage.getItem("smartops_offline_sales") || "[]");
      localStorage.setItem("smartops_offline_sales", JSON.stringify(queue.filter((s: OfflineSale) => s.id !== saleId)));
    } catch { /* silent */ }
  }
}

async function markFailed(saleId: string, errorMsg: string): Promise<void> {
  try {
    const db = getDB();
    const sale = await db.offline_sales.get(saleId);
    if (sale) {
      await db.offline_sales.put({
        ...sale,
        sync_status: "failed",
        sync_error: errorMsg,
        sync_attempts: (sale.sync_attempts || 0) + 1,
      });
    }
  } catch { /* silent */ }
}

export async function syncOfflineSales(): Promise<{ synced: number; failed: number }> {
  const queue = await getOfflineQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const sale of queue) {
    try {
      // Mark as syncing to prevent double-sync races
      try {
        const db = getDB();
        const existing = await db.offline_sales.get(sale.id);
        if (existing) await db.offline_sales.put({ ...existing, sync_status: "syncing" });
      } catch { /* silent */ }

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

      // Stock reconciliation: decrement stock for each item after sync
      for (const item of sale.items) {
        if (!item.product_id) continue;
        try {
          const { data: product } = await supabase
            .from("products")
            .select("stock_quantity")
            .eq("id", item.product_id)
            .single();
          if (product) {
            const newQty = Math.max(0, (product as any).stock_quantity - item.quantity);
            await supabase
              .from("products")
              .update({ stock_quantity: newQty } as any)
              .eq("id", item.product_id);
          }
        } catch { /* non-fatal: corrected on next stock take */ }
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
  } catch {
    return false;
  }
}

export async function discardOfflineSale(saleId: string): Promise<void> {
  await markSynced(saleId);
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export async function isReachable(timeoutMs = 4000): Promise<boolean> {
  if (!isOnline()) return false;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const url = (import.meta as any).env?.VITE_SUPABASE_URL;
    if (!url) return true;
    await fetch(`${url}/auth/v1/health`, { method: "GET", signal: controller.signal, cache: "no-store" });
    clearTimeout(t);
    return true;
  } catch {
    return false;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    setTimeout(() => syncOfflineSales(), 1000);
  });
}
