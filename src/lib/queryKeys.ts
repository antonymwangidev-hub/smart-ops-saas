/**
 * Centralized query key registry.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Previously the codebase had ad-hoc string literals as query keys:
 *   "products", "pos_products", "stock_take_products", "product_skus"
 * These are all the same underlying data. When a product is saved in
 * Products.tsx, the POS page kept showing stale stock levels because
 * its queryKey ("pos_products") was never invalidated.
 *
 * This factory fixes that by:
 *   1. Giving every query a canonical key derived from a single root.
 *   2. Allowing broad invalidation via the root (e.g. invalidate all
 *      product queries at once: queryKeys.products.all).
 *   3. Making query keys typed and refactor-safe — no more "stringly-typed"
 *      cache keys scattered across 30 files.
 *
 * USAGE
 * ─────
 *   // In a component:
 *   useQuery({ queryKey: queryKeys.products.list(orgId), queryFn: ... })
 *
 *   // On mutation success — invalidates ALL product queries for this org:
 *   queryClient.invalidateQueries({ queryKey: queryKeys.products.all(orgId) })
 */

export const queryKeys = {
  // ── Products ────────────────────────────────────────────────────────
  products: {
    /** Matches ALL product queries for an org — use for broad invalidation */
    all: (orgId: string) => ["products", orgId] as const,
    /** Paginated product list */
    list: (orgId: string, page?: number) =>
      ["products", orgId, "list", page ?? 0] as const,
    /** SKU index (for duplicate detection during import) */
    skus: (orgId: string) => ["products", orgId, "skus"] as const,
    /** Stock take session view */
    stockTake: (orgId: string) => ["products", orgId, "stock-take"] as const,
  },

  // ── Sales ────────────────────────────────────────────────────────────
  sales: {
    all: (orgId: string) => ["sales", orgId] as const,
    /** Dashboard aggregates */
    dashboard: (orgId: string, todayStart: string) =>
      ["sales", orgId, "dashboard", todayStart] as const,
    /** Daily summary — keyed by calendar date string (YYYY-MM-DD) */
    daily: (orgId: string, date: string) =>
      ["sales", orgId, "daily", date] as const,
    /** Recent sales for returns picker */
    forReturns: (orgId: string) => ["sales", orgId, "for-returns"] as const,
  },

  // ── Credit (Deni) ─────────────────────────────────────────────────────
  credit: {
    all: (orgId: string) => ["credit", orgId] as const,
    /** Debtor list (unsettled) */
    debtors: (orgId: string) => ["credit", orgId, "debtors"] as const,
    /** Full credit sales list with payments */
    sales: (orgId: string) => ["credit", orgId, "sales"] as const,
  },

  // ── Customers ──────────────────────────────────────────────────────────
  customers: {
    all: (orgId: string) => ["customers", orgId] as const,
    list: (orgId: string) => ["customers", orgId, "list"] as const,
  },

  // ── Suppliers ──────────────────────────────────────────────────────────
  suppliers: {
    all: (orgId: string) => ["suppliers", orgId] as const,
    list: (orgId: string) => ["suppliers", orgId, "list"] as const,
  },

  // ── Purchase Orders ───────────────────────────────────────────────────
  purchaseOrders: {
    all: (orgId: string) => ["purchase-orders", orgId] as const,
    list: (orgId: string) => ["purchase-orders", orgId, "list"] as const,
    pending: (orgId: string) =>
      ["purchase-orders", orgId, "pending"] as const,
  },

  // ── Orders ────────────────────────────────────────────────────────────
  orders: {
    all: (orgId: string) => ["orders", orgId] as const,
    list: (orgId: string) => ["orders", orgId, "list"] as const,
  },

  // ── Expenses ──────────────────────────────────────────────────────────
  expenses: {
    all: (orgId: string) => ["expenses", orgId] as const,
    list: (orgId: string, month?: string) =>
      ["expenses", orgId, "list", month ?? "all"] as const,
    categories: (orgId: string) =>
      ["expenses", orgId, "categories"] as const,
  },

  // ── Staff & People ────────────────────────────────────────────────────
  staff: {
    all: (orgId: string) => ["staff", orgId] as const,
    members: (orgId: string) => ["staff", orgId, "members"] as const,
    invitations: (orgId: string) =>
      ["staff", orgId, "invitations"] as const,
    attendance: (orgId: string, date?: string) =>
      ["staff", orgId, "attendance", date ?? "all"] as const,
  },

  // ── Tasks ─────────────────────────────────────────────────────────────
  tasks: {
    all: (orgId: string) => ["tasks", orgId] as const,
    list: (orgId: string) => ["tasks", orgId, "list"] as const,
  },

  // ── Notifications ─────────────────────────────────────────────────────
  notifications: {
    all: (orgId: string) => ["notifications", orgId] as const,
    list: (orgId: string) => ["notifications", orgId, "list"] as const,
  },

  // ── Finance ───────────────────────────────────────────────────────────
  finance: {
    all: (orgId: string) => ["finance", orgId] as const,
    summary: (orgId: string, period: string) =>
      ["finance", orgId, "summary", period] as const,
  },

  // ── Analytics ─────────────────────────────────────────────────────────
  analytics: {
    all: (orgId: string) => ["analytics", orgId] as const,
    sales: (orgId: string, range: string) =>
      ["analytics", orgId, "sales", range] as const,
  },

  // ── Stock Transfers ───────────────────────────────────────────────────
  stockTransfers: {
    all: (orgId: string) => ["stock-transfers", orgId] as const,
    list: (orgId: string) => ["stock-transfers", orgId, "list"] as const,
  },

  // ── Branches ──────────────────────────────────────────────────────────
  branches: {
    all: (orgId: string) => ["branches", orgId] as const,
    list: (orgId: string) => ["branches", orgId, "list"] as const,
  },

  // ── Returns ───────────────────────────────────────────────────────────
  returns: {
    all: (orgId: string) => ["returns", orgId] as const,
    list: (orgId: string) => ["returns", orgId, "list"] as const,
  },

  // ── Documents ─────────────────────────────────────────────────────────
  documents: {
    all: (orgId: string) => ["documents", orgId] as const,
    list: (orgId: string) => ["documents", orgId, "list"] as const,
  },

  // ── Automation Rules ──────────────────────────────────────────────────
  automations: {
    all: (orgId: string) => ["automations", orgId] as const,
    list: (orgId: string) => ["automations", orgId, "list"] as const,
  },
} as const;
