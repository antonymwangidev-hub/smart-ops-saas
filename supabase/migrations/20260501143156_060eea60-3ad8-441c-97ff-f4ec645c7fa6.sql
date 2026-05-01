
-- Drop all existing attachment policies to start clean
DROP POLICY IF EXISTS "Anyone can view attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete their attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Org members can delete attachments" ON storage.objects;
DROP POLICY IF EXISTS "Org members can upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Org members can view attachments" ON storage.objects;
DROP POLICY IF EXISTS "Org members can update attachments" ON storage.objects;

-- Recreate all 4 policies with org-scoping
CREATE POLICY "Org members can view attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] IN (
  SELECT id::text FROM public.organizations WHERE id IN (SELECT public.get_user_org_ids(auth.uid()))
));

CREATE POLICY "Org members can upload attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'attachments' AND (storage.foldername(name))[1] IN (
  SELECT id::text FROM public.organizations WHERE id IN (SELECT public.get_user_org_ids(auth.uid()))
));

CREATE POLICY "Org members can update attachments"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] IN (
  SELECT id::text FROM public.organizations WHERE id IN (SELECT public.get_user_org_ids(auth.uid()))
));

CREATE POLICY "Org members can delete attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] IN (
  SELECT id::text FROM public.organizations WHERE id IN (SELECT public.get_user_org_ids(auth.uid()))
));
