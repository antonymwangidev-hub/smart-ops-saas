
-- Create a function that atomically creates an org and adds the creator as admin
CREATE OR REPLACE FUNCTION public.create_organization_with_admin(org_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
BEGIN
  INSERT INTO public.organizations (name) VALUES (org_name) RETURNING id INTO new_org_id;
  INSERT INTO public.organization_members (user_id, organization_id, role) VALUES (auth.uid(), new_org_id, 'admin');
  RETURN new_org_id;
END;
$$;
