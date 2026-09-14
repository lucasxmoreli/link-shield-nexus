-- =============================================================================
-- R12: get_my_profile_gate + R13 P0/P1 REVOKE EXECUTE from PUBLIC/anon
-- =============================================================================
-- R12: Soft-deleted profiles are hidden by RLS SELECT policy, so the client
-- cannot distinguish "deleted" vs "missing profile". This RPC is SECURITY
-- DEFINER and returns the real gate for auth.uid() only.
--
-- R13: Default Postgres grants EXECUTE to PUBLIC (= anon). Revoke dangerous
-- money/invite/stats/ops functions from PUBLIC, anon, authenticated.
-- Keep service_role (and postgres) able to execute.
-- =============================================================================

-- ── R12 ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_profile_gate()
RETURNS TABLE (
  profile_exists boolean,
  is_deleted boolean,
  is_suspended boolean,
  activation_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id IS NOT NULL,
    COALESCE(p.is_deleted, false),
    COALESCE(p.is_suspended, false),
    p.activation_status
  FROM (SELECT auth.uid() AS uid) u
  LEFT JOIN public.profiles p ON p.user_id = u.uid
  WHERE u.uid IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_my_profile_gate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_profile_gate() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile_gate() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile_gate() TO service_role;

COMMENT ON FUNCTION public.get_my_profile_gate() IS
  'R12: returns own profile gate bypassing soft-delete SELECT hide. authenticated only.';

-- ── R13 P0 ──────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.process_billing_renewals()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.reserve_usage_report(uuid, timestamp with time zone, integer, integer)
  FROM PUBLIC, anon, authenticated;

-- ── R13 P1 ──────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.redeem_invite_code(text, uuid, text)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.validate_invite_code(text)
  FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.increment_campaign_stats(
  uuid, date, integer, integer, integer, integer, numeric, integer, integer, integer
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.rotate_logs_adaptive()
  FROM PUBLIC, anon, authenticated;

-- P2 hygiene (low risk, cheap): close anon on load/ops helpers
REVOKE EXECUTE ON FUNCTION public.aggregate_daily_stats(date)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.aggregate_daily_breakdowns(date)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_clicks()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_db_size_bytes()
  FROM PUBLIC, anon, authenticated;

-- New functions in this schema should not default to PUBLIC execute
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
