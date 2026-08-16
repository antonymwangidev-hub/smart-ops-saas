DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

CREATE POLICY "Users can create their own notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.is_org_member(auth.uid(), organization_id)
);