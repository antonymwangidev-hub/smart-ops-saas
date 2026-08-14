DROP POLICY IF EXISTS "Org admins/managers can insert invitations" ON public.staff_invitations;
CREATE POLICY "Org admins/managers can insert invitations"
ON public.staff_invitations FOR INSERT TO authenticated
WITH CHECK (
  (
    has_org_role(auth.uid(), organization_id, 'admin'::app_role)
    OR has_org_role(auth.uid(), organization_id, 'manager'::app_role)
  )
  AND (
    role::text NOT IN ('admin','manager')
    OR has_org_role(auth.uid(), organization_id, 'admin'::app_role)
  )
);

DROP POLICY IF EXISTS "Org admins/managers can update invitations" ON public.staff_invitations;
CREATE POLICY "Org admins/managers can update invitations"
ON public.staff_invitations FOR UPDATE TO authenticated
USING (
  (
    has_org_role(auth.uid(), organization_id, 'admin'::app_role)
    OR has_org_role(auth.uid(), organization_id, 'manager'::app_role)
  )
  AND (
    role::text NOT IN ('admin','manager')
    OR has_org_role(auth.uid(), organization_id, 'admin'::app_role)
  )
)
WITH CHECK (
  (
    has_org_role(auth.uid(), organization_id, 'admin'::app_role)
    OR has_org_role(auth.uid(), organization_id, 'manager'::app_role)
  )
  AND (
    role::text NOT IN ('admin','manager')
    OR has_org_role(auth.uid(), organization_id, 'admin'::app_role)
  )
);