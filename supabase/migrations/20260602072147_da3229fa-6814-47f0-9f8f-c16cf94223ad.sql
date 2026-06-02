
-- ============ Extend products ============
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS barcode TEXT,
  ADD COLUMN IF NOT EXISTS unit_of_measure TEXT NOT NULL DEFAULT 'pcs',
  ADD COLUMN IF NOT EXISTS batch_number TEXT,
  ADD COLUMN IF NOT EXISTS expiry_date DATE,
  ADD COLUMN IF NOT EXISTS category_id UUID,
  ADD COLUMN IF NOT EXISTS brand_id UUID,
  ADD COLUMN IF NOT EXISTS tax_rate NUMERIC NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(organization_id, barcode);
CREATE INDEX IF NOT EXISTS idx_products_expiry ON public.products(organization_id, expiry_date);

-- ============ Extend sales ============
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC NOT NULL DEFAULT 0;

-- ============ Extend sale_items ============
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rate NUMERIC NOT NULL DEFAULT 0;

-- ============ product_categories ============
CREATE TABLE IF NOT EXISTS public.product_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view product_categories" ON public.product_categories
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));
CREATE POLICY "Members can create product_categories" ON public.product_categories
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT get_user_org_ids(auth.uid())));
CREATE POLICY "Members can update product_categories" ON public.product_categories
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));
CREATE POLICY "Admins can delete product_categories" ON public.product_categories
  FOR DELETE TO authenticated
  USING (has_org_role(auth.uid(), organization_id, 'admin'::app_role));

CREATE TRIGGER trg_product_categories_updated
  BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ product_brands ============
CREATE TABLE IF NOT EXISTS public.product_brands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_brands TO authenticated;
GRANT ALL ON public.product_brands TO service_role;
ALTER TABLE public.product_brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view product_brands" ON public.product_brands
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));
CREATE POLICY "Members can create product_brands" ON public.product_brands
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT get_user_org_ids(auth.uid())));
CREATE POLICY "Members can update product_brands" ON public.product_brands
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));
CREATE POLICY "Admins can delete product_brands" ON public.product_brands
  FOR DELETE TO authenticated
  USING (has_org_role(auth.uid(), organization_id, 'admin'::app_role));

CREATE TRIGGER trg_product_brands_updated
  BEFORE UPDATE ON public.product_brands
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ sale_returns ============
CREATE TABLE IF NOT EXISTS public.sale_returns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  sale_id UUID,
  reason TEXT,
  refund_amount NUMERIC NOT NULL DEFAULT 0,
  refund_method TEXT NOT NULL DEFAULT 'cash',
  notes TEXT,
  processed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_returns TO authenticated;
GRANT ALL ON public.sale_returns TO service_role;
ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view sale_returns" ON public.sale_returns
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));
CREATE POLICY "Members can create sale_returns" ON public.sale_returns
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT get_user_org_ids(auth.uid())));
CREATE POLICY "Admins can delete sale_returns" ON public.sale_returns
  FOR DELETE TO authenticated
  USING (has_org_role(auth.uid(), organization_id, 'admin'::app_role));

-- ============ sale_return_items ============
CREATE TABLE IF NOT EXISTS public.sale_return_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  sale_return_id UUID NOT NULL,
  product_id UUID NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_return_items TO authenticated;
GRANT ALL ON public.sale_return_items TO service_role;
ALTER TABLE public.sale_return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view sale_return_items" ON public.sale_return_items
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));
CREATE POLICY "Members can create sale_return_items" ON public.sale_return_items
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT get_user_org_ids(auth.uid())));
CREATE POLICY "Admins can delete sale_return_items" ON public.sale_return_items
  FOR DELETE TO authenticated
  USING (has_org_role(auth.uid(), organization_id, 'admin'::app_role));

-- ============ Stock restore trigger on returns ============
CREATE OR REPLACE FUNCTION public.restore_stock_on_return()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.products p
  SET stock_quantity = p.stock_quantity + NEW.quantity,
      updated_at = now()
  WHERE p.id = NEW.product_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restore_stock_on_return ON public.sale_return_items;
CREATE TRIGGER trg_restore_stock_on_return
  AFTER INSERT ON public.sale_return_items
  FOR EACH ROW EXECUTE FUNCTION public.restore_stock_on_return();
