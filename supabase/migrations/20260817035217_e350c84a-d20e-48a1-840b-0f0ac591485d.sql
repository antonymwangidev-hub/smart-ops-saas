DROP POLICY IF EXISTS "Members can create activity logs" ON public.activity_logs;
CREATE POLICY "Members can create activity logs"
ON public.activity_logs FOR INSERT TO authenticated
WITH CHECK (
  organization_id IN (SELECT get_user_org_ids(auth.uid()))
  AND (user_id IS NULL OR user_id = auth.uid())
);