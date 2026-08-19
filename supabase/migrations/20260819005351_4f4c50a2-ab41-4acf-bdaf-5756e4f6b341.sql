DROP POLICY IF EXISTS "Members can update credit sales" ON public.credit_sales;
CREATE POLICY "Elevated roles can update credit sales"
ON public.credit_sales FOR UPDATE TO authenticated
USING (organization_id IN (SELECT get_user_org_ids(auth.uid())) AND has_org_role(auth.uid(), organization_id, 'accountant'::app_role))
WITH CHECK (organization_id IN (SELECT get_user_org_ids(auth.uid())) AND has_org_role(auth.uid(), organization_id, 'accountant'::app_role));

DROP POLICY IF EXISTS "Members can update mpesa payments" ON public.mpesa_payments;
CREATE POLICY "Admins can update mpesa payments"
ON public.mpesa_payments FOR UPDATE TO authenticated
USING (organization_id IN (SELECT get_user_org_ids(auth.uid())) AND has_org_role(auth.uid(), organization_id, 'admin'::app_role))
WITH CHECK (organization_id IN (SELECT get_user_org_ids(auth.uid())) AND has_org_role(auth.uid(), organization_id, 'admin'::app_role));