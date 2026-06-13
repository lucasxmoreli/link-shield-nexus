ALTER TABLE public.requests_log
  ADD COLUMN IF NOT EXISTS is_conversion boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS revenue numeric DEFAULT 0;