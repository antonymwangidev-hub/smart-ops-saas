
-- 1) Add SELECT policy for mpesa_stk_rate_limits (users can see their own rows)
CREATE POLICY "Users can view their own rate limits"
  ON public.mpesa_stk_rate_limits
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 2) Re-rank 'staff' above operational roles in has_org_role
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
      WHEN 'storekeeper' THEN 65
      WHEN 'staff'       THEN 60
      WHEN 'cashier'     THEN 50
      WHEN 'attendant'   THEN 40
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
        WHEN 'storekeeper' THEN 65
        WHEN 'staff'       THEN 60
        WHEN 'cashier'     THEN 50
        WHEN 'attendant'   THEN 40
        ELSE 0
      END >= r.required
  )
$function$;
