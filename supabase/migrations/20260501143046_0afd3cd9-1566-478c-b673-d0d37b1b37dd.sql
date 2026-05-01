
-- 1. Fix PRIVILEGE_ESCALATION: Remove the dangerous self-insert policy on organization_members
DROP POLICY IF EXISTS "Users can insert themselves via invitation" ON public.organization_members;

-- 2. Fix EXPOSED_SENSITIVE_DATA: Restrict profile visibility to same-org users
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Profiles visible to same-org members"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT om.user_id FROM public.organization_members om
    WHERE om.organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
  )
  OR user_id = auth.uid()
);

-- 3. Fix MISSING_RLS_PROTECTION: Add UPDATE policy on attachments storage
CREATE POLICY "Org members can update attachments"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.organizations
    WHERE id IN (SELECT public.get_user_org_ids(auth.uid()))
  )
);

-- 4. Revoke EXECUTE from anon on all SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_org_ids(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_organization_with_admin(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon;
REVOKE EXECUTE ON FUNCTION public.decrement_stock_on_order_complete() FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_automations() FROM anon;
