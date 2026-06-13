
-- 1. Fix invite_codes: restrict INSERT/DELETE to admins only
DROP POLICY "Authenticated can insert invite codes" ON public.invite_codes;
DROP POLICY "Authenticated can delete unused invite codes" ON public.invite_codes;

CREATE POLICY "Admins can insert invite codes"
  ON public.invite_codes FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete invite codes"
  ON public.invite_codes FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Remove anon campaign access policy
DROP POLICY "Anon can read active campaigns by hash" ON public.campaigns;
