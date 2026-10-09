-- =============================================================================
-- B-P1-5: admin_change_plan takes max_campaigns from plan_limits
-- =============================================================================
-- The legacy CASE (BASIC 5 / PRO 20 / FREEDOM 50) diverged from Spec 2
-- (plan_limits + stripe-webhook: 3 / 8 / 20 / -1), so admin-activated accounts
-- showed two different campaign limits on the same screen.
--
-- Backfill: only admin_bypass rows whose max_campaigns differs from
-- plan_limits. In prod today that is a single row (the FREEDOM test account,
-- 50 -> 20); ENTERPRISE bypass rows are already -1.
--
-- Rollback: re-run admin_change_plan from 20260914200000 r8_r9.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_change_plan(
  p_user_id uuid,
  p_plan_name text,
  p_max_clicks integer,
  p_max_domains integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_max_campaigns integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT pl.max_campaigns INTO v_max_campaigns
  FROM public.plan_limits pl
  WHERE upper(pl.plan_name) = upper(btrim(p_plan_name));

  v_max_campaigns := COALESCE(v_max_campaigns, 0);

  UPDATE public.profiles SET
    plan_name           = p_plan_name,
    max_clicks          = p_max_clicks,
    max_domains         = p_max_domains,
    max_campaigns       = v_max_campaigns,
    billing_cycle_start = now(),
    billing_cycle_end   = now() + interval '30 days',
    subscription_status = 'active',
    stripe_price_id     = CASE
      WHEN stripe_subscription_id IS NULL THEN 'admin_bypass'
      ELSE stripe_price_id
    END
  WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_change_plan(uuid, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_change_plan(uuid, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_change_plan(uuid, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_change_plan(uuid, text, integer, integer) TO service_role;

UPDATE public.profiles p
SET max_campaigns = pl.max_campaigns
FROM public.plan_limits pl
WHERE p.stripe_price_id = 'admin_bypass'
  AND upper(pl.plan_name) = upper(btrim(p.plan_name))
  AND p.max_campaigns IS DISTINCT FROM pl.max_campaigns;

COMMIT;
