-- =============================================================================
-- Admin Bypass — God Mode for Founders / Lifetime Deals / Internal Accounts
-- =============================================================================
-- Redefines `admin_change_plan` so that an admin-driven plan change also flips
-- the workspace to ACTIVE without routing through Stripe Checkout.
--
-- The `activation_status` generated column (see migration
-- 20260419150000_fix_activation_status_rule) derives from two fields:
--   * `subscription_status IN ('active','trialing')`
--   * `stripe_price_id IS NOT NULL`
--
-- To satisfy both rules in an admin-only flow, we stamp:
--   * subscription_status = 'active'
--   * stripe_price_id     = 'admin_bypass'   -- sentinel value, never a real price_
--
-- Defensive guard: if the user already has a real Stripe subscription
-- (`stripe_subscription_id IS NOT NULL`), we KEEP their existing `stripe_price_id`
-- so we never clobber a paying customer's price_id with the sentinel. Admins
-- managing paying customers should use the Stripe Customer Portal, not this RPC.
--
-- Idempotent: CREATE OR REPLACE FUNCTION.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_change_plan(
  p_user_id uuid,
  p_plan_name text,
  p_max_clicks integer,
  p_max_domains integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Mirrors the profile_protection bypass used by the previous version so the
  -- trigger chain doesn't block the admin-initiated write.
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE profiles SET
    plan_name           = p_plan_name,
    max_clicks          = p_max_clicks,
    max_domains         = p_max_domains,
    billing_cycle_start = now(),
    billing_cycle_end   = now() + interval '30 days',
    -- God Mode: unlock the workspace without a Stripe Checkout.
    subscription_status = 'active',
    stripe_price_id     = CASE
      WHEN stripe_subscription_id IS NULL THEN 'admin_bypass'
      ELSE stripe_price_id   -- preserve real Stripe price for paying customers
    END
  WHERE user_id = p_user_id;
END;
$$;

-- Grants are inherited from the original migration; no regrant needed, but
-- we reassert them to be explicit and safe under re-runs.
REVOKE EXECUTE ON FUNCTION public.admin_change_plan(uuid, text, integer, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_change_plan(uuid, text, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.admin_change_plan(uuid, text, integer, integer) IS
  'Admin-only plan change. Also sets subscription_status=active and stamps '
  'stripe_price_id=admin_bypass for non-Stripe users, flipping activation_status '
  'to ACTIVE. Paying customers (stripe_subscription_id IS NOT NULL) keep their '
  'real price_id.';
