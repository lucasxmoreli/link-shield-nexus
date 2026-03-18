
-- Create a service-role-only version of use_invite_code for the register edge function
CREATE OR REPLACE FUNCTION public.use_invite_code_admin(p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM invite_codes
  WHERE code = upper(trim(p_code)) AND is_used = false
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE invite_codes SET is_used = true, used_at = now()
  WHERE id = v_id;
  RETURN true;
END;
$$;

-- Restrict this function to service_role only
REVOKE EXECUTE ON FUNCTION public.use_invite_code_admin(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.use_invite_code_admin(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.use_invite_code_admin(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.use_invite_code_admin(text) TO service_role;
