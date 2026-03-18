-- 1. Add block_reason to requests_log
ALTER TABLE public.requests_log ADD COLUMN IF NOT EXISTS block_reason text;

-- 2. Add strict_mode to campaigns
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS strict_mode boolean NOT NULL DEFAULT false;

-- 3. Create blocked_ips table
CREATE TABLE IF NOT EXISTS public.blocked_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  user_id uuid NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE INDEX IF NOT EXISTS idx_blocked_ips_ip ON public.blocked_ips (ip_address);
CREATE INDEX IF NOT EXISTS idx_blocked_ips_user ON public.blocked_ips (user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_ips_expires ON public.blocked_ips (expires_at);

ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own blocked IPs" ON public.blocked_ips
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own blocked IPs" ON public.blocked_ips
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);