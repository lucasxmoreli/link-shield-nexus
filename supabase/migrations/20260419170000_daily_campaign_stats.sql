-- =============================================================================
-- PR-3b (Phase 1) — Daily Aggregation Pipeline
-- =============================================================================
-- Objetivo: aliviar `requests_log` criando uma camada pré-agregada por
-- (date, campaign_id). Dashboards de 7/30/90 dias leem daqui em vez de fazer
-- scan na tabela fato de clicks (que vai pra dezenas de milhões de rows).
--
-- Regra de ouro do roadmap PR-3b: AGREGAR PRIMEIRO, DELETAR DEPOIS.
-- Esta migration implementa apenas a agregação. A fase 2 (retention /
-- partition drop) entra em migration separada SÓ depois que confirmarmos
-- os agregados batem com queries ad-hoc em `requests_log`.
--
-- Timezone: o "dia" do agregado é ancorado em UTC — mesma convenção do resto
-- do pipeline de métricas. Frontend converte pra timezone do usuário apenas
-- no momento de exibir.
--
-- Idempotência: UPSERT em (date, campaign_id). Re-rodar
-- `aggregate_daily_stats(d)` N vezes produz o mesmo resultado (o SELECT
-- sempre re-soma o dia inteiro de `requests_log`).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabela agregada
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_campaign_stats (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  date            date          NOT NULL,
  campaign_id     uuid          NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id         uuid          NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  total_clicks    integer       NOT NULL DEFAULT 0,
  unique_clicks   integer       NOT NULL DEFAULT 0,
  bot_clicks      integer       NOT NULL DEFAULT 0,
  conversions     integer       NOT NULL DEFAULT 0,
  total_cost      numeric(10,6) NOT NULL DEFAULT 0,
  total_revenue   numeric(10,2) NOT NULL DEFAULT 0,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  -- Garante UPSERT atômico — sem isso teríamos duplicatas por dia+campanha
  -- em re-runs concorrentes da função de agregação.
  CONSTRAINT daily_campaign_stats_date_campaign_unique UNIQUE (date, campaign_id)
);

