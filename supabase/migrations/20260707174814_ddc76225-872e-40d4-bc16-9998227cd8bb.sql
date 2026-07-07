
-- ============================================================
-- Phase 1: Agrovet foundation — additive, backward-compatible
-- ============================================================

-- 1. Enums (created only if missing)
DO $$ BEGIN
  CREATE TYPE public.business_type AS ENUM ('agrovet','hardware','pharmacy','retail','wholesale','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.vat_category AS ENUM ('standard','exempt','zero_rated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.farmer_type AS ENUM ('dairy','poultry','beef','goat','pig','crop','mixed','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. organizations: business type, KRA, VAT
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS business_type public.business_type NOT NULL DEFAULT 'agrovet',
  ADD COLUMN IF NOT EXISTS kra_pin text,
  ADD COLUMN IF NOT EXISTS vat_registered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS county text,
  ADD COLUMN IF NOT EXISTS physical_address text;

-- 3. products: agrovet extensions
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS pack_size text,
  ADD COLUMN IF NOT EXISTS wholesale_price numeric,
  ADD COLUMN IF NOT EXISTS reorder_level integer,
  ADD COLUMN IF NOT EXISTS storage_location text,
  ADD COLUMN IF NOT EXISTS vat_category public.vat_category NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS manufacturer text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS manufacturing_date date,
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(organization_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_expiry ON public.products(organization_id, expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_supplier ON public.products(supplier_id) WHERE supplier_id IS NOT NULL;

-- 4. customers: Kenyan locality + farmer profile + credit
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS county text,
  ADD COLUMN IF NOT EXISTS sub_county text,
  ADD COLUMN IF NOT EXISTS village text,
  ADD COLUMN IF NOT EXISTS farmer_type public.farmer_type,
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS credit_limit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kra_pin text;

-- 5. suppliers: KRA + credit terms + performance
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS kra_pin text,
  ADD COLUMN IF NOT EXISTS credit_terms_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_preferred boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS county text,
  ADD COLUMN IF NOT EXISTS avg_delivery_days numeric;

-- 6. product_batches — proper batch/FEFO tracking
CREATE TABLE IF NOT EXISTS public.product_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  batch_number text NOT NULL,
  manufacturing_date date,
  expiry_date date,
  quantity_received integer NOT NULL DEFAULT 0,
  quantity_remaining integer NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  storage_location text,
  notes text,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, batch_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_batches TO authenticated;
GRANT ALL ON public.product_batches TO service_role;

ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read batches"
  ON public.product_batches FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "storekeepers insert batches"
  ON public.product_batches FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, 'storekeeper'));

CREATE POLICY "storekeepers update batches"
  ON public.product_batches FOR UPDATE TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'storekeeper'))
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, 'storekeeper'));

CREATE POLICY "admins delete batches"
  ON public.product_batches FOR DELETE TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'admin'));

CREATE INDEX IF NOT EXISTS idx_batches_product_expiry
  ON public.product_batches(product_id, expiry_date NULLS LAST)
  WHERE quantity_remaining > 0;
CREATE INDEX IF NOT EXISTS idx_batches_org_expiry
  ON public.product_batches(organization_id, expiry_date)
  WHERE expiry_date IS NOT NULL AND quantity_remaining > 0;

CREATE TRIGGER trg_batches_updated_at
  BEFORE UPDATE ON public.product_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. FEFO helper view: next batch to draw from per product
CREATE OR REPLACE VIEW public.product_next_batch AS
SELECT DISTINCT ON (product_id)
  product_id,
  organization_id,
  id AS batch_id,
  batch_number,
  expiry_date,
  quantity_remaining,
  unit_cost
FROM public.product_batches
WHERE quantity_remaining > 0
  AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
ORDER BY product_id, expiry_date NULLS LAST, received_at ASC;

GRANT SELECT ON public.product_next_batch TO authenticated;
