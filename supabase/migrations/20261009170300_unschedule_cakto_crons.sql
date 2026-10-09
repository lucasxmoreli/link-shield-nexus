-- =============================================================================
-- C-1: unschedule legacy Cakto crons (billing is Stripe-only)
-- =============================================================================
-- apply-billing-expirations cancels any profile with cancel_at_period_end=true
-- and an expired billing_cycle_end, outside of the Stripe webhook's control.
-- cleanup-cakto-events-raw only prunes a table nothing writes to anymore.
-- Functions and tables are kept; this only stops the schedules.
--
-- Rollback: cron.schedule with the original names/schedules
--   ('15 4 * * *' and '20 * * * *') from 20260915170000 fatia3a.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'apply-billing-expirations') THEN
    PERFORM cron.unschedule('apply-billing-expirations');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-cakto-events-raw') THEN
    PERFORM cron.unschedule('cleanup-cakto-events-raw');
  END IF;
END;
$$;
