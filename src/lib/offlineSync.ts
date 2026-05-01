/**
 * Offline sync utility for POS sales.
 * Queues sales in localStorage when offline; syncs to Supabase when online.
 */
import { supabase } from "@/integrations/supabase/client";

export interface OfflineSale {
  id: string;
  organization_id: string;
  total_amount: number;
  payment_method: "cash" | "mpesa";
  cash_received: number;
  change_given: number;
  is_credit: boolean;
  customer_name: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  items: {
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
  }[];
}

const QUEUE_KEY = "smartops_offline_sales";

export function getOfflineQueue(): OfflineSale[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addToOfflineQueue(sale: OfflineSale) {
  const queue = getOfflineQueue();
  queue.push(sale);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function removeFromQueue(saleId: string) {
  const queue = getOfflineQueue().filter((s) => s.id !== saleId);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function syncOfflineSales(): Promise<{ synced: number; failed: number }> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const sale of queue) {
    try {
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
        } as any)
        .select("id")
        .single();

      if (saleErr) throw saleErr;

      if (sale.items.length > 0) {
        await supabase.from("sale_items").insert(
          sale.items.map((item) => ({
            sale_id: saleRow.id,
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            organization_id: sale.organization_id,
          })) as any
        );
      }

      removeFromQueue(sale.id);
      synced++;
    } catch {
      failed++;
    }
  }

  return { synced, failed };
}

export function isOnline(): boolean {
  return navigator.onLine;
}

// Auto-sync when coming back online
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    syncOfflineSales();
  });
}
