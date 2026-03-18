CREATE POLICY "Anyone can view active campaigns by hash"
ON public.campaigns
FOR SELECT
TO anon, authenticated
USING (is_active = true);