-- =============================================================================
-- PR-3b Fase 3.2 — Multidimensional Breakdown Aggregation
-- =============================================================================
-- Objetivo: alimentar Analytics.tsx (gráficos de País, Dispositivo, Plataforma,
-- Motivo de bloqueio) sem fazer scan na requests_log toda hora que o usuário
-- abre o painel. Mesmo padrão arquitetural de daily_campaign_stats, agora
-- multidimensional via uma tabela só.
--
-- Schema strategy: UMA tabela (daily_breakdown_stats) cobrindo as 4 dimensões
-- via coluna dimension_type (ENUM). Adicionar uma 5ª dim no futuro = ALTER TYPE
-- + 1 branch novo na função, SEM nova tabela e SEM nova migration de schema.
--
-- Timezone: ancorado em America/Sao_Paulo — consistente com a decisão de fuso
-- comercial do projeto e com o cron horário/diário (PR-3b Fase 2).
--
-- ⚠️ Inconsistência conhecida: aggregate_daily_stats() (PR-3b Fase 1) AINDA
-- usa UTC. Os 2 agregados ficam com offsets diferentes em datas de borda
-- (até ~3h por dia). O bloco "[FOLLOW-UP]" no fim deste arquivo traz o snippet
-- pra alinhar a função antiga — aplicar como PR-3b.4 separado.
--
-- Idempotência: UPSERT em (date, campaign_id, dimension_type, dimension_value).
-- Re-rodar aggregate_daily_breakdowns(d) N vezes produz o mesmo resultado.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ENUM de dimensões
-- -----------------------------------------------------------------------------
-- Por que ENUM e não TEXT puro: 4 bytes vs ~10, validação no catálogo Postgres,
-- documentação automática (\dT), e impede inserção de dimensão inválida.
-- Custo: adicionar uma 5ª dim no futuro exige `ALTER TYPE ... ADD VALUE` —
-- operação barata e imediata em PG 12+ (não bloqueia tabela).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'breakdown_dimension') THEN
    CREATE TYPE public.breakdown_dimension AS ENUM (
      'country',
      'device',
      'platform',
      'motivo'
    );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Tabela agregada
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_breakdown_stats (
  id              uuid                       PRIMARY KEY DEFAULT gen_random_uuid(),
  date            date                       NOT NULL,
  campaign_id     uuid                       NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id         uuid                       NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  dimension_type  public.breakdown_dimension NOT NULL,
  -- Convenção de dimension_value:
  --   country  → ISO-2 ('BR', 'US', ...) ou 'unknown'
  --   device   → 'mobile', 'desktop', 'tablet', 'bot', 'unknown'
  --   platform → 'facebook', 'google', 'tiktok', ... ou 'unknown'
  --   motivo   → texto curto do motivo_limpo ou 'unknown'
  -- NULLs do raw são mapeados pra 'unknown' na agregação — necessário porque
  -- UNIQUE em PG ignora NULLs (mataria a idempotência do UPSERT).
  dimension_value text                       NOT NULL,
  total_clicks    integer                    NOT NULL DEFAULT 0,
  unique_clicks   integer                    NOT NULL DEFAULT 0,
  bot_clicks      integer                    NOT NULL DEFAULT 0,
  conversions     integer                    NOT NULL DEFAULT 0,
  total_cost      numeric(10,6)              NOT NULL DEFAULT 0,
  total_revenue   numeric(10,2)              NOT NULL DEFAULT 0,
  created_at      timestamptz                NOT NULL DEFAULT now(),
  updated_at      timestamptz                NOT NULL DEFAULT now(),
  -- Garante UPSERT atômico — sem isso, re-runs concorrentes do cron criariam
  -- duplicatas (mesma campanha+dia+dim+valor).
  CONSTRAINT daily_breakdown_stats_unique
    UNIQUE (date, campaign_id, dimension_type, dimension_value)
);

