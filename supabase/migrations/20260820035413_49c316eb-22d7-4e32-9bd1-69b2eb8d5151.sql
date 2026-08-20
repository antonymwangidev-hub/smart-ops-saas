CREATE TABLE public.whatsapp_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  body TEXT NOT NULL,
  placeholders TEXT[] NOT NULL DEFAULT '{}',
  category TEXT NOT NULL DEFAULT 'utility',
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view templates"
ON public.whatsapp_templates FOR SELECT TO authenticated
USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Admins can create templates"
ON public.whatsapp_templates FOR INSERT TO authenticated
WITH CHECK (organization_id IN (SELECT get_user_org_ids(auth.uid())) AND has_org_role(auth.uid(), organization_id, 'admin'::app_role) AND created_by = auth.uid());

CREATE POLICY "Admins can update templates"
ON public.whatsapp_templates FOR UPDATE TO authenticated
USING (organization_id IN (SELECT get_user_org_ids(auth.uid())) AND has_org_role(auth.uid(), organization_id, 'admin'::app_role))
WITH CHECK (organization_id IN (SELECT get_user_org_ids(auth.uid())) AND has_org_role(auth.uid(), organization_id, 'admin'::app_role));

CREATE POLICY "Admins can delete templates"
ON public.whatsapp_templates FOR DELETE TO authenticated
USING (organization_id IN (SELECT get_user_org_ids(auth.uid())) AND has_org_role(auth.uid(), organization_id, 'admin'::app_role));

CREATE TRIGGER update_whatsapp_templates_updated_at
BEFORE UPDATE ON public.whatsapp_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();