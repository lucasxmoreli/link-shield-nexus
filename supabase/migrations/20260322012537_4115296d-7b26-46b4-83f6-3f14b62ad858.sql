ALTER TABLE public.requests_log
  ADD COLUMN IF NOT EXISTS source_platform text,
  ADD COLUMN IF NOT EXISTS campaign_name_platform text,
  ADD COLUMN IF NOT EXISTS cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_id text,
  ADD COLUMN IF NOT EXISTS is_unique boolean DEFAULT false;