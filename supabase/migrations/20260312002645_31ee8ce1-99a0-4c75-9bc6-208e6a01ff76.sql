
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS safe_page_method text NOT NULL DEFAULT 'redirect',
  ADD COLUMN IF NOT EXISTS offer_page_method text NOT NULL DEFAULT 'redirect',
  ADD COLUMN IF NOT EXISTS target_countries text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS target_devices text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
