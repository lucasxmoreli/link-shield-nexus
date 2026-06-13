-- =============================================================================
-- PR-2a (fix) — Activation Status: bulletproof derivation rule
-- =============================================================================
-- Replaces the previous generated column that relied on `plan_name` (which is
-- inconsistent across seeds/legacy rows: 'FREE', 'FREE PLAN', NULL, etc).
--
-- New ground truth:
--   * `stripe_price_id` — filled only after a successful Stripe Checkout.
--   * `subscription_status` — kept in sync by the stripe-webhook.
--
-- Rule:
--   CANCELED  → subscription_status in ('canceled', 'incomplete_expired')
--   PAST_DUE  → subscription_status in ('past_due', 'unpaid')
--   ACTIVE    → subscription_status in ('active', 'trialing')
--                AND stripe_price_id IS NOT NULL
--   INVITED   → everything else (never paid, or checkout incomplete)
--
-- Order matters: CANCELED/PAST_DUE win over everything, even if a stale
-- stripe_price_id is still on the row during a webhook race.
-- =============================================================================

-- Drop the old generated column.
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS activation_status;

-- Re-add with the corrected derivation.
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
        THEN 'ACTIVE'
      ELSE 'INVITED'
    END
  ) STORED;

-- Recreate index on the generated column.
DROP INDEX IF EXISTS public.idx_profiles_activation_status;
CREATE INDEX idx_profiles_activation_status
  ON public.profiles (activation_status);

COMMENT ON COLUMN public.profiles.activation_status IS
  'Derived workspace state (INVITED/ACTIVE/PAST_DUE/CANCELED). Ground truth: stripe_price_id + subscription_status. Read-only.';
