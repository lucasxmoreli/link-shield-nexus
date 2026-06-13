
-- Add billing cycle columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS billing_cycle_start timestamp with time zone,
  ADD COLUMN IF NOT EXISTS billing_cycle_end timestamp with time zone;

-- Create promo_codes table
CREATE TABLE public.promo_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  target_plan text NOT NULL,
  duration_days integer NOT NULL DEFAULT 30,
  max_uses integer NOT NULL DEFAULT 100,
  current_uses integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read active promo codes (for validation)
CREATE POLICY "Users can read active promo codes"
  ON public.promo_codes FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Admins can do everything
CREATE POLICY "Admins can insert promo codes"
  ON public.promo_codes FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update promo codes"
  ON public.promo_codes FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete promo codes"
  ON public.promo_codes FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admins can also read inactive codes
CREATE POLICY "Admins can read all promo codes"
  ON public.promo_codes FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Create the redeem RPC function
CREATE OR REPLACE FUNCTION public.redeem_promo_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Lock and fetch the promo code
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

  -- Increment usage
  UPDATE promo_codes SET current_uses = current_uses + 1 WHERE id = v_promo.id;

  -- Map plan name to limits
  v_plan_name := v_promo.target_plan;
  CASE v_plan_name
    WHEN 'BASIC PLAN' THEN v_max_clicks := 20000; v_max_domains := 3;
    WHEN 'PRO PLAN' THEN v_max_clicks := 100000; v_max_domains := 10;
    WHEN 'FREEDOM PLAN' THEN v_max_clicks := 300000; v_max_domains := 20;
    WHEN 'ENTERPRISE CONQUEST' THEN v_max_clicks := 1000000; v_max_domains := 25;
    ELSE v_max_clicks := 0; v_max_domains := 0;
  END CASE;

  v_cycle_end := now() + (v_promo.duration_days || ' days')::interval;

  -- Update user profile
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