-- Índices de dashboard:
--   * user_id + dimension_type + date DESC → "top 10 países nos últimos 7d"
--     (caso mais comum: Analytics.tsx filtra sempre por user + dim + range)
--   * campaign_id + dimension_type + date DESC → drill-down por campanha
CREATE INDEX IF NOT EXISTS idx_daily_breakdown_user_dim_date
  ON public.daily_breakdown_stats (user_id, dimension_type, date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_breakdown_campaign_dim_date
  ON public.daily_breakdown_stats (campaign_id, dimension_type, date DESC);

-- -----------------------------------------------------------------------------
-- 3. RLS — read-own; writes só via service_role (função SECURITY DEFINER)
-- -----------------------------------------------------------------------------
ALTER TABLE public.daily_breakdown_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own breakdown stats"
  ON public.daily_breakdown_stats;
CREATE POLICY "Users can view own breakdown stats"
  ON public.daily_breakdown_stats
  FOR SELECT
  USING (auth.uid() = user_id);

-- Reforço explícito no catálogo: roles públicos não escrevem nessa tabela.
REVOKE INSERT, UPDATE, DELETE ON public.daily_breakdown_stats FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.daily_breakdown_stats FROM anon;

-- -----------------------------------------------------------------------------
-- 4. Trigger updated_at (reusa função existente)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_daily_breakdown_stats_updated_at
  ON public.daily_breakdown_stats;
CREATE TRIGGER update_daily_breakdown_stats_updated_at
  BEFORE UPDATE ON public.daily_breakdown_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 5. Função de agregação multidimensional
-- -----------------------------------------------------------------------------
-- Estratégia interna: a CTE `base` é MATERIALIZED — força UMA varredura única
-- na requests_log pro dia, e os 4 GROUP BYs subsequentes correm sobre o
-- resultado em memória. Sem esse hint, o planner do PG 12+ poderia inlinar
-- a CTE e fazer 4 scans separados (caro em volume).
--
-- Performance esperada: ~300ms pra 1M rows com BRIN em created_at + GROUP BY
-- de baixa cardinalidade (4 dims × média ~50 valores cada = ~200 buckets).
CREATE OR REPLACE FUNCTION public.aggregate_daily_breakdowns(
  target_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  rows_upserted integer,
  duration_ms   integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start timestamptz := clock_timestamp();
  v_count integer     := 0;
BEGIN
  WITH base AS MATERIALIZED (
    -- Escaneia requests_log do dia UMA vez. COALESCE pra 'unknown' garante
    -- que nenhum bucket vire NULL (que mataria o UNIQUE no UPSERT).
    SELECT
      (r.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS stat_date,
      r.campaign_id,
      r.user_id,
      COALESCE(r.country_code,    'unknown') AS country_code,
      COALESCE(r.device_type,     'unknown') AS device_type,
      COALESCE(r.source_platform, 'unknown') AS source_platform,
      COALESCE(r.motivo_limpo,    'unknown') AS motivo_limpo,
      r.is_unique,
      r.action_taken,
      r.is_conversion,
      r.cost,
      r.revenue
    FROM public.requests_log r
    WHERE (r.created_at AT TIME ZONE 'America/Sao_Paulo')::date = target_date
      AND r.campaign_id IS NOT NULL
      AND r.user_id     IS NOT NULL
  ),
  country_agg AS (
    SELECT stat_date, campaign_id, user_id,
           'country'::breakdown_dimension                       AS dim_type,
           country_code                                         AS dim_value,
           COUNT(*)                                             AS total_clicks,
           COUNT(*) FILTER (WHERE is_unique)                    AS unique_clicks,
           COUNT(*) FILTER (WHERE action_taken = 'bot_blocked') AS bot_clicks,
           COUNT(*) FILTER (WHERE is_conversion)                AS conversions,
           COALESCE(SUM(cost), 0)::numeric(10,6)                AS total_cost,
           COALESCE(SUM(revenue), 0)::numeric(10,2)             AS total_revenue
    FROM base
    GROUP BY 1, 2, 3, 4, 5
  ),
  device_agg AS (
    SELECT stat_date, campaign_id, user_id,
           'device'::breakdown_dimension,
           device_type,
           COUNT(*),
           COUNT(*) FILTER (WHERE is_unique),
           COUNT(*) FILTER (WHERE action_taken = 'bot_blocked'),
           COUNT(*) FILTER (WHERE is_conversion),
           COALESCE(SUM(cost), 0)::numeric(10,6),
           COALESCE(SUM(revenue), 0)::numeric(10,2)
    FROM base
    GROUP BY 1, 2, 3, 4, 5
  ),
  platform_agg AS (
    SELECT stat_date, campaign_id, user_id,
           'platform'::breakdown_dimension,
           source_platform,
           COUNT(*),
           COUNT(*) FILTER (WHERE is_unique),
           COUNT(*) FILTER (WHERE action_taken = 'bot_blocked'),
           COUNT(*) FILTER (WHERE is_conversion),
           COALESCE(SUM(cost), 0)::numeric(10,6),
           COALESCE(SUM(revenue), 0)::numeric(10,2)
    FROM base
    GROUP BY 1, 2, 3, 4, 5
  ),
  motivo_agg AS (
    SELECT stat_date, campaign_id, user_id,
           'motivo'::breakdown_dimension,
           motivo_limpo,
           COUNT(*),
           COUNT(*) FILTER (WHERE is_unique),
           COUNT(*) FILTER (WHERE action_taken = 'bot_blocked'),
           COUNT(*) FILTER (WHERE is_conversion),
           COALESCE(SUM(cost), 0)::numeric(10,6),
           COALESCE(SUM(revenue), 0)::numeric(10,2)
    FROM base
    GROUP BY 1, 2, 3, 4, 5
  ),
  unioned AS (
    SELECT * FROM country_agg
    UNION ALL SELECT * FROM device_agg
    UNION ALL SELECT * FROM platform_agg
    UNION ALL SELECT * FROM motivo_agg
  )
  INSERT INTO public.daily_breakdown_stats AS d (
    date, campaign_id, user_id,
    dimension_type, dimension_value,
    total_clicks, unique_clicks, bot_clicks, conversions,
    total_cost, total_revenue
  )
  SELECT
    stat_date, campaign_id, user_id,
    dim_type, dim_value,
    total_clicks, unique_clicks, bot_clicks, conversions,
    total_cost, total_revenue
  FROM unioned
  ON CONFLICT (date, campaign_id, dimension_type, dimension_value) DO UPDATE SET
    -- Sobrescreve (não soma) — EXCLUDED já contém o total recalculado do dia.
    total_clicks  = EXCLUDED.total_clicks,
    unique_clicks = EXCLUDED.unique_clicks,
    bot_clicks    = EXCLUDED.bot_clicks,
    conversions   = EXCLUDED.conversions,
    total_cost    = EXCLUDED.total_cost,
    total_revenue = EXCLUDED.total_revenue,
    updated_at    = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT
    v_count,
    (EXTRACT(EPOCH FROM clock_timestamp() - v_start) * 1000)::integer;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Grants — só service_role executa
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.aggregate_daily_breakdowns(date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.aggregate_daily_breakdowns(date) TO service_role;

-- -----------------------------------------------------------------------------
-- 7. Cron jobs — encaixados logo APÓS aggregate_daily_stats
-- -----------------------------------------------------------------------------
-- Estratégia de chaining: 5 min após cada execução do agregado principal,
-- pra evitar contenção de IO e garantir que daily_campaign_stats já tenha
-- fechado quando o Analytics.tsx fizer JOIN entre as duas tabelas.

-- Limpeza idempotente
DO $$
DECLARE v_jobid bigint;
BEGIN
  FOR v_jobid IN
    SELECT jobid FROM cron.job
    WHERE jobname IN (
      'aggregate_daily_breakdowns_close_yesterday',
      'aggregate_daily_breakdowns_refresh_today'
    )
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
END $$;

-- DIÁRIO — fecha breakdowns do dia anterior
-- '15 3 * * *' UTC = 00:15 horário SP
-- (5 min após o '10 3' do aggregate_daily_stats_close_yesterday)
SELECT cron.schedule(
  'aggregate_daily_breakdowns_close_yesterday',
  '15 3 * * *',
  $$
    SELECT public.aggregate_daily_breakdowns(
      ((now() AT TIME ZONE 'America/Sao_Paulo')::date - 1)
    );
  $$
);

-- HORÁRIO — refresh do dia corrente
-- '5 * * * *' = minuto 5 de cada hora cheia
-- (5 min após o '0 * * * *' do aggregate_daily_stats_refresh_today)
SELECT cron.schedule(
  'aggregate_daily_breakdowns_refresh_today',
  '5 * * * *',
  $$
    SELECT public.aggregate_daily_breakdowns(
      (now() AT TIME ZONE 'America/Sao_Paulo')::date
    );
  $$
);

-- -----------------------------------------------------------------------------
-- 8. Sanidade — confirma que os 2 jobs novos foram registrados
-- -----------------------------------------------------------------------------
DO $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM cron.job
  WHERE jobname IN (
    'aggregate_daily_breakdowns_close_yesterday',
    'aggregate_daily_breakdowns_refresh_today'
  );
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Falha ao registrar cron breakdowns. Esperado 2, encontrado %', v_count;
  END IF;
  RAISE NOTICE 'PR-3b Fase 3.2 OK — daily_breakdown_stats + 2 cron jobs registrados.';
END $$;

-- -----------------------------------------------------------------------------
-- 9. Documentação no catálogo
-- -----------------------------------------------------------------------------
COMMENT ON TABLE public.daily_breakdown_stats IS
  'PR-3b Fase 3.2 — agregado multidimensional (country/device/platform/motivo) '
  'por (date SP, campaign_id, dimension_type, dimension_value). Source para '
  'os breakdowns do Analytics.tsx. RLS: read-own; writes só via '
  'aggregate_daily_breakdowns() com service_role.';

COMMENT ON FUNCTION public.aggregate_daily_breakdowns(date) IS
  'PR-3b Fase 3.2 — reagrega requests_log pro target_date (SP) em 4 dimensões '
  'simultâneas via CTE materializada (1 scan, 4 GROUP BYs). Idempotente. '
  'Cron horário (refresh hoje) + diário (fechamento D-1).';

COMMENT ON TYPE public.breakdown_dimension IS
  'PR-3b Fase 3.2 — dimensões agregadas em daily_breakdown_stats. Adicionar '
  'nova dim: ALTER TYPE ... ADD VALUE + branch novo na função de agregação.';

-- =============================================================================
-- BACKFILL — execute MANUALMENTE após esta migration ser aplicada.
-- =============================================================================
-- Popula breakdowns dos últimos 30 dias pra que o Analytics.tsx tenha dados
-- históricos imediatamente após o deploy do frontend (PR-3b Fase 3.3).
-- Sem isso, gráficos ficam vazios até o cron noturno fechar D-1 amanhã.
--
-- Roda em foreground — pode demorar minutos dependendo do volume da
-- requests_log. Acompanhe no NOTICE.
--
-- DESCOMENTE E RODE NUMA SESSÃO SEPARADA APÓS A MIGRATION:
--
-- DO $$
-- DECLARE
--   d         date;
--   v_result  record;
-- BEGIN
--   FOR d IN
--     SELECT generate_series(CURRENT_DATE - 30, CURRENT_DATE, '1 day')::date
--   LOOP
--     SELECT * INTO v_result FROM public.aggregate_daily_breakdowns(d);
--     RAISE NOTICE 'Backfill % — % rows em %ms',
--       d, v_result.rows_upserted, v_result.duration_ms;
--   END LOOP;
-- END $$;

-- =============================================================================
-- [FOLLOW-UP RECOMENDADO — PR-3b.4] Alinhar aggregate_daily_stats() para SP
-- =============================================================================
-- Hoje aggregate_daily_stats() (Fase 1) ancora data em UTC; este novo agregado
-- ancora em SP. Em datas de borda (clicks entre 21:00–23:59 SP), os 2 buckets
-- divergem — gráfico de "métricas gerais" mostra 23/04 enquanto breakdowns
-- mostram 24/04, por exemplo.
--
-- Aplicar como migration SEPARADA (não rodar agora — exige backfill de
-- daily_campaign_stats também e fica fora do escopo desta migration).
--
-- Snippet de referência:
/*
CREATE OR REPLACE FUNCTION public.aggregate_daily_stats(
  target_date date DEFAULT CURRENT_DATE
) RETURNS TABLE (...)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
... -- mesma estrutura, trocar 'UTC' por 'America/Sao_Paulo' nas 2 ocorrências
$$;

-- + backfill:
DO $$ DECLARE d date; BEGIN
  FOR d IN SELECT generate_series(CURRENT_DATE - 30, CURRENT_DATE, '1 day')::date
  LOOP PERFORM public.aggregate_daily_stats(d); END LOOP;
END $$;
*/
