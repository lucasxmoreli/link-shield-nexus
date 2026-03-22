ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS postback_url text DEFAULT NULL;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS postback_method text NOT NULL DEFAULT 'GET';