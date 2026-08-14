-- WhatsApp gateway credentials (server-side only; NEVER readable by the browser)
CREATE TABLE IF NOT EXISTS public.whatsapp_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  webhook_secret TEXT,
  webhook_url TEXT,
  business_name TEXT,
  whatsapp_connected BOOLEAN NOT NULL DEFAULT false,
  receiving_active BOOLEAN NOT NULL DEFAULT false,
  templates JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_error TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Service role only: no grants to anon/authenticated at all.
GRANT ALL ON public.whatsapp_settings TO service_role;
ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
  channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp','sms')),
  phone TEXT NOT NULL,
  body TEXT,
  template_name TEXT,
  variables JSONB,
  gateway_message_id TEXT,
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  error TEXT,
  matched BOOLEAN NOT NULL DEFAULT true,
  sent_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_messages_org_created_idx ON public.whatsapp_messages(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_messages_gateway_id_idx ON public.whatsapp_messages(gateway_message_id);

GRANT SELECT ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view whatsapp messages" ON public.whatsapp_messages;
CREATE POLICY "Org members can view whatsapp messages"
ON public.whatsapp_messages FOR SELECT TO authenticated
USING (public.is_org_member(auth.uid(), organization_id));

-- Customer consent fields
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_source TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at TIMESTAMPTZ;

-- Non-secret connection status for org admins (no keys or secrets exposed)
CREATE OR REPLACE FUNCTION public.whatsapp_connection_status(_org_id UUID)
RETURNS TABLE (
  configured BOOLEAN,
  base_url TEXT,
  business_name TEXT,
  whatsapp_connected BOOLEAN,
  receiving_active BOOLEAN,
  webhook_url TEXT,
  templates JSONB,
  last_error TEXT,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT true, s.base_url, s.business_name, s.whatsapp_connected,
         s.receiving_active, s.webhook_url, s.templates, s.last_error, s.updated_at
  FROM public.whatsapp_settings s
  WHERE s.organization_id = _org_id
    AND public.has_org_role(auth.uid(), _org_id, 'admin');
$$;

REVOKE ALL ON FUNCTION public.whatsapp_connection_status(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_connection_status(UUID) TO authenticated, service_role;

DROP TRIGGER IF EXISTS whatsapp_messages_updated_at ON public.whatsapp_messages;
CREATE TRIGGER whatsapp_messages_updated_at BEFORE UPDATE ON public.whatsapp_messages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS whatsapp_settings_updated_at ON public.whatsapp_settings;
CREATE TRIGGER whatsapp_settings_updated_at BEFORE UPDATE ON public.whatsapp_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();