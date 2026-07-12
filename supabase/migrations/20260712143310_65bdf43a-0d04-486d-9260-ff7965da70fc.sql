
DROP POLICY IF EXISTS "Admins can update member roles" ON public.organization_members;
CREATE POLICY "Admins can update member roles" ON public.organization_members
  FOR UPDATE TO authenticated
  USING (has_org_role(auth.uid(), organization_id, 'admin'::app_role) AND (user_id <> auth.uid()))
  WITH CHECK (has_org_role(auth.uid(), organization_id, 'admin'::app_role) AND (user_id <> auth.uid()));

DROP POLICY IF EXISTS "Permissions are readable by all" ON public.permissions;
CREATE POLICY "Permissions readable by authenticated" ON public.permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Role permissions readable by all" ON public.role_permissions;
CREATE POLICY "Role permissions readable by authenticated" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON public.permissions FROM anon;
REVOKE SELECT ON public.role_permissions FROM anon;
GRANT SELECT ON public.permissions TO authenticated;
GRANT SELECT ON public.role_permissions TO authenticated;
