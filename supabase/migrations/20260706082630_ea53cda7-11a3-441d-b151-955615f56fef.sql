
-- 1) mpesa_stk_rate_limits: explicitly deny all client writes.
-- The check_mpesa_stk_rate_limit RPC uses the service role, which bypasses RLS.
CREATE POLICY "Deny client inserts to rate limits"
  ON public.mpesa_stk_rate_limits
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY "Deny client updates to rate limits"
  ON public.mpesa_stk_rate_limits
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Deny client deletes of rate limits"
  ON public.mpesa_stk_rate_limits
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated, anon
  USING (false);

-- 2) staff_invitations: prevent org admins from reading raw token_hash values.
-- The get_invitation_by_token / accept_invitation SECURITY DEFINER RPCs do the
-- token lookup server-side, so no client role needs to read this column.
REVOKE SELECT (token_hash) ON public.staff_invitations FROM authenticated, anon;
