-- =============================================================================
-- PR-3b (Scheduling) — pg_cron Automation para aggregate_daily_stats
-- =============================================================================
-- Objetivo: colocar o pipeline de agregação diária em piloto automático.
--
-- Dois jobs:
--   1) daily-stats-close-previous-day  — 00:10 UTC, todo dia.
--      Fecha o dia anterior (D-1) de forma DEFINITIVA.
--      Roda 10 min após a virada do dia UTC pra absorver a latência do
--      WriteBuffer do motor (requests_log é flushed a cada 3s, mas tem
--      margem de segurança pra picos).
--
--   2) daily-stats-hourly-catchup      — a cada hora cheia.
--      Re-agrega o dia CORRENTE. Mantém daily_campaign_stats "near real-time"
--      com lag máximo de 1h. Dashboards "Hoje" leem daqui sem precisar
--      scan em requests_log.
--
-- Segurança (padrão Supabase):
--   • pg_cron é instalada na schema `extensions` (convenção Supabase — NUNCA
--     criar em `public`, pois pollua o catálogo da API PostgREST).
--   • Jobs são owned pelo role `postgres` (o role que roda migrations).
--     A função `aggregate_daily_stats` é SECURITY DEFINER, então executa
--     com privilégios de quem a definiu (postgres = superuser). O cron
--     acessa a função via ownership, sem depender de GRANT extra.
--   • Os jobs não expõem nada via PostgREST — execução 100% server-side.
--   • Duplo-UPSERT (hourly sobrescreve dados parciais; daily fecha final)
--     é seguro pela idempotência da função.
--
-- Timezone: pg_cron no Supabase opera em UTC. A função já faz a âncora
-- de dia via `(created_at AT TIME ZONE 'UTC')::date` — alinhado end-to-end.
--
-- Idempotência da migration: o bloco DO faz unschedule antes de schedule.
-- Re-rodar N vezes converge pra mesma config final (sem jobs órfãos).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Habilita pg_cron (schema `extensions` — padrão Supabase)
-- -----------------------------------------------------------------------------
-- Se der erro de permissão aqui, alternativa: ativar pg_cron via
-- Supabase Dashboard → Database → Extensions → pg_cron → Enable.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- -----------------------------------------------------------------------------
-- 2. Unschedule jobs pré-existentes (garante idempotência em re-run)
-- -----------------------------------------------------------------------------
-- `cron.unschedule(text)` lança erro se o job não existe, por isso envolvemos
-- em DO block com guard. Permite rodar essa migration múltiplas vezes sem
-- falhas, útil em staging/dev e em rollback-and-reapply.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-stats-close-previous-day') THEN
    PERFORM cron.unschedule('daily-stats-close-previous-day');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-stats-hourly-catchup') THEN
    PERFORM cron.unschedule('daily-stats-hourly-catchup');
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Job #1 — Daily Close (00:10 UTC)
-- -----------------------------------------------------------------------------
-- Processa D-1 inteiro, já com todos os cliques do dia consolidados.
-- Este é o run "autoritativo" — depois dele, a linha de D-1 em
-- daily_campaign_stats é considerada final pra dashboards de 7/30/90 dias.
SELECT cron.schedule(
  'daily-stats-close-previous-day',
  '10 0 * * *',
  $job$SELECT public.aggregate_daily_stats(CURRENT_DATE - 1);$job$
);

-- -----------------------------------------------------------------------------
-- 4. Job #2 — Hourly Catchup (a cada hora cheia)
-- -----------------------------------------------------------------------------
-- Mantém o dia corrente atualizado pra dashboards "Hoje". A função é
-- idempotente: re-soma o dia inteiro e UPSERT sobrescreve — sem drift.
-- Custo: 1 index-range scan em requests_log por hora (BRIN acelera).
SELECT cron.schedule(
  'daily-stats-hourly-catchup',
  '0 * * * *',
  $job$SELECT public.aggregate_daily_stats(CURRENT_DATE);$job$
);

-- -----------------------------------------------------------------------------
-- 5. Observabilidade — queries úteis pós-deploy
-- -----------------------------------------------------------------------------
-- Lista os jobs configurados e se estão ativos:
--
--   SELECT jobid, jobname, schedule, active, command
--     FROM cron.job
--    WHERE jobname LIKE 'daily-stats-%';
--
-- Histórico de execuções (sucesso/falha, duração, return message):
--
--   SELECT j.jobname,
--          d.status,
--          d.return_message,
--          d.start_time,
--          d.end_time,
--          (d.end_time - d.start_time) AS duration
--     FROM cron.job_run_details d
--     JOIN cron.job j ON j.jobid = d.jobid
--    WHERE j.jobname LIKE 'daily-stats-%'
--    ORDER BY d.start_time DESC
--    LIMIT 50;
--
-- Trigger manual (pra validar antes de esperar o cron rodar):
--
--   SELECT * FROM public.aggregate_daily_stats(CURRENT_DATE - 1);
--   SELECT * FROM public.aggregate_daily_stats(CURRENT_DATE);
--
-- Pause temporária de um job (sem dropar):
--
--   UPDATE cron.job SET active = false WHERE jobname = 'daily-stats-hourly-catchup';
--
-- Reativar:
--
--   UPDATE cron.job SET active = true  WHERE jobname = 'daily-stats-hourly-catchup';
-- =============================================================================
