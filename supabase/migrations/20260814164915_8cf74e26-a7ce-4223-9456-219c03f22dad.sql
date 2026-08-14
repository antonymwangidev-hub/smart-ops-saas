REVOKE EXECUTE ON FUNCTION public.accept_invitation(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_organization_with_admin(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_org_ids(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_permissions(uuid, uuid) FROM anon;

DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete their own notifications"
ON public.notifications FOR DELETE TO authenticated
USING (user_id = auth.uid() AND public.is_org_member(auth.uid(), organization_id));