
-- 1. Fix organization_members INSERT policy
DROP POLICY IF EXISTS "Users can insert themselves as members" ON public.organization_members;
CREATE POLICY "Users can insert themselves via invitation" ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'staff'
    AND is_org_member(auth.uid(), organization_id)
  );

-- Add UPDATE policy
CREATE POLICY "Admins can update member roles" ON public.organization_members
  FOR UPDATE TO authenticated
  USING (has_org_role(auth.uid(), organization_id, 'admin'))
  WITH CHECK (has_org_role(auth.uid(), organization_id, 'admin'));

-- 2. Lock down platform_admins
CREATE POLICY "No user can insert platform admins" ON public.platform_admins
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "No user can update platform admins" ON public.platform_admins
  FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY "No user can delete platform admins" ON public.platform_admins
  FOR DELETE TO authenticated
  USING (false);

-- 3. Make attachments bucket private
UPDATE storage.buckets SET public = false WHERE id = 'attachments';

-- Drop old storage policies
DROP POLICY IF EXISTS "Anyone can view attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete their attachments" ON storage.objects;

-- Create org-scoped storage policies
CREATE POLICY "Org members can read attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] IN (
      SELECT get_user_org_ids(auth.uid())::text
    )
  );

CREATE POLICY "Org members can upload attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] IN (
      SELECT get_user_org_ids(auth.uid())::text
    )
  );

CREATE POLICY "Org members can delete attachments" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] IN (
      SELECT get_user_org_ids(auth.uid())::text
    )
  );
