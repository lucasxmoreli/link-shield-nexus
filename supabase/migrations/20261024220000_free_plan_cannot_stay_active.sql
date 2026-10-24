-- FREE must never be an open workspace.
-- activation_status was ACTIVE whenever subscription_status was active and a
-- stripe_price_id was present. Admin downgrades to FREE kept both, so the
-- panel stayed open with zero quotas.
--
-- Rollback: re-apply the generated column from
-- 20260419150000_fix_activation_status_rule.sql and admin_change_plan from
-- 20261009170200_admin_change_plan_reads_plan_limits.sql.

BEGIN;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS activation_status;

ALTER TABLE public.profiles
  ADD COLUMN activation_status TEXT
  GENERATED ALWAYS AS (
    CASE
      WHEN subscription_status IN ('canceled', 'incomplete_expired')
        THEN 'CANCELED'
      WHEN subscription_status IN ('past_due', 'unpaid')
        THEN 'PAST_DUE'
      WHEN subscription_status IN ('active', 'trialing')
           AND stripe_price_id IS NOT NULL
           AND upper(btrim(COALESCE(plan_name, ''))) NOT IN ('FREE', 'FREE PLAN')
        THEN 'ACTIVE'
      ELSE 'INVITED'
    END
  ) STORED;

DROP INDEX IF EXISTS public.idx_profiles_activation_status;
CREATE INDEX idx_profiles_activation_status
  ON public.profiles (activation_status);

COMMENT ON COLUMN public.profiles.activation_status IS
  'Derived workspace state (INVITED/ACTIVE/PAST_DUE/CANCELED). FREE is never ACTIVE. Ground truth: plan_name + stripe_price_id + subscription_status. Read-only.';

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
  v_is_free boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_is_free := upper(btrim(COALESCE(p_plan_name, ''))) IN ('FREE', 'FREE PLAN');

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
    subscription_status = CASE WHEN v_is_free THEN 'canceled' ELSE 'active' END,
    stripe_price_id     = CASE
      WHEN v_is_free AND stripe_price_id LIKE 'price_%' THEN stripe_price_id
      WHEN v_is_free THEN NULL
      WHEN stripe_subscription_id IS NULL THEN 'admin_bypass'
      ELSE stripe_price_id
    END
  WHERE user_id = p_user_id;
END;
$$;

COMMIT;
