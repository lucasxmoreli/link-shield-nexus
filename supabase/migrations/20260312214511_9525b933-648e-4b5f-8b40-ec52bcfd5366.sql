
CREATE TABLE public.invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  is_used BOOLEAN NOT NULL DEFAULT false,
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read codes for validation (anon can check)
CREATE POLICY "Anyone can validate invite codes"
  ON public.invite_codes
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow anon to update (mark as used during signup)
CREATE POLICY "Anon can use invite codes"
  ON public.invite_codes
  FOR UPDATE
  TO anon, authenticated
  USING (is_used = false)
  WITH CHECK (is_used = true);

-- Insert some sample invite codes
INSERT INTO public.invite_codes (code) VALUES
  ('CLOAK-2024-ALPHA'),
  ('CLOAK-2024-BETA'),
  ('CLOAK-VIP-001');
