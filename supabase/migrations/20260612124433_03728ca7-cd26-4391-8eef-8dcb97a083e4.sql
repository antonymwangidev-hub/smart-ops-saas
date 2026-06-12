
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS mpesa_shortcode text,
  ADD COLUMN IF NOT EXISTS mpesa_shortcode_type text NOT NULL DEFAULT 'paybill' CHECK (mpesa_shortcode_type IN ('paybill','till')),
  ADD COLUMN IF NOT EXISTS mpesa_account_reference text;
