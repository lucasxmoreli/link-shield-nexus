
-- Fix: Allow redeem_promo_code RPC to bypass the profile protection trigger
-- by setting a session variable that the trigger checks.

CREATE OR REPLACE FUNCTION public.redeem_promo_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_promo promo_codes%ROWTYPE;
  v_user_id uuid;
  v_plan_name text;
  v_max_clicks integer;
  v_max_domains integer;
  v_cycle_end timestamp with time zone;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_promo
  FROM promo_codes
  WHERE code = upper(trim(p_code)) AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired promo code';
  END IF;

  IF v_promo.current_uses >= v_promo.max_uses THEN
    RAISE EXCEPTION 'This promo code has reached its maximum uses';
  END IF;

  UPDATE promo_codes SET current_uses = current_uses + 1 WHERE id = v_promo.id;

  v_plan_name := v_promo.target_plan;
  CASE v_plan_name
    WHEN 'BASIC PLAN' THEN v_max_clicks := 20000; v_max_domains := 3;
    WHEN 'PRO PLAN' THEN v_max_clicks := 100000; v_max_domains := 10;
    WHEN 'FREEDOM PLAN' THEN v_max_clicks := 300000; v_max_domains := 20;
    WHEN 'ENTERPRISE CONQUEST' THEN v_max_clicks := 1000000; v_max_domains := 25;
    ELSE v_max_clicks := 0; v_max_domains := 0;
  END CASE;

  v_cycle_end := now() + (v_promo.duration_days || ' days')::interval;

  -- Set bypass flag so the protect_privileged_profile_columns trigger allows this update
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE profiles SET
    plan_name = v_plan_name,
    max_clicks = v_max_clicks,
    max_domains = v_max_domains,
    current_clicks = 0,
    billing_cycle_start = now(),
    billing_cycle_end = v_cycle_end
  WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'plan_name', v_plan_name,
    'billing_cycle_end', v_cycle_end::text
  );
END;
$$;

-- Update the trigger to respect the bypass flag
CREATE OR REPLACE FUNCTION public.protect_privileged_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Allow bypass from trusted SECURITY DEFINER functions (e.g. redeem_promo_code)
  IF current_setting('app.bypass_profile_protection', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- If the caller is an admin, allow all changes
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- For regular users, revert privileged columns to their original values
  NEW.plan_name := OLD.plan_name;
  NEW.max_clicks := OLD.max_clicks;
  NEW.max_domains := OLD.max_domains;
  NEW.current_clicks := OLD.current_clicks;
  NEW.subscription_status := OLD.subscription_status;

  RETURN NEW;
END;
$$;
