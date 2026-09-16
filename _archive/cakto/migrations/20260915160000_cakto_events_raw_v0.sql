-- =============================================================================
-- R7 passo 0 — cakto_events_raw (webhook v0: só captura)
-- =============================================================================
-- Retenção 24h via pg_cron. Sem grants a anon/authenticated. Só service_role.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.cakto_events_raw (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  headers jsonb NOT NULL,
  body text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cakto_events_raw_received_at_idx
  ON public.cakto_events_raw (received_at);

COMMENT ON TABLE public.cakto_events_raw IS
  'R7 v0: payloads brutos Cakto para fechar G1–G8. Retenção 24h. Não processar.';

ALTER TABLE public.cakto_events_raw ENABLE ROW LEVEL SECURITY;

-- Sem policies para anon/authenticated → RLS nega. service_role bypassa.
REVOKE ALL ON TABLE public.cakto_events_raw FROM PUBLIC;
REVOKE ALL ON TABLE public.cakto_events_raw FROM anon;
REVOKE ALL ON TABLE public.cakto_events_raw FROM authenticated;
GRANT ALL ON TABLE public.cakto_events_raw TO postgres;
GRANT ALL ON TABLE public.cakto_events_raw TO service_role;

-- Sequence grants (IDENTITY)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Cron: limpeza a cada hora (TTL 24h)
DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'cleanup-cakto-events-raw';
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-cakto-events-raw',
  '20 * * * *',
  $$DELETE FROM public.cakto_events_raw WHERE received_at < now() - interval '24 hours'$$
);

COMMIT;
