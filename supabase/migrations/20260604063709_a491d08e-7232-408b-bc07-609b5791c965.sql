
-- SUPPLIERS
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  payment_terms text,
  notes text,
  outstanding_balance numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members view suppliers" ON public.suppliers FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "staff manage suppliers" ON public.suppliers FOR ALL TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
    AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'staff'))
  )
  WITH CHECK (
    organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
    AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'staff'))
  );
CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PURCHASE ORDERS
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  po_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft', -- draft | approved | ordered | received | cancelled
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_date date,
  received_date date,
  subtotal numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, po_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members view POs" ON public.purchase_orders FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "staff manage POs" ON public.purchase_orders FOR ALL TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
    AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'staff'))
  )
  WITH CHECK (
    organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
    AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'staff'))
  );
CREATE TRIGGER purchase_orders_updated_at BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PURCHASE ORDER ITEMS
CREATE TABLE public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  received_quantity numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members view PO items" ON public.purchase_order_items FOR SELECT TO authenticated
  USING (purchase_order_id IN (
    SELECT id FROM public.purchase_orders
    WHERE organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
  ));
CREATE POLICY "staff manage PO items" ON public.purchase_order_items FOR ALL TO authenticated
  USING (purchase_order_id IN (
    SELECT id FROM public.purchase_orders
    WHERE organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
      AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'staff'))
  ))
  WITH CHECK (purchase_order_id IN (
    SELECT id FROM public.purchase_orders
    WHERE organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
      AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'staff'))
  ));

-- SUPPLIER PAYMENTS
CREATE TABLE public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  payment_method text NOT NULL DEFAULT 'cash',
  reference text,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_payments TO authenticated;
GRANT ALL ON public.supplier_payments TO service_role;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members view supplier payments" ON public.supplier_payments FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "staff manage supplier payments" ON public.supplier_payments FOR ALL TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
    AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'staff'))
  )
  WITH CHECK (
    organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
    AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'staff'))
  );

-- TRIGGER: increment stock when PO status becomes 'received'
CREATE OR REPLACE FUNCTION public.increment_stock_on_po_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'received' AND (OLD.status IS DISTINCT FROM 'received') THEN
    UPDATE public.products p
    SET stock_quantity = p.stock_quantity + COALESCE(poi.received_quantity, poi.quantity),
        cost_price = CASE WHEN poi.unit_cost > 0 THEN poi.unit_cost ELSE p.cost_price END,
        updated_at = now()
    FROM public.purchase_order_items poi
    WHERE poi.purchase_order_id = NEW.id
      AND poi.product_id = p.id;
    NEW.received_date := COALESCE(NEW.received_date, CURRENT_DATE);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER po_received_increment_stock
BEFORE UPDATE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.increment_stock_on_po_received();

-- TRIGGER: update supplier outstanding balance on PO insert/update and payments
CREATE OR REPLACE FUNCTION public.recompute_supplier_balance(_supplier_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_owed numeric;
  total_paid numeric;
BEGIN
  SELECT COALESCE(SUM(total), 0) INTO total_owed
  FROM public.purchase_orders
  WHERE supplier_id = _supplier_id AND status IN ('ordered','received');

  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM public.supplier_payments
  WHERE supplier_id = _supplier_id;

  UPDATE public.suppliers
  SET outstanding_balance = GREATEST(0, total_owed - total_paid),
      updated_at = now()
  WHERE id = _supplier_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_supplier_balance_from_po()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.supplier_id IS NOT NULL THEN PERFORM public.recompute_supplier_balance(OLD.supplier_id); END IF;
    RETURN OLD;
  ELSE
    IF NEW.supplier_id IS NOT NULL THEN PERFORM public.recompute_supplier_balance(NEW.supplier_id); END IF;
    RETURN NEW;
  END IF;
END; $$;

CREATE TRIGGER po_balance_sync
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_supplier_balance_from_po();

CREATE OR REPLACE FUNCTION public.trg_supplier_balance_from_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_supplier_balance(OLD.supplier_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_supplier_balance(NEW.supplier_id);
    RETURN NEW;
  END IF;
END; $$;

CREATE TRIGGER payment_balance_sync
AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_supplier_balance_from_payment();
