ALTER TABLE public.domains
ADD COLUMN cloudflare_hostname_id text,
ADD COLUMN ssl_status text DEFAULT 'pending';