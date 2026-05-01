
-- Sales table for POS transactions
CREATE TABLE public.sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'mpesa')),
  cash_received NUMERIC DEFAULT 0,
  change_given NUMERIC DEFAULT 0,
  is_credit BOOLEAN NOT NULL DEFAULT false,
  customer_name TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view sales" ON public.sales FOR SELECT TO authenticated
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Members can create sales" ON public.sales FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Admins can delete sales" ON public.sales FOR DELETE TO authenticated
  USING (has_org_role(auth.uid(), organization_id, 'admin'));

-- Sale items
CREATE TABLE public.sale_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  organization_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view sale items" ON public.sale_items FOR SELECT TO authenticated
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Members can create sale items" ON public.sale_items FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT get_user_org_ids(auth.uid())));

-- Credit sales (deni) tracking
CREATE TABLE public.credit_sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  is_settled BOOLEAN NOT NULL DEFAULT false,
  sale_id UUID REFERENCES public.sales(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view credit sales" ON public.credit_sales FOR SELECT TO authenticated
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Members can create credit sales" ON public.credit_sales FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Members can update credit sales" ON public.credit_sales FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Admins can delete credit sales" ON public.credit_sales FOR DELETE TO authenticated
  USING (has_org_role(auth.uid(), organization_id, 'admin'));

-- Trigger: auto-decrement stock on sale creation
CREATE OR REPLACE FUNCTION public.decrement_stock_on_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.products p
  SET stock_quantity = GREATEST(0, p.stock_quantity - NEW.quantity),
      updated_at = now()
  WHERE p.id = NEW.product_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_decrement_stock_on_sale
AFTER INSERT ON public.sale_items
FOR EACH ROW
EXECUTE FUNCTION public.decrement_stock_on_sale();

-- Trigger for credit_sales updated_at
CREATE TRIGGER update_credit_sales_updated_at
BEFORE UPDATE ON public.credit_sales
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for daily queries
CREATE INDEX idx_sales_org_created ON public.sales(organization_id, created_at DESC);
CREATE INDEX idx_sale_items_sale ON public.sale_items(sale_id);
CREATE INDEX idx_credit_sales_org ON public.credit_sales(organization_id, is_settled);
