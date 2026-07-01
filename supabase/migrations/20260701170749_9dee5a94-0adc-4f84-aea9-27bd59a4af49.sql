
-- 1) find_user_by_email RPC (O(1) lookup by email in auth.users)
CREATE OR REPLACE FUNCTION public.find_user_by_email(_email text)
RETURNS TABLE(id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.email::text, u.created_at, u.last_sign_in_at
  FROM auth.users u
  WHERE lower(u.email) = lower(_email)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_user_by_email(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_user_by_email(text) TO service_role;

-- 2) Rate-limit table + RPC for mpesa-stk-push
CREATE TABLE IF NOT EXISTS public.mpesa_stk_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone_number text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.mpesa_stk_rate_limits TO service_role;
ALTER TABLE public.mpesa_stk_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (edge function) touches this table.

CREATE INDEX IF NOT EXISTS mpesa_stk_rate_limits_user_phone_idx
  ON public.mpesa_stk_rate_limits (user_id, phone_number, window_start DESC);

-- Returns jsonb: { allowed: bool, retry_after_seconds: int, reason: text }
-- Limits (per user):
--   * per-phone: max 3 STK pushes to the same phone per 10 minutes
--   * global:    max 15 STK pushes per user per hour
CREATE OR REPLACE FUNCTION public.check_mpesa_stk_rate_limit(_user_id uuid, _phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  phone_count int;
  user_count int;
  oldest_phone timestamptz;
BEGIN
  -- Purge windows > 1 hour to keep table small
  DELETE FROM public.mpesa_stk_rate_limits
   WHERE window_start < now() - interval '1 hour';

  SELECT count(*), min(window_start)
    INTO phone_count, oldest_phone
    FROM public.mpesa_stk_rate_limits
   WHERE user_id = _user_id
     AND phone_number = _phone
     AND window_start >= now() - interval '10 minutes';

  IF phone_count >= 3 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'too_many_requests_to_phone',
      'retry_after_seconds', GREATEST(1, 600 - EXTRACT(EPOCH FROM (now() - oldest_phone))::int)
    );
  END IF;

  SELECT count(*) INTO user_count
    FROM public.mpesa_stk_rate_limits
   WHERE user_id = _user_id
     AND window_start >= now() - interval '1 hour';

  IF user_count >= 15 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'user_hourly_limit',
      'retry_after_seconds', 300
    );
  END IF;

  INSERT INTO public.mpesa_stk_rate_limits(user_id, phone_number)
  VALUES (_user_id, _phone);

  RETURN jsonb_build_object('allowed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.check_mpesa_stk_rate_limit(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_mpesa_stk_rate_limit(uuid, text) TO service_role;
