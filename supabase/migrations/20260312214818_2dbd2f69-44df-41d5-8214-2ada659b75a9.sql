
CREATE POLICY "Authenticated can insert invite codes"
  ON public.invite_codes
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
