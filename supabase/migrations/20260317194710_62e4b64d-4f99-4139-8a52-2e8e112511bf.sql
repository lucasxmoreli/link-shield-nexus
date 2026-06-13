
-- 1. Fix use_invite_code: remove p_user_id param, use auth.uid() instead
CREATE OR REPLACE FUNCTION public.use_invite_code(p_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_id FROM invite_codes
  WHERE code = upper(trim(p_code)) AND is_used = false
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE invite_codes SET is_used = true, used_by = v_user_id, used_at = now()
  WHERE id = v_id;
  RETURN true;
END;
$function$;

-- Drop the old 2-param overload if it exists
DROP FUNCTION IF EXISTS public.use_invite_code(text, uuid);

-- 2. Fix RLS promo code leak: drop the permissive SELECT for regular users
DROP POLICY IF EXISTS "Users can read active promo codes" ON public.promo_codes;
