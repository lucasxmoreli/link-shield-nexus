
-- Drop the existing overly broad SELECT policy
DROP POLICY "Users can view own domains" ON public.domains;

-- Recreate with proper role restriction
CREATE POLICY "Users can view own domains"
  ON public.domains
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
