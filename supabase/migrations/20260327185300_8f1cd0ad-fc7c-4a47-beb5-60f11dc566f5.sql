
CREATE TABLE public.mpesa_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  order_id uuid REFERENCES public.orders(id),
  phone_number text NOT NULL,
  amount numeric NOT NULL,
  merchant_request_id text,
  checkout_request_id text,
  result_code integer,
  result_desc text,
  mpesa_receipt_number text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mpesa_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view mpesa payments"
  ON public.mpesa_payments FOR SELECT TO authenticated
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Members can create mpesa payments"
  ON public.mpesa_payments FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Members can update mpesa payments"
  ON public.mpesa_payments FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE TRIGGER update_mpesa_payments_updated_at
  BEFORE UPDATE ON public.mpesa_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.mpesa_payments;
