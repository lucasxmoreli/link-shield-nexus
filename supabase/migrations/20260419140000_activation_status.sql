-- =============================================================================
-- PR-2a — Activation Status State Machine
-- =============================================================================
-- Adds a derived, always-consistent `activation_status` column on `profiles`.
-- Single source of truth for gate logic:
--
--     INVITED    → user created an account but never checked out
--     ACTIVE     → subscription is live and not a FREE plan
--     PAST_DUE   → payment failed; inside grace period (no feature access)
--     CANCELED   → subscription ended or explicitly cancelled
--
-- Implementation: GENERATED ALWAYS ... STORED column derived from
-- `subscription_status` + `plan_name`, which are already kept in sync by the
-- Stripe webhook. Zero drift risk, zero webhook refactor needed.
-- =============================================================================

-- Drop any previous attempt (safe if this is the first run).
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS activation_status;

-- Generated column. Deterministic, immutable-per-row, indexable.
ALTER TABLE public.profiles
  ADD COLUMN activation_status TEXT
  GENERATED ALWAYS AS (
    CASE
      WHEN subscription_status IN ('active', 'trialing')
           AND COALESCE(plan_name, 'FREE') <> 'FREE'
        THEN 'ACTIVE'
      WHEN subscription_status IN ('past_due', 'unpaid')
        THEN 'PAST_DUE'
      WHEN subscription_status IN ('canceled', 'incomplete_expired')
        THEN 'CANCELED'
      ELSE 'INVITED'
    END
  ) STORED;

-- Fast lookup for gate queries (`WHERE user_id = ... AND activation_status = 'ACTIVE'`).
CREATE INDEX IF NOT EXISTS idx_profiles_activation_status
  ON public.profiles (activation_status);

-- Friendly comment for the type generator and future maintainers.
COMMENT ON COLUMN public.profiles.activation_status IS
  'Derived workspace state (INVITED/ACTIVE/PAST_DUE/CANCELED). Computed from subscription_status + plan_name. Read-only.';
