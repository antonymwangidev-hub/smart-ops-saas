
-- Add token_hash and backfill using built-in sha256
ALTER TABLE public.staff_invitations
  ADD COLUMN IF NOT EXISTS token_hash text;

UPDATE public.staff_invitations
   SET token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex')
 WHERE token_hash IS NULL AND token IS NOT NULL;

ALTER TABLE public.staff_invitations DROP COLUMN IF EXISTS token;

CREATE UNIQUE INDEX IF NOT EXISTS staff_invitations_token_hash_uidx
  ON public.staff_invitations(token_hash);

CREATE OR REPLACE FUNCTION public.get_invitation_by_token(_token text)
RETURNS TABLE(id uuid, organization_id uuid, organization_name text, email text, full_name text, role app_role, status text, expires_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT i.id, i.organization_id, o.name AS organization_name,
         i.email, i.full_name, i.role, i.status, i.expires_at
  FROM public.staff_invitations i
  JOIN public.organizations o ON o.id = i.organization_id
  WHERE i.token_hash = encode(sha256(convert_to(_token, 'UTF8')), 'hex')
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inv RECORD;
  caller_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO inv FROM public.staff_invitations
    WHERE token_hash = encode(sha256(convert_to(_token, 'UTF8')), 'hex')
    LIMIT 1;
  IF inv IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  IF inv.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_' || inv.status);
  END IF;
  IF inv.expires_at < now() THEN
    UPDATE public.staff_invitations SET status='expired' WHERE id = inv.id;
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  END IF;

  SELECT email INTO caller_email FROM auth.users WHERE id = auth.uid();
  IF lower(coalesce(caller_email,'')) <> lower(inv.email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'email_mismatch', 'expected', inv.email);
  END IF;

  INSERT INTO public.organization_members(user_id, organization_id, role, status, branch_id)
  VALUES (auth.uid(), inv.organization_id, inv.role, 'active', inv.branch_id)
  ON CONFLICT (user_id, organization_id) DO UPDATE
    SET role = EXCLUDED.role,
        status = 'active',
        branch_id = COALESCE(EXCLUDED.branch_id, public.organization_members.branch_id);

  UPDATE public.staff_invitations
    SET status='accepted', accepted_at=now(), accepted_user_id=auth.uid(), updated_at=now()
    WHERE id = inv.id;

  RETURN jsonb_build_object('success', true, 'organization_id', inv.organization_id, 'role', inv.role);
END; $$;

DROP POLICY IF EXISTS "Org admins/managers can view invitations" ON public.staff_invitations;
CREATE POLICY "Org admins can view invitations"
  ON public.staff_invitations
  FOR SELECT
  TO authenticated
  USING (has_org_role(auth.uid(), organization_id, 'admin'::app_role));
