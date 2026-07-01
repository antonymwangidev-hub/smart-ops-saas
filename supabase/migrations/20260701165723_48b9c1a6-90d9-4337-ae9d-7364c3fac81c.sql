
-- 1) staff_invitations: hide token column from client SELECTs
REVOKE SELECT ON public.staff_invitations FROM authenticated;
GRANT SELECT (id, organization_id, email, full_name, phone, role, branch_id, invited_by, status, expires_at, accepted_at, accepted_user_id, created_at, updated_at) ON public.staff_invitations TO authenticated;
-- Keep insert/update/delete grants intact (they were already present); service_role retains ALL.

-- 2) organization_members: prevent self role-change
DROP POLICY IF EXISTS "Admins can update member roles" ON public.organization_members;
CREATE POLICY "Admins can update member roles"
  ON public.organization_members
  FOR UPDATE
  USING (
    has_org_role(auth.uid(), organization_id, 'admin'::app_role)
    AND user_id <> auth.uid()
  )
  WITH CHECK (
    has_org_role(auth.uid(), organization_id, 'admin'::app_role)
    AND user_id <> auth.uid()
  );
