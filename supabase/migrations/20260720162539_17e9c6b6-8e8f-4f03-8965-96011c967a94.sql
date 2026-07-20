CREATE OR REPLACE FUNCTION public.user_permissions(_user_id uuid, _org_id uuid)
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT rp.permission_key
  FROM public.organization_members om
  JOIN public.role_permissions rp ON rp.role = om.role
  WHERE om.user_id = _user_id
    AND om.organization_id = _org_id
    AND COALESCE(om.status, 'active') = 'active'
    AND (
      _user_id = auth.uid()
      OR public.has_org_role(auth.uid(), _org_id, 'admin')
    );
$function$;