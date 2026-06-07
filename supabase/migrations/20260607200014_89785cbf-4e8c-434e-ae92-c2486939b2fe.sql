
-- ============ EXTEND organization_members ============
ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

-- ============ staff_invitations ============
CREATE TABLE IF NOT EXISTS public.staff_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  phone text,
  role app_role NOT NULL DEFAULT 'staff',
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending', -- pending | accepted | revoked | expired
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invitation_sent_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_invitations_org ON public.staff_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_email ON public.staff_invitations(lower(email));
CREATE INDEX IF NOT EXISTS idx_staff_invitations_token ON public.staff_invitations(token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_invitations TO authenticated;
GRANT ALL ON public.staff_invitations TO service_role;

ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins/managers can view invitations"
  ON public.staff_invitations FOR SELECT TO authenticated
  USING (
    public.has_org_role(auth.uid(), organization_id, 'admin')
    OR public.has_org_role(auth.uid(), organization_id, 'manager')
  );

CREATE POLICY "Org admins/managers can insert invitations"
  ON public.staff_invitations FOR INSERT TO authenticated
  WITH CHECK (
    public.has_org_role(auth.uid(), organization_id, 'admin')
    OR public.has_org_role(auth.uid(), organization_id, 'manager')
  );

CREATE POLICY "Org admins/managers can update invitations"
  ON public.staff_invitations FOR UPDATE TO authenticated
  USING (
    public.has_org_role(auth.uid(), organization_id, 'admin')
    OR public.has_org_role(auth.uid(), organization_id, 'manager')
  );

CREATE POLICY "Org admins can delete invitations"
  ON public.staff_invitations FOR DELETE TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'admin'));

CREATE TRIGGER trg_staff_invitations_updated
  BEFORE UPDATE ON public.staff_invitations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ permissions catalog ============
CREATE TABLE IF NOT EXISTS public.permissions (
  key text PRIMARY KEY,
  description text,
  category text
);

GRANT SELECT ON public.permissions TO authenticated, anon;
GRANT ALL ON public.permissions TO service_role;

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permissions are readable by all" ON public.permissions FOR SELECT USING (true);

INSERT INTO public.permissions(key, description, category) VALUES
  ('dashboard.view','View dashboard','dashboard'),
  ('pos.use','Use POS','pos'),
  ('inventory.view','View inventory','inventory'),
  ('inventory.edit','Edit inventory','inventory'),
  ('sales.view','View sales','sales'),
  ('sales.create','Create sales','sales'),
  ('reports.view','View reports','reports'),
  ('customers.view','View customers','customers'),
  ('customers.edit','Edit customers','customers'),
  ('suppliers.view','View suppliers','suppliers'),
  ('suppliers.edit','Edit suppliers','suppliers'),
  ('purchases.view','View purchases','purchases'),
  ('purchases.edit','Edit purchases','purchases'),
  ('expenses.view','View expenses','finance'),
  ('expenses.edit','Edit expenses','finance'),
  ('finance.view','View finance','finance'),
  ('debtors.view','View debtors','finance'),
  ('staff.view','View staff','staff'),
  ('staff.create','Invite staff','staff'),
  ('staff.edit','Edit staff','staff'),
  ('staff.delete','Remove staff','staff'),
  ('branches.manage','Manage branches','staff'),
  ('settings.manage','Manage settings','settings'),
  ('billing.manage','Manage billing','settings')
ON CONFLICT (key) DO NOTHING;

-- ============ role_permissions ============
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role app_role NOT NULL,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_key)
);

GRANT SELECT ON public.role_permissions TO authenticated, anon;
GRANT ALL ON public.role_permissions TO service_role;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Role permissions readable by all" ON public.role_permissions FOR SELECT USING (true);

-- Seed defaults
INSERT INTO public.role_permissions(role, permission_key)
SELECT 'admin'::app_role, key FROM public.permissions
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions(role, permission_key) VALUES
  ('manager','dashboard.view'),('manager','pos.use'),
  ('manager','inventory.view'),('manager','inventory.edit'),
  ('manager','sales.view'),('manager','sales.create'),
  ('manager','reports.view'),
  ('manager','customers.view'),('manager','customers.edit'),
  ('manager','suppliers.view'),('manager','suppliers.edit'),
  ('manager','purchases.view'),('manager','purchases.edit'),
  ('manager','expenses.view'),('manager','expenses.edit'),
  ('manager','finance.view'),('manager','debtors.view'),
  ('manager','staff.view'),('manager','staff.create'),('manager','staff.edit')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions(role, permission_key) VALUES
  ('accountant','dashboard.view'),
  ('accountant','sales.view'),('accountant','reports.view'),
  ('accountant','expenses.view'),('accountant','expenses.edit'),
  ('accountant','finance.view'),('accountant','debtors.view'),
  ('accountant','suppliers.view'),('accountant','purchases.view'),
  ('accountant','customers.view')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions(role, permission_key) VALUES
  ('storekeeper','dashboard.view'),
  ('storekeeper','inventory.view'),('storekeeper','inventory.edit'),
  ('storekeeper','suppliers.view'),('storekeeper','suppliers.edit'),
  ('storekeeper','purchases.view'),('storekeeper','purchases.edit')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions(role, permission_key) VALUES
  ('staff','dashboard.view'),('staff','pos.use'),
  ('staff','inventory.view'),
  ('staff','sales.view'),('staff','sales.create'),
  ('staff','reports.view'),
  ('staff','customers.view'),('staff','customers.edit'),
  ('staff','suppliers.view'),('staff','purchases.view')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions(role, permission_key) VALUES
  ('cashier','dashboard.view'),('cashier','pos.use'),
  ('cashier','sales.view'),('cashier','sales.create'),
  ('cashier','customers.view')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions(role, permission_key) VALUES
  ('attendant','pos.use'),('attendant','sales.create')
ON CONFLICT DO NOTHING;

-- ============ RPCs ============

CREATE OR REPLACE FUNCTION public.get_invitation_by_token(_token text)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  organization_name text,
  email text,
  full_name text,
  role app_role,
  status text,
  expires_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT i.id, i.organization_id, o.name AS organization_name,
         i.email, i.full_name, i.role, i.status, i.expires_at
  FROM public.staff_invitations i
  JOIN public.organizations o ON o.id = i.organization_id
  WHERE i.token = _token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  inv RECORD;
  caller_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO inv FROM public.staff_invitations WHERE token = _token LIMIT 1;
  IF inv IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  IF inv.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_' || inv.status);
  END IF;
  IF inv.expires_at < now() THEN
    UPDATE public.staff_invitations SET status='expired' WHERE id = inv.id;
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  END IF;

  SELECT email INTO caller_email FROM auth.users WHERE id = auth.uid();
  IF lower(coalesce(caller_email,'')) <> lower(inv.email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'email_mismatch',
      'expected', inv.email);
  END IF;

  -- Insert or update membership
  INSERT INTO public.organization_members(user_id, organization_id, role, status, branch_id)
  VALUES (auth.uid(), inv.organization_id, inv.role, 'active', inv.branch_id)
  ON CONFLICT (user_id, organization_id) DO UPDATE
    SET role = EXCLUDED.role,
        status = 'active',
        branch_id = COALESCE(EXCLUDED.branch_id, public.organization_members.branch_id);

  UPDATE public.staff_invitations
    SET status='accepted', accepted_at=now(), accepted_user_id=auth.uid(), updated_at=now()
    WHERE id = inv.id;

  RETURN jsonb_build_object('success', true, 'organization_id', inv.organization_id, 'role', inv.role);
END; $$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.user_permissions(_user_id uuid, _org_id uuid)
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT rp.permission_key
  FROM public.organization_members om
  JOIN public.role_permissions rp ON rp.role = om.role
  WHERE om.user_id = _user_id
    AND om.organization_id = _org_id
    AND COALESCE(om.status, 'active') = 'active';
$$;

GRANT EXECUTE ON FUNCTION public.user_permissions(uuid, uuid) TO authenticated;
