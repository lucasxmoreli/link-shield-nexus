CREATE POLICY "Anon can read active campaigns by hash"
  ON public.campaigns
  FOR SELECT
  TO anon
  USING (is_active = true);