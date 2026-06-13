
-- 1. Drop the leaky public SELECT policy
DROP POLICY IF EXISTS "Anyone can view active campaigns by hash" ON public.campaigns;

-- 2. Create a secure RPC function for redirect lookups (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_campaign_redirect(p_hash TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'offer_url', offer_url,
    'safe_url', safe_url,
    'is_active', is_active
  ) INTO v_result
  FROM campaigns
  WHERE hash = p_hash
  LIMIT 1;

  RETURN v_result;
END;
$$;
