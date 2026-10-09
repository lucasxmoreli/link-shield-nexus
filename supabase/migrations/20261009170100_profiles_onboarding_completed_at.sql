-- =============================================================================
-- B-P1-1: profiles.onboarding_completed_at
-- =============================================================================
-- OnboardingWizard selects/updates this column but it was never created, so
-- /dashboard got 5x HTTP 400 per load and the wizard never rendered.
--
-- Not privileged: users may set it on their own row (protect trigger does not
-- touch it). Existing users that already created a campaign are backfilled as
-- completed so the card does not suddenly appear for active clients.
--
-- Rollback:
--   REVOKE UPDATE (onboarding_completed_at) ON public.profiles FROM authenticated;
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS onboarding_completed_at;
-- =============================================================================

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

GRANT UPDATE (onboarding_completed_at) ON public.profiles TO authenticated;

UPDATE public.profiles p
SET onboarding_completed_at = now()
WHERE p.onboarding_completed_at IS NULL
  AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.user_id = p.user_id);

COMMIT;
