# SmartOps → Agrovet OS Transformation Plan

This is a large, multi-week transformation. I'll deliver it in **reviewable phases** rather than one giant unreviewable dump. Each phase is shippable and preserves all existing functionality.

## Audit Summary (current state)

**Works well**
- Multi-tenant RLS, org/role model, sidebar groups (recently refactored), Dashboard v3 with KPIs/AI/alerts, POS + Credit Sales + Returns, Purchase Orders + Supplier Payments (with balance triggers), Stock Transfers, M-Pesa STK, Realtime + presence, offline sync scaffolding.

**Gaps vs. Agrovet target**
1. **Products table** lacks: barcode, brand FK usage, batch/expiry, mfg date, storage location, VAT category, wholesale/retail split, pack size, unit of measure, reorder level (some exist, need to verify).
2. **No batch tracking / FEFO** — critical for vet medicines & vaccines. No expiry alerts.
3. **Customers** lack: county, sub-county, village, farmer_type, credit_limit surfacing.
4. **Suppliers** lack: KRA PIN, credit terms, delivery performance metrics.
5. **VAT** not modeled (16% standard / exempt / zero-rated).
6. **Global search** is per-page only — no cross-entity command palette search by barcode/batch/invoice.
7. **Reports** page is thin — missing near-expiry, slow-moving, margin, category performance.
8. **AI Insights** exist on dashboard but no dedicated page with proactive scheduled recommendations.
9. **Kenyan locale**: KES defaulted, but no county picker, no PIN field, no VAT-aware pricing.
10. **Dashboard** already strong post-v3; needs expiry KPI, inventory value, supplier credit.

## Phased Delivery

### Phase 1 — Data model foundation (this turn)
Additive migration. Zero breaking changes.
- `products`: add `barcode`, `pack_size`, `unit_of_measure`, `wholesale_price`, `reorder_level`, `storage_location`, `vat_category` (enum: standard/exempt/zero), `manufacturer`, `image_url` (if missing).
- New `product_batches` table: batch_number, mfg_date, expiry_date, quantity, cost, product_id, org_id, supplier_id, received_at. FEFO helper view.
- `customers`: add `county`, `sub_county`, `village`, `farmer_type` (enum), `credit_limit`, `notes`.
- `suppliers`: add `kra_pin`, `credit_terms_days`, `preferred` (bool), `notes` (verify existing).
- `organizations`: add `business_type` (enum: agrovet, hardware, pharmacy, retail, wholesale) default `agrovet`, `kra_pin`, `vat_registered` bool.
- Seed 5 default Agrovet categories if org.business_type=agrovet and none exist (Vet Medicines, Feeds, Seeds, Fertilizers, Pesticides).
- Full GRANTs + additive only (no column drops, no NOT NULL on existing rows).

### Phase 2 — Batch & expiry UX
- Batches tab on Product detail; receive-into-batch during PO receive.
- Near-expiry KPI on Dashboard (30/60/90) + Smart Alert.
- Block sale of expired batches in POS; FEFO auto-selects oldest.
- New Reports: Near Expiry, Expired.

### Phase 3 — Customers/Suppliers Kenyan fields
- County/sub-county picker (Kenyan 47 counties list), farmer type, credit limit surfaced in POS.
- Supplier KRA PIN, credit terms, delivery performance card.

### Phase 4 — Reports hub
- Dedicated `/reports` index with: Daily/Weekly/Monthly Sales, Profit, Inventory Valuation, Low Stock, Near Expiry, Category Performance, Slow Movers, Margin Analysis, Supplier Performance, Customer Trends, Credit Aging.

### Phase 5 — AI Insights page + global command search
- `/ai-insights` dedicated page with scheduled proactive recommendations (extend `smart-alerts-engine` edge fn).
- Command Palette (⌘K) searching products by name/SKU/barcode, customers, suppliers, orders, invoices, batches.

### Phase 6 — VAT + polish
- VAT-aware pricing in POS receipt (16% standard, exempt shown).
- Kenyan phone normalization already exists — audit + surface PIN field on org settings.
- UX pass: spacing, typography, empty states, mobile.

### Future-ready (architecture only, no UI now)
- Reserve enum values / nullable FKs for: clinic visits, loyalty points, deliveries, accounting entries, payroll, WhatsApp templates, customer/supplier portals, e-commerce SKUs.

## Technical notes
- All migrations are additive; existing code paths keep working because new columns are nullable with sensible defaults.
- `business_type` on org gates Agrovet-specific UI (batch tab, expiry KPIs) without hiding features for non-agrovet tenants.
- No KRA API integration — only PIN storage + VAT categorization ready.

## What I'll do next
Proceed with **Phase 1 migration only** on your approval. After it lands and types regenerate, I'll ship Phase 2 UI. Reply "go" to start, or tell me to reorder / skip phases.
