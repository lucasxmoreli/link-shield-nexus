
-- 1. Drop the overly permissive SELECT policy that exposes all invite codes
DROP POLICY IF EXISTS "Anyone can validate invite codes" ON public.invite_codes;

-- 2. Drop the UPDATE policy (no longer needed — RPC handles consumption atomically)
DROP POLICY IF EXISTS "Anon can use invite codes" ON public.invite_codes;

-- 3. Create an atomic RPC that validates + consumes an invite code in one step
-- Uses FOR UPDATE to prevent race conditions
CREATE OR REPLACE FUNCTION public.validate_invite_code(p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM invite_codes
  WHERE code = upper(trim(p_code)) AND is_used = false
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.use_invite_code(p_code text, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM invite_codes
  WHERE code = upper(trim(p_code)) AND is_used = false
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE invite_codes SET is_used = true, used_by = p_user_id, used_at = now()
  WHERE id = v_id;
  RETURN true;
END;
$$;

-- 4. Allow admins to still SELECT all codes for management
CREATE POLICY "Admins can view invite codes"
ON public.invite_codes
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
