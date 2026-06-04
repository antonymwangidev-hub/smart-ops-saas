
-- Add due_date and reminder tracking to credit_sales
ALTER TABLE public.credit_sales
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_count integer NOT NULL DEFAULT 0;

-- EXPENSE CATEGORIES
CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org view expense cats" ON public.expense_categories FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "staff manage expense cats" ON public.expense_categories FOR ALL TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
         AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'staff')))
  WITH CHECK (organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
         AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'staff')));

-- EXPENSES
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  category_name text,
  description text NOT NULL,
  amount numeric NOT NULL,
  payment_method text NOT NULL DEFAULT 'cash',
  reference text,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  is_recurring boolean NOT NULL DEFAULT false,
  recurring_period text, -- daily | weekly | monthly | yearly
  receipt_url text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org view expenses" ON public.expenses FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "staff manage expenses" ON public.expenses FOR ALL TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
         AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'staff')))
  WITH CHECK (organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
         AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'staff')));
CREATE TRIGGER expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CREDIT PAYMENTS (payment history for credit_sales)
CREATE TABLE public.credit_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  credit_sale_id uuid NOT NULL REFERENCES public.credit_sales(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  payment_method text NOT NULL DEFAULT 'cash',
  reference text,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_payments TO authenticated;
GRANT ALL ON public.credit_payments TO service_role;
ALTER TABLE public.credit_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org view credit payments" ON public.credit_payments FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "staff manage credit payments" ON public.credit_payments FOR ALL TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
         AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'staff')))
  WITH CHECK (organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
         AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'staff')));

-- TRIGGER: keep credit_sales.amount_paid + is_settled in sync with credit_payments
CREATE OR REPLACE FUNCTION public.recompute_credit_sale(_credit_sale_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  total_paid numeric;
  sale_total numeric;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM public.credit_payments WHERE credit_sale_id = _credit_sale_id;

  SELECT total_amount INTO sale_total FROM public.credit_sales WHERE id = _credit_sale_id;

  UPDATE public.credit_sales
  SET amount_paid = total_paid,
      is_settled = (total_paid >= COALESCE(sale_total, 0)),
      updated_at = now()
  WHERE id = _credit_sale_id;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_credit_payment_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_credit_sale(OLD.credit_sale_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_credit_sale(NEW.credit_sale_id);
    RETURN NEW;
  END IF;
END; $$;

CREATE TRIGGER credit_payment_sync
AFTER INSERT OR UPDATE OR DELETE ON public.credit_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_credit_payment_sync();

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_expenses_org_date ON public.expenses(organization_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_credit_payments_sale ON public.credit_payments(credit_sale_id);
CREATE INDEX IF NOT EXISTS idx_credit_sales_org_due ON public.credit_sales(organization_id, due_date);
