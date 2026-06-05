
-- 1) Extend role enum additively
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cashier';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'storekeeper';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accountant';

-- 2) Branches
CREATE TABLE IF NOT EXISTS public.branches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  address text,
  phone text,
  manager_user_id uuid,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_branches_org ON public.branches(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view branches" ON public.branches
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "Admins manage branches" ON public.branches
  FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'admin'::app_role))
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, 'admin'::app_role));

CREATE TRIGGER trg_branches_updated_at BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Add branch_id to existing tables (nullable, additive)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.sale_returns ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.organization_members ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

-- 4) Stock transfers
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  destination_branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  reference text,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  created_by uuid,
  transferred_at timestamptz,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_transfers TO authenticated;
GRANT ALL ON public.stock_transfers TO service_role;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members view transfers" ON public.stock_transfers
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE POLICY "Org members manage transfers" ON public.stock_transfers
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT public.get_user_org_ids(auth.uid())))
  WITH CHECK (organization_id IN (SELECT public.get_user_org_ids(auth.uid())));
CREATE TRIGGER trg_stock_transfers_updated_at BEFORE UPDATE ON public.stock_transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transfer_id uuid NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0,
  received_quantity numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_transfer_items TO authenticated;
GRANT ALL ON public.stock_transfer_items TO service_role;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members view transfer items" ON public.stock_transfer_items
  FOR SELECT TO authenticated
  USING (transfer_id IN (SELECT id FROM public.stock_transfers WHERE organization_id IN (SELECT public.get_user_org_ids(auth.uid()))));
CREATE POLICY "Org members manage transfer items" ON public.stock_transfer_items
  FOR ALL TO authenticated
  USING (transfer_id IN (SELECT id FROM public.stock_transfers WHERE organization_id IN (SELECT public.get_user_org_ids(auth.uid()))))
  WITH CHECK (transfer_id IN (SELECT id FROM public.stock_transfers WHERE organization_id IN (SELECT public.get_user_org_ids(auth.uid()))));

-- Stamp received_at when status flips
CREATE OR REPLACE FUNCTION public.mark_transfer_received()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'received' AND (OLD.status IS DISTINCT FROM 'received') THEN
    NEW.received_at := COALESCE(NEW.received_at, now());
  END IF;
  IF NEW.status = 'in_transit' AND (OLD.status IS DISTINCT FROM 'in_transit') THEN
    NEW.transferred_at := COALESCE(NEW.transferred_at, now());
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.mark_transfer_received() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_stock_transfer_status BEFORE UPDATE ON public.stock_transfers
  FOR EACH ROW EXECUTE FUNCTION public.mark_transfer_received();

-- 5) Staff attendance
CREATE TABLE IF NOT EXISTS public.staff_attendance (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  clock_in timestamptz NOT NULL DEFAULT now(),
  clock_out timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON public.staff_attendance(user_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_attendance_org_date ON public.staff_attendance(organization_id, clock_in DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_attendance TO authenticated;
GRANT ALL ON public.staff_attendance TO service_role;
ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own or admins view all attendance" ON public.staff_attendance
  FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
    AND (
      user_id = auth.uid()
      OR public.has_org_role(auth.uid(), organization_id, 'admin'::app_role)
    )
  );
CREATE POLICY "Users insert own attendance" ON public.staff_attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
  );
CREATE POLICY "Users update own attendance" ON public.staff_attendance
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_org_role(auth.uid(), organization_id, 'admin'::app_role))
  WITH CHECK (user_id = auth.uid() OR public.has_org_role(auth.uid(), organization_id, 'admin'::app_role));
CREATE POLICY "Admins delete attendance" ON public.staff_attendance
  FOR DELETE TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'admin'::app_role));
