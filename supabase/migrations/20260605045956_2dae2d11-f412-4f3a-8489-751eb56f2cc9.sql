
-- 1) organization_members: explicit INSERT policy (admin-only). The create_organization_with_admin RPC is SECURITY DEFINER so it bypasses RLS for first-admin bootstrap.
DROP POLICY IF EXISTS "Admins can insert members" ON public.organization_members;
CREATE POLICY "Admins can insert members"
ON public.organization_members
FOR INSERT
TO authenticated
WITH CHECK (public.has_org_role(auth.uid(), organization_id, 'admin'::app_role));

-- 2) platform_admins: only the requester's own row is visible
DROP POLICY IF EXISTS "Only platform admins can view" ON public.platform_admins;
CREATE POLICY "Platform admins can view own row"
ON public.platform_admins
FOR SELECT
TO authenticated
USING (email = (auth.jwt() ->> 'email'));

-- 3) Realtime messages: scope subscriptions by org topic prefix "org:<uuid>:..."
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members can read realtime" ON realtime.messages;
CREATE POLICY "Org members can read realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  split_part(realtime.topic(), ':', 1) = 'org'
  AND public.is_org_member(
    auth.uid(),
    NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid
  )
);

DROP POLICY IF EXISTS "Org members can send realtime" ON realtime.messages;
CREATE POLICY "Org members can send realtime"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  split_part(realtime.topic(), ':', 1) = 'org'
  AND public.is_org_member(
    auth.uid(),
    NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid
  )
);

-- 4) Revoke EXECUTE on internal trigger/helper SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_automations() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_stock_on_sale() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_stock_on_order_complete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_stock_on_return() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_stock_on_po_received() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_supplier_balance_from_payment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_supplier_balance_from_po() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_credit_payment_sync() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_supplier_balance(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_credit_sale(uuid) FROM PUBLIC, anon, authenticated;
