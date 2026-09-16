-- =============================================================================
-- R7 v0.1 — cakto_events_raw: secret_ok + parse_error (V0-1 / V0-2)
-- =============================================================================

BEGIN;

ALTER TABLE public.cakto_events_raw
  ADD COLUMN IF NOT EXISTS secret_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parse_error boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.cakto_events_raw.secret_ok IS
  'V0-2: body.secret bateu com CAKTO_WEBHOOK_SECRET (secret nunca gravado em claro).';
COMMENT ON COLUMN public.cakto_events_raw.parse_error IS
  'V0-1: JSON.parse falhou; body ainda redigido via regex.';

COMMIT;
