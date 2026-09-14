-- =============================================================================
-- R11 — billing renewals (admin_bypass only) + rotate_logs int8 + cron dedupe
-- =============================================================================
-- Idempotent. When CLI arrives: migration repair --status applied 20260914210000
-- =============================================================================

BEGIN;

-- R11a: only admin_bypass; Stripe webhook owns real subscription cycles
CREATE OR REPLACE FUNCTION public.process_billing_renewals()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.profiles
  SET current_clicks = 0,
      billing_cycle_start = now(),
      billing_cycle_end   = now() + interval '30 days'
  WHERE stripe_price_id = 'admin_bypass'
    AND billing_cycle_end IS NOT NULL
    AND billing_cycle_end <= now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'renewed', v_count,
    'processed_at', now()::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_billing_renewals() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_billing_renewals() FROM anon;
REVOKE ALL ON FUNCTION public.process_billing_renewals() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_billing_renewals() TO postgres;
GRANT EXECUTE ON FUNCTION public.process_billing_renewals() TO service_role;

-- Reschedule by name (safe if already present)
SELECT cron.unschedule(j.jobid)
FROM cron.job j
WHERE j.jobname = 'billing-renewals-admin-bypass';

SELECT cron.schedule(
  'billing-renewals-admin-bypass',
  '30 3 * * *',
  $$SELECT public.process_billing_renewals();$$
);

-- R11b: int4 overflow on 6 * 1024^3
CREATE OR REPLACE FUNCTION public.rotate_logs_adaptive()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
    target_bytes      BIGINT := 6::bigint * 1024 * 1024 * 1024;  -- 6 GB soft ceiling
    floor_days        INT    := 7;
    default_days      INT    := 30;
    effective_days    INT;
    db_size           BIGINT;
    deleted_req       BIGINT := 0;
    deleted_fp        BIGINT := 0;
    iter_deleted      BIGINT := 0;
    retention_windows INT[]  := ARRAY[30, 21, 14, 7];
    win               INT;
    warning_emitted   BOOLEAN := FALSE;
BEGIN
    DELETE FROM requests_log
        WHERE created_at < NOW() - (default_days || ' days')::INTERVAL;
    GET DIAGNOSTICS iter_deleted = ROW_COUNT;
    deleted_req := deleted_req + iter_deleted;

    DELETE FROM fingerprint_log
        WHERE created_at < NOW() - (default_days || ' days')::INTERVAL;
    GET DIAGNOSTICS iter_deleted = ROW_COUNT;
    deleted_fp := deleted_fp + iter_deleted;

    effective_days := default_days;

    FOREACH win IN ARRAY retention_windows LOOP
        IF win = default_days THEN
            CONTINUE;
        END IF;

        db_size := pg_database_size(current_database());
        EXIT WHEN db_size <= target_bytes;

        warning_emitted := TRUE;
        RAISE WARNING '[log_rotation] DB size % bytes > % bytes ceiling. Shrinking retention to % days.',
            db_size, target_bytes, win;

        DELETE FROM requests_log
            WHERE created_at < NOW() - (win || ' days')::INTERVAL;
        GET DIAGNOSTICS iter_deleted = ROW_COUNT;
        deleted_req := deleted_req + iter_deleted;

        DELETE FROM fingerprint_log
            WHERE created_at < NOW() - (win || ' days')::INTERVAL;
        GET DIAGNOSTICS iter_deleted = ROW_COUNT;
        deleted_fp := deleted_fp + iter_deleted;

        effective_days := win;
    END LOOP;

    db_size := pg_database_size(current_database());

    IF db_size > target_bytes THEN
        RAISE WARNING '[log_rotation] DB size % bytes STILL over % bytes ceiling after shrinking to % days (floor). Manual intervention required.',
            db_size, target_bytes, floor_days;
    END IF;

    DELETE FROM cf_sync_queue
        WHERE status = 'synced'
          AND synced_at < NOW() - INTERVAL '30 days';

    RETURN jsonb_build_object(
        'ts', NOW(),
        'db_size_bytes', db_size,
        'db_size_gb', ROUND(db_size::NUMERIC / (1024*1024*1024), 2),
        'target_gb', 6,
        'effective_retention_days', effective_days,
        'deleted_requests_log', deleted_req,
        'deleted_fingerprint_log', deleted_fp,
        'warning', warning_emitted,
        'over_ceiling', (db_size > target_bytes)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_logs_adaptive() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rotate_logs_adaptive() FROM anon;
REVOKE ALL ON FUNCTION public.rotate_logs_adaptive() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_logs_adaptive() TO postgres;
GRANT EXECUTE ON FUNCTION public.rotate_logs_adaptive() TO service_role;

-- R11c: drop duplicate aggregate jobs (11/12 mirror 7/8)
SELECT cron.unschedule(j.jobid)
FROM cron.job j
WHERE j.jobid IN (11, 12)
   OR j.jobname IN ('daily-stats-close-previous-day', 'daily-stats-hourly-catchup');

COMMIT;
