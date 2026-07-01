
CREATE OR REPLACE FUNCTION public.has_org_role(_user_id uuid, _org_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH rank AS (
    SELECT CASE _role::text
      WHEN 'admin'       THEN 100
      WHEN 'manager'     THEN 80
      WHEN 'accountant'  THEN 70
      WHEN 'storekeeper' THEN 60
      WHEN 'cashier'     THEN 50
      WHEN 'attendant'   THEN 40
      WHEN 'staff'       THEN 30
      ELSE 0
    END AS required
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members m, rank r
    WHERE m.user_id = _user_id
      AND m.organization_id = _org_id
      AND CASE m.role::text
        WHEN 'admin'       THEN 100
        WHEN 'manager'     THEN 80
        WHEN 'accountant'  THEN 70
        WHEN 'storekeeper' THEN 60
        WHEN 'cashier'     THEN 50
        WHEN 'attendant'   THEN 40
        WHEN 'staff'       THEN 30
        ELSE 0
      END >= r.required
  )
$function$;
