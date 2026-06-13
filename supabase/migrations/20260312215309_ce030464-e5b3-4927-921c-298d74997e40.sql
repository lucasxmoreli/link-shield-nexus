
CREATE POLICY "Authenticated can delete unused invite codes"
  ON public.invite_codes
  FOR DELETE
  TO authenticated
  USING (is_used = false);