-- Índices de dashboard:
--   * user_id + date DESC → tela "últimos N dias" da conta inteira.
--   * campaign_id + date DESC → drill-down por campanha.
CREATE INDEX IF NOT EXISTS idx_daily_campaign_stats_user_date
  ON public.daily_campaign_stats (user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_campaign_stats_campaign_date
  ON public.daily_campaign_stats (campaign_id, date DESC);

-- -----------------------------------------------------------------------------
-- 2. RLS — read-own; writes apenas via service_role (função SECURITY DEFINER)
-- -----------------------------------------------------------------------------
ALTER TABLE public.daily_campaign_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own daily stats" ON public.daily_campaign_stats;
CREATE POLICY "Users can view own daily stats"
  ON public.daily_campaign_stats
  FOR SELECT
  USING (auth.uid() = user_id);

-- Não criamos policies de INSERT/UPDATE/DELETE: só service_role (que bypassa
-- RLS) escreve nessa tabela, via aggregate_daily_stats(). Revogamos INSERT
-- explícito pros roles públicos pra reforçar a intenção no catálogo.
REVOKE INSERT, UPDATE, DELETE ON public.daily_campaign_stats FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.daily_campaign_stats FROM anon;

-- -----------------------------------------------------------------------------
-- 3. Trigger updated_at (reutiliza função existente do schema base)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_daily_campaign_stats_updated_at ON public.daily_campaign_stats;
CREATE TRIGGER update_daily_campaign_stats_updated_at
  BEFORE UPDATE ON public.daily_campaign_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 4. Índice BRIN em requests_log para acelerar a agregação
-- -----------------------------------------------------------------------------
-- `requests_log` é append-only e monotônica em created_at. BRIN (block range
-- index) custa centenas de KB mesmo com 50M rows e acelera varreduras por
-- faixa de data em 10–100x vs seq scan. Essencial pra aggregate_daily_stats
-- rodar em segundos ao invés de minutos.
CREATE INDEX IF NOT EXISTS idx_requests_log_created_brin
  ON public.requests_log USING BRIN (created_at);

-- -----------------------------------------------------------------------------
-- 5. Função de agregação — idempotente, SECURITY DEFINER
-- -----------------------------------------------------------------------------
-- Assinatura: aggregate_daily_stats(target_date DATE DEFAULT CURRENT_DATE)
--
-- Retorna:
--   aggregated_campaigns  — quantas linhas (date,campaign) foram upsertadas
--   total_rows_processed  — total de rows lidas de requests_log pro dia
--   duration_ms           — wall-clock da execução
--
-- Chamador esperado: edge function ou pg_cron job (Phase 2).
-- Re-execução segura a qualquer hora: o SELECT re-soma o dia inteiro.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aggregate_daily_stats(
  target_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  aggregated_campaigns integer,
  total_rows_processed bigint,
  duration_ms          integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start     timestamptz := clock_timestamp();
  v_campaigns integer     := 0;
  v_rows      bigint      := 0;
BEGIN
  -- UPSERT: re-soma o dia inteiro e sobrescreve qualquer linha existente
  -- pro mesmo (date, campaign_id). Idempotente por construção.
  WITH src AS (
    SELECT
      (r.created_at AT TIME ZONE 'UTC')::date                    AS stat_date,
      r.campaign_id,
      r.user_id,
      COUNT(*)                                                   AS total_clicks,
      COUNT(*) FILTER (WHERE r.is_unique)                        AS unique_clicks,
      COUNT(*) FILTER (WHERE r.action_taken = 'bot_blocked')     AS bot_clicks,
      COUNT(*) FILTER (WHERE r.is_conversion)                    AS conversions,
      COALESCE(SUM(r.cost),    0)::numeric(10,6)                 AS total_cost,
      COALESCE(SUM(r.revenue), 0)::numeric(10,2)                 AS total_revenue
    FROM public.requests_log r
    WHERE (r.created_at AT TIME ZONE 'UTC')::date = target_date
      AND r.campaign_id IS NOT NULL
      AND r.user_id     IS NOT NULL
    GROUP BY 1, 2, 3
  )
  INSERT INTO public.daily_campaign_stats AS d (
    date, campaign_id, user_id,
    total_clicks, unique_clicks, bot_clicks, conversions,
    total_cost, total_revenue
  )
  SELECT
    stat_date, campaign_id, user_id,
    total_clicks, unique_clicks, bot_clicks, conversions,
    total_cost, total_revenue
  FROM src
  ON CONFLICT (date, campaign_id) DO UPDATE SET
    -- Sobrescreve (não soma) — EXCLUDED já contém o total recalculado do dia.
    total_clicks  = EXCLUDED.total_clicks,
    unique_clicks = EXCLUDED.unique_clicks,
    bot_clicks    = EXCLUDED.bot_clicks,
    conversions   = EXCLUDED.conversions,
    total_cost    = EXCLUDED.total_cost,
    total_revenue = EXCLUDED.total_revenue,
    updated_at    = now();

  GET DIAGNOSTICS v_campaigns = ROW_COUNT;

  -- Métrica de observabilidade: total de rows visitadas em requests_log.
  SELECT COUNT(*) INTO v_rows
    FROM public.requests_log r
   WHERE (r.created_at AT TIME ZONE 'UTC')::date = target_date;

  RETURN QUERY SELECT
    v_campaigns,
    v_rows,
    (EXTRACT(EPOCH FROM clock_timestamp() - v_start) * 1000)::integer;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Grants — só service_role executa
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.aggregate_daily_stats(date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.aggregate_daily_stats(date) TO service_role;

-- -----------------------------------------------------------------------------
-- 7. Documentação no catálogo
-- -----------------------------------------------------------------------------
COMMENT ON TABLE public.daily_campaign_stats IS
  'PR-3b Phase 1 — pre-aggregated daily stats per (date, campaign_id). Source '
  'of truth for 7/30/90-day dashboards. RLS: read-own; writes only via '
  'aggregate_daily_stats() with service_role.';

COMMENT ON FUNCTION public.aggregate_daily_stats(date) IS
  'PR-3b Phase 1 — reagrega requests_log pro target_date (UTC) e faz UPSERT em '
  'daily_campaign_stats. Idempotente. Chamar diariamente via edge function ou '
  'pg_cron (Phase 2).';
