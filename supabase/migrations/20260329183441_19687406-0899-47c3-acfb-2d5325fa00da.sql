-- Platform admins table for super admin access
CREATE TABLE public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Only platform admins can view this table
CREATE POLICY "Only platform admins can view" ON public.platform_admins
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'email' IN (SELECT email FROM public.platform_admins));

-- Security definer function to check platform admin status
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins pa
    JOIN auth.users u ON u.email = pa.email
    WHERE u.id = _user_id
  )
$$;

-- Insert the admin
INSERT INTO public.platform_admins (email) VALUES ('antony.mwangi.dev@gmail.com');