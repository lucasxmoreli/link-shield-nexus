-- B-P1-2: Analytics read the daily aggregates, which were refreshed hourly, so a
-- new campaign showed zero for up to 60 minutes. Each run takes < 0.3 s today.
-- Rollback: same calls with '0 * * * *' and '5 * * * *'.

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'aggregate_daily_stats_refresh_today'),
  schedule := '*/5 * * * *'
);

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'aggregate_daily_breakdowns_refresh_today'),
  schedule := '2-59/5 * * * *'
);
