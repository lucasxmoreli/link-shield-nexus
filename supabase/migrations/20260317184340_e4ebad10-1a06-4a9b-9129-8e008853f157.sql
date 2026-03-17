
-- Create the billing renewal function (SECURITY DEFINER to bypass RLS and trigger)
CREATE OR REPLACE FUNCTION public.process_billing_renewals()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Bypass the profile protection trigger
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE profiles
  SET
    current_clicks = 0,
    billing_cycle_start = now(),
    billing_cycle_end = now() + interval '30 days'
  WHERE
    billing_cycle_end IS NOT NULL
    AND billing_cycle_end <= now()
    AND plan_name IS NOT NULL
    AND plan_name != 'Free';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('renewed', v_count, 'processed_at', now()::text);
END;
$$;
