-- =============================================================================
-- SPRINT 1 — BLINDAGEM INVISÍVEL
-- Itens 4.1 (RLS requests_log), 4.2 (race condition sync-usage-stripe), 4.6 (índices)
-- =============================================================================
-- Segurança:
--   • Fecha INSERT direto em requests_log via RLS — só service_role escreve (motor server.js).
--   • Cria RPC atômico pra reservar click-report no Stripe com advisory lock transacional.
--   • Cria índices faltantes pra dashboards (user_id+created_at) e billing cron (stripe_customer_id).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4.1 — RLS requests_log: bloquear INSERT via cliente autenticado
-- -----------------------------------------------------------------------------
-- Motivo: só o motor cloaking (server.js com SERVICE_ROLE_KEY) grava em requests_log.
-- O service_role bypassa RLS, então dropar a policy de INSERT não afeta o fluxo legítimo
-- e impede que um user autenticado injete logs forjados via PostgREST.
DROP POLICY IF EXISTS "Users can insert own logs" ON public.requests_log;
DROP POLICY IF EXISTS "Allow insert via service role" ON public.requests_log;

-- Garantia extra: revoga INSERT do role `authenticated` e `anon` explicitamente.
REVOKE INSERT ON public.requests_log FROM authenticated;
REVOKE INSERT ON public.requests_log FROM anon;

-- SELECT continua permitido pelo próprio dono (policy criada no schema inicial):
--   "Users can view own logs" ON public.requests_log FOR SELECT USING (auth.uid() = user_id)

-- -----------------------------------------------------------------------------
-- 4.2 — RPC atômico pra evitar double-billing no sync-usage-stripe
-- -----------------------------------------------------------------------------
-- Estratégia: advisory lock TRANSACIONAL (auto-release no commit) em volta do
-- read HWM + insert claim. Se 2 crons concorrentes dispararem pro mesmo user:
--   - Run A: pega lock, lê HWM=0, insere claim=overage, commita, solta lock.
--   - Run B: pega lock, lê HWM=overage, delta=0 → retorna skipped_reason='already_reported'.
-- Stripe é chamado DEPOIS da RPC retornar, já com a claim reservada (lock solto).
-- A claim é atualizada com o identifier do Stripe ou marcada como failed.
--
-- Namespace do lock: 42 (arbitrário, único pra este domínio)
-- Chave: hashtext(user_id::text) — colisões improváveis a ponto de importar em prod.
-- -----------------------------------------------------------------------------

-- Garante que a tabela usage_report_log existe com as colunas necessárias.
-- (Foi criada out-of-band no passado; este bloco é idempotente.)
CREATE TABLE IF NOT EXISTS public.usage_report_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_end       timestamptz,
  clicks_reported  integer NOT NULL DEFAULT 0,
  stripe_response  jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.usage_report_log ENABLE ROW LEVEL SECURITY;

-- Só service_role (bypassa RLS) grava. Owner pode ler histórico próprio.
DROP POLICY IF EXISTS "usage_report_log_owner_read" ON public.usage_report_log;
CREATE POLICY "usage_report_log_owner_read"
  ON public.usage_report_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- RPC: reserva atômica de report pro Stripe.
CREATE OR REPLACE FUNCTION public.reserve_usage_report(
  p_user_id         uuid,
  p_period_end      timestamptz,
  p_current_clicks  integer,
  p_max_clicks      integer
)
RETURNS TABLE(
  claim_id          uuid,
  delta_to_report   integer,
  hwm_before        integer,
  overage_now       integer,
  skipped_reason    text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_overage   integer;
  v_hwm       integer;
  v_delta     integer;
  v_claim_id  uuid;
BEGIN
  -- Lock transacional (auto-release no COMMIT/ROLLBACK).
  -- Se outro cron já está processando este user, abortamos silenciosamente.
  IF NOT pg_try_advisory_xact_lock(42, hashtext(p_user_id::text)) THEN
    RETURN QUERY SELECT NULL::uuid, 0, 0, 0, 'locked_by_another_run'::text;
    RETURN;
  END IF;

  v_overage := GREATEST(0, COALESCE(p_current_clicks, 0) - COALESCE(p_max_clicks, 0));

  IF v_overage = 0 THEN
    RETURN QUERY SELECT NULL::uuid, 0, 0, 0, 'no_overage'::text;
    RETURN;
  END IF;

  -- Lê o high-water mark já reportado neste ciclo.
  SELECT COALESCE(MAX(clicks_reported), 0)
    INTO v_hwm
    FROM public.usage_report_log
   WHERE user_id = p_user_id
     AND period_end >= COALESCE(p_period_end, '1970-01-01'::timestamptz);

  v_delta := v_overage - v_hwm;

  IF v_delta <= 0 THEN
    RETURN QUERY SELECT NULL::uuid, 0, v_hwm, v_overage, 'already_reported'::text;
    RETURN;
  END IF;

  -- Insere a CLAIM dentro da mesma transação (lock ainda segurado).
  -- Essa linha vira o novo HWM imediatamente — qualquer cron concorrente
  -- que entrar depois verá este valor e pulará.
  INSERT INTO public.usage_report_log (user_id, period_end, clicks_reported, stripe_response)
  VALUES (
    p_user_id,
    p_period_end,
    v_overage,
    jsonb_build_object('status', 'pending', 'delta', v_delta, 'claimed_at', now())
  )
  RETURNING id INTO v_claim_id;

  RETURN QUERY SELECT v_claim_id, v_delta, v_hwm, v_overage, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_usage_report(uuid, timestamptz, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_usage_report(uuid, timestamptz, integer, integer) TO service_role;

COMMENT ON FUNCTION public.reserve_usage_report IS
  'Sprint 1 — reserva atômica de click-overage pra reporte no Stripe. '
  'Advisory lock transacional impede double-billing em cron concorrente.';

-- -----------------------------------------------------------------------------
-- 4.6 — Índices faltantes (dashboards + billing cron)
-- -----------------------------------------------------------------------------

-- Dashboard/Analytics: toda tela de métricas filtra por (user_id) e ordena por (created_at DESC).
-- Sem este índice, Postgres faz seq scan em requests_log (que pode ter milhões de linhas).
CREATE INDEX IF NOT EXISTS idx_requests_log_user_created
  ON public.requests_log (user_id, created_at DESC);

-- Queries por campanha específica (drill-down em /analytics e /campaigns/:id).
CREATE INDEX IF NOT EXISTS idx_requests_log_user_campaign_created
  ON public.requests_log (user_id, campaign_id, created_at DESC);

-- stripe-webhook e sync-usage-stripe filtram por stripe_customer_id o tempo todo.
-- Partial index (WHERE NOT NULL) mantém o índice pequeno — só users com plano pago.
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer
  ON public.profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- usage_report_log: acelera a query do cron que lê o HWM por user_id + period_end.
CREATE INDEX IF NOT EXISTS idx_usage_report_log_user_period
  ON public.usage_report_log (user_id, period_end DESC, clicks_reported DESC);
