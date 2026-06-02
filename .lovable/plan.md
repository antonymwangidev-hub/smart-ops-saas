
# SmartOps → Business Operating System: Phased Roadmap

I analyzed the current codebase against your brief. Here's what exists, what's missing, and the phased plan. We'll execute one phase per turn — you approve, I ship, we move to the next.

## Current State (audit)

**Already built (keep & extend):**
- Multi-tenant orgs with RLS (`organizations`, `organization_members`, `has_org_role`, `get_user_org_ids`)
- Roles: admin / staff / attendant + `RoleRoute`
- POS (`/pos`), Daily Summary, Credit Sales, Products w/ stock + low-stock threshold
- Orders + order_items, Customers, Tasks, Automations engine (`process_automations`)
- M-Pesa STK Push + callback edge functions, `mpesa_payments` table
- AI assistant, AI recommendations, business-health edge function, activity_logs + realtime
- Notifications, presence, file attachments, currency context (KES default), offline sync skeleton, platform admin
- Phone OTP auth + profile phone management

**Gaps vs brief:**
- No suppliers, purchase orders, expenses, branches, product categories/brands/variants/batches/expiry
- No proper finance (P&L, cash flow), no reporting center w/ PDF/Excel export
- No CRM depth (loyalty, lifetime value), no debtor reminders (SMS/WhatsApp)
- No subscription/billing plans, no usage limits
- No barcode scan, receipt printing, WhatsApp receipt, returns/refunds
- No staff attendance, no eTIMS scaffolding, no 2FA
- POS lacks mixed payments, discounts, tax, refunds

## Phased Plan (ranked by business impact)

### Phase 1 — Inventory & POS 2.0 (HIGH IMPACT, foundational)
- Add `product_categories`, `product_brands`, extend `products` with: `barcode`, `unit_of_measure`, `batch_number`, `expiry_date`, `brand_id`, `category_id`, `tax_rate`
- POS upgrades: barcode/scan input, product search by name/SKU/barcode, line-item discounts, tax calc, mixed payments (cash + M-Pesa + credit split), receipt print view, WhatsApp receipt link (`wa.me`)
- Returns/refunds: new `sale_returns` + `sale_return_items` tables, refund flow in POS
- Stock intelligence view: fast/slow/dead/overstocked/expiring panels on Products page

### Phase 2 — Suppliers & Purchase Orders
- Tables: `suppliers`, `purchase_orders` (draft/approved/ordered/received), `purchase_order_items`, `supplier_payments`
- Pages: `/suppliers`, `/purchases` with PO workflow, auto-increment stock on "received"
- Supplier outstanding balance, purchase history, best-price tracking

### Phase 3 — Finance & Debtor Control
- Tables: `expenses` (category, amount, date, recurring), `expense_categories`
- Strengthen `credit_sales` with `due_date`, `payment_history` (`credit_payments` table)
- Debtor dashboard: aging buckets, risk score, one-click SMS/WhatsApp reminder edge function (Africa's Talking + Twilio already documented)
- Finance pages: P&L, Cash Flow, Expense report
- Dashboard widgets: Today's profit, expenses, outstanding debt, AI insights expansion

### Phase 4 — Multi-Branch & Staff Operations
- Tables: `branches`, add `branch_id` to products/sales/staff assignments, `stock_transfers`, `staff_attendance`
- Branch switcher in header (like org switcher), consolidated vs per-branch reports
- Expanded roles: `manager`, `cashier`, `storekeeper`, `accountant` (extend `app_role` enum), per-module permissions table
- Staff attendance clock-in/out page

### Phase 5 — Reporting Center & CRM Depth
- `/reports` hub: sales (daily/weekly/monthly), inventory valuation & movement, financial, customer reports
- PDF (jsPDF) + Excel (xlsx) + CSV exports (csvExport already exists)
- CRM: customer lifetime value, loyalty points table (`loyalty_transactions`), coupons
- Communication history per customer

### Phase 6 — SaaS Billing, eTIMS Scaffold, Security
- Tables: `subscription_plans`, `org_subscriptions`, usage tracking (users/branches/products counts)
- Plan gates in app (Free/Starter/Business/Enterprise), Paystack edge function for billing
- eTIMS-ready invoice schema: KRA PIN on business profile, VAT-compliant invoice numbering, `tax_invoices` table — integration stubbed
- 2FA (TOTP via Supabase MFA), audit log viewer for owners

### Phase 7 — Polish: Mobile, AI Assistant Upgrade, Notifications
- Mobile nav expansion per new modules, swipe gestures on POS cart
- AI assistant: tool-calling against real org data (top products, debtors, reorder suggestions, branch comparison)
- Unified notification center page with filters

## Technical Notes
- Every new public table: CREATE → GRANT (authenticated + service_role) → ENABLE RLS → POLICIES scoped via `get_user_org_ids(auth.uid())` and `has_org_role`
- Extend `app_role` enum additively (manager/cashier/storekeeper/accountant) — keep admin/staff/attendant working
- All new pages wrapped in `PrivateRoute` + `RoleRoute` with the minimum role
- Reuse existing `AppLayout`, design tokens, `glass` cards, Indigo/Emerald palette
- M-Pesa/Twilio/Africa's Talking via existing edge functions & secrets

## Deliverable per phase
Migration(s) + UI pages + edge functions (where needed) + sidebar entries. Backward compatible — no existing route or feature removed.

---

**Reply approve to start Phase 1 (Inventory & POS 2.0)**, or tell me to reorder/cut phases.
