-- =============================================================================
-- Fatia 3a — Cakto adaptador (tabelas + seeds + cakto_apply_event)
-- =============================================================================
-- I-11: cancel_at_period_end (não CANCELED imediato no subscription_canceled)
-- I-9: cupom Cakto aceito
-- I-10: paused/resumed → pending:unmapped (painel fica ACTIVE; saúde diária:
--       SELECT count(*) FROM cakto_events
--       WHERE status='pending' AND reason='pending:unmapped';
--       Na 1ª pausa real: revisitar com payload)
-- I-6: stripe_price_id = 'cakto:' || offer_id (activation_status GENERATED; NÃO SET)
-- SECURITY DEFINER = postgres → trigger de proteção passa sem set_config
--
-- Aplicada em prod 2026-09-15 (aprovada + nit concat_ws). Replay A1–A5 via RPC.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- plan_limits (Spec 2 base + Spec 3 hard_caps)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_limits (
  plan_code text PRIMARY KEY,
  plan_name text NOT NULL,
  max_clicks integer NOT NULL,
  max_domains integer NOT NULL,
  max_campaigns integer NOT NULL,
  hard_cap_clicks integer NOT NULL,
  hard_cap_domains integer NOT NULL,
  hard_cap_campaigns integer NOT NULL
);

REVOKE ALL ON TABLE public.plan_limits FROM PUBLIC;
REVOKE ALL ON TABLE public.plan_limits FROM anon;
REVOKE ALL ON TABLE public.plan_limits FROM authenticated;
-- Sem GRANT SELECT a authenticated (P0-2): leitura só via RPC billing_state_for
GRANT ALL ON TABLE public.plan_limits TO postgres;
GRANT ALL ON TABLE public.plan_limits TO service_role;

INSERT INTO public.plan_limits (
  plan_code, plan_name, max_clicks, max_domains, max_campaigns,
  hard_cap_clicks, hard_cap_domains, hard_cap_campaigns
) VALUES
  ('BASIC',      'BASIC PLAN',          8000,   1,  3,  18000,  3,  5),
  ('PRO',        'PRO PLAN',           20000,   3,  8,  40000,  6, 12),
  ('FREEDOM',    'FREEDOM PLAN',      100000,  10, 20, 150000, 15, 30),
  ('ENTERPRISE', 'ENTERPRISE CONQUEST',300000, 20, -1, 400000, 25, -1)
ON CONFLICT (plan_code) DO UPDATE SET
  plan_name = EXCLUDED.plan_name,
  max_clicks = EXCLUDED.max_clicks,
  max_domains = EXCLUDED.max_domains,
  max_campaigns = EXCLUDED.max_campaigns,
  hard_cap_clicks = EXCLUDED.hard_cap_clicks,
  hard_cap_domains = EXCLUDED.hard_cap_domains,
  hard_cap_campaigns = EXCLUDED.hard_cap_campaigns;

-- ---------------------------------------------------------------------------
-- cakto_offers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cakto_offers (
  offer_id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('plan', 'pack')),
  plan_code text REFERENCES public.plan_limits(plan_code),
  plan_name text,
  resource text CHECK (resource IS NULL OR resource IN ('clicks', 'domains', 'campaigns')),
  quantity integer NOT NULL DEFAULT 1,
  unit_size integer NOT NULL DEFAULT 1,
  price_cents integer NOT NULL,
  recurring boolean NOT NULL DEFAULT true,
  checkout_url text,
  active boolean NOT NULL DEFAULT false,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE public.cakto_offers FROM PUBLIC;
REVOKE ALL ON TABLE public.cakto_offers FROM anon;
REVOKE ALL ON TABLE public.cakto_offers FROM authenticated;
-- Sem GRANT SELECT a authenticated (P0-2): expõe is_test/checkout_url/viyq5vd R$5
GRANT ALL ON TABLE public.cakto_offers TO postgres;
GRANT ALL ON TABLE public.cakto_offers TO service_role;

-- Oferta real de teste R$5 (compra Fabio). NÃO usar em lançamento sem subir preço.
INSERT INTO public.cakto_offers (
  offer_id, kind, plan_code, plan_name, price_cents, recurring,
  checkout_url, active, is_test
) VALUES (
  'viyq5vd', 'plan', 'BASIC', 'BASIC PLAN', 500, true,
  'https://pay.cakto.com.br/viyq5vd_1101387', true, true
)
ON CONFLICT (offer_id) DO UPDATE SET
  plan_code = EXCLUDED.plan_code,
  plan_name = EXCLUDED.plan_name,
  price_cents = EXCLUDED.price_cents,
  active = EXCLUDED.active,
  is_test = EXCLUDED.is_test,
  checkout_url = EXCLUDED.checkout_url;

-- Seeds Spec 2 (inactive) — offer_id placeholder até criar ofertas Cakto reais
INSERT INTO public.cakto_offers (
  offer_id, kind, plan_code, plan_name, price_cents, recurring, active, is_test
) VALUES
  ('pending:BASIC:297', 'plan', 'BASIC', 'BASIC PLAN', 29700, true, false, false),
  ('pending:PRO:497', 'plan', 'PRO', 'PRO PLAN', 49700, true, false, false),
  ('pending:FREEDOM:1197', 'plan', 'FREEDOM', 'FREEDOM PLAN', 119700, true, false, false),
  ('pending:ENTERPRISE:1997', 'plan', 'ENTERPRISE', 'ENTERPRISE CONQUEST', 199700, true, false, false)
ON CONFLICT (offer_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- cakto_events (processados) + checkout_intents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cakto_events (
  event_key text PRIMARY KEY,
  event text NOT NULL,
  order_id text,
  subscription_id text,
  user_id uuid,
  offer_id text,
  occurred_at timestamptz,
  status text NOT NULL CHECK (status IN (
    'done', 'duplicate', 'ignored', 'pending', 'failed'
  )),
  reason text,
  payload jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS cakto_events_user_id_idx ON public.cakto_events (user_id);
CREATE INDEX IF NOT EXISTS cakto_events_subscription_id_idx ON public.cakto_events (subscription_id);
CREATE INDEX IF NOT EXISTS cakto_events_status_idx ON public.cakto_events (status);

REVOKE ALL ON TABLE public.cakto_events FROM PUBLIC;
REVOKE ALL ON TABLE public.cakto_events FROM anon;
REVOKE ALL ON TABLE public.cakto_events FROM authenticated;
GRANT ALL ON TABLE public.cakto_events TO postgres;
GRANT ALL ON TABLE public.cakto_events TO service_role;

CREATE TABLE IF NOT EXISTS public.checkout_intents (
  order_id text PRIMARY KEY,
  user_id uuid,
  offer_id text,
  kind text,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  consumed_event_id text
);

REVOKE ALL ON TABLE public.checkout_intents FROM PUBLIC;
REVOKE ALL ON TABLE public.checkout_intents FROM anon;
REVOKE ALL ON TABLE public.checkout_intents FROM authenticated;
GRANT ALL ON TABLE public.checkout_intents TO postgres;
GRANT ALL ON TABLE public.checkout_intents TO service_role;

-- ---------------------------------------------------------------------------
-- profiles — colunas Cakto (fora do grant authenticated; trigger protect cobre)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS billing_provider text,
  ADD COLUMN IF NOT EXISTS plan_code text,
  ADD COLUMN IF NOT EXISTS cakto_subscription_id text,
  ADD COLUMN IF NOT EXISTS cakto_customer_id text,
  ADD COLUMN IF NOT EXISTS billing_last_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_late_since timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_cakto_subscription_id_uidx
  ON public.profiles (cakto_subscription_id)
  WHERE cakto_subscription_id IS NOT NULL;

COMMENT ON COLUMN public.profiles.cancel_at_period_end IS
  'I-11: subscription_canceled Cakto = não renovar; ACTIVE até billing_cycle_end';

-- ---------------------------------------------------------------------------
-- apply_billing_expirations (I-11 cron)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_billing_expirations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_n integer;
BEGIN
  -- P2-1: cancelar addons só dos profiles que acabaram de expirar neste run
  WITH expired AS (
    UPDATE public.profiles
    SET subscription_status = 'canceled',
        cancel_at_period_end = false
    WHERE cancel_at_period_end IS TRUE
      AND billing_cycle_end IS NOT NULL
      AND billing_cycle_end < now()
      AND subscription_status = 'active'
    RETURNING user_id
  ),
  _addons AS (
    UPDATE public.subscription_addons sa
    SET status = 'cancelled'
    FROM expired e
    WHERE sa.user_id = e.user_id
      AND sa.status = 'active'
    RETURNING sa.id
  )
  SELECT count(*)::integer INTO v_n FROM expired;

  RETURN jsonb_build_object('expired', COALESCE(v_n, 0), 'at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.apply_billing_expirations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_billing_expirations() FROM anon;
REVOKE ALL ON FUNCTION public.apply_billing_expirations() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_billing_expirations() TO postgres;
GRANT EXECUTE ON FUNCTION public.apply_billing_expirations() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job WHERE jobname = 'apply-billing-expirations';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'apply-billing-expirations',
  '15 4 * * *',
  $$SELECT public.apply_billing_expirations();$$
);

-- ---------------------------------------------------------------------------
-- cakto_apply_event(p_event jsonb) — única mutação de estado
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cakto_apply_event(p_event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_event text := p_event->>'event';
  v_event_key text := p_event->>'event_key';
  v_order_id text := p_event->>'order_id';
  v_sub_id text := p_event->>'subscription_id';
  v_offer_id text := p_event->>'offer_id';
  v_product_type text := p_event->>'product_type';
  v_status text := p_event->>'status';
  v_sub_status text := p_event->>'sub_status';
  v_paid_payments integer := COALESCE((p_event->>'paid_payments')::integer, 0);
  v_base_amount numeric := COALESCE((p_event->>'base_amount')::numeric, 0);
  v_amount numeric := COALESCE((p_event->>'amount')::numeric, 0);
  v_discount numeric := COALESCE((p_event->>'discount')::numeric, 0);
  v_coupon text := NULLIF(p_event->>'coupon', '');
  v_occurred_at timestamptz := NULLIF(p_event->>'occurred_at', '')::timestamptz;
  v_cycle_end timestamptz := NULLIF(p_event->>'cycle_end', '')::timestamptz;
  v_paid_at timestamptz := COALESCE(NULLIF(p_event->>'paid_at', '')::timestamptz, v_occurred_at, now());
  v_sck text := NULLIF(p_event#>>'{user_hint,sck}', '');
  v_utm text := NULLIF(p_event#>>'{user_hint,utm_content}', '');
  v_email text := lower(NULLIF(p_event#>>'{user_hint,email}', ''));
  v_cakto_customer text := NULLIF(p_event->>'cakto_customer_id', '');
  v_currency text := COALESCE(p_event->>'currency', 'BRL');

  v_user_id uuid;
  v_matched_by text;
  v_offer public.cakto_offers%ROWTYPE;
  v_limits public.plan_limits%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_ins integer;
  v_reason text;
  v_old_sub text;
BEGIN
  IF v_event_key IS NULL OR v_event IS NULL THEN
    RETURN jsonb_build_object('status', 'failed', 'reason', 'missing_event_key');
  END IF;

  v_occurred_at := COALESCE(v_occurred_at, now());

  -- Idempotência: insert first; pending pode reprocessar (P1-1)
  INSERT INTO public.cakto_events (
    event_key, event, order_id, subscription_id, offer_id, occurred_at,
    status, payload, received_at
  ) VALUES (
    v_event_key, v_event, v_order_id, v_sub_id, v_offer_id, v_occurred_at,
    'pending', p_event, now()
  )
  ON CONFLICT (event_key) DO UPDATE
    SET received_at = now(),
        payload = EXCLUDED.payload,
        reason = NULL,
        processed_at = NULL
    WHERE public.cakto_events.status = 'pending';

  GET DIAGNOSTICS v_ins = ROW_COUNT;
  IF v_ins = 0 THEN
    RETURN jsonb_build_object('status', 'duplicate', 'reason', 'event_key_exists');
  END IF;

  -- Intent-only events
  IF v_event IN (
    'pix_gerado', 'boleto_gerado', 'picpay_gerado', 'openfinance_nubank_gerado',
    'checkout_abandonment', 'purchase_refused'
  ) THEN
    IF v_order_id IS NOT NULL THEN
      INSERT INTO public.checkout_intents (order_id, offer_id, status, updated_at)
      VALUES (v_order_id, v_offer_id, COALESCE(v_status, v_event), now())
      ON CONFLICT (order_id) DO UPDATE SET
        status = EXCLUDED.status,
        updated_at = now();
    END IF;
    UPDATE public.cakto_events
    SET status = 'ignored', reason = 'ignored:intent', processed_at = now()
    WHERE event_key = v_event_key;
    RETURN jsonb_build_object('status', 'ignored', 'reason', 'ignored:intent');
  END IF;

  IF v_event IN ('subscription_paused', 'subscription_resumed') THEN
    UPDATE public.cakto_events
    SET status = 'pending', reason = 'pending:unmapped', processed_at = now()
    WHERE event_key = v_event_key;
    RETURN jsonb_build_object('status', 'pending', 'reason', 'pending:unmapped');
  END IF;

  -- Resolve user: sck → utm_content → cakto_subscription_id (exits) → email único
  -- Cast ::uuid com EXCEPTION (sck lixo não derruba a função)
  IF v_sck IS NOT NULL THEN
    BEGIN
      SELECT user_id INTO v_user_id
      FROM public.profiles WHERE user_id = v_sck::uuid;
      IF v_user_id IS NOT NULL THEN v_matched_by := 'sck'; END IF;
    EXCEPTION WHEN invalid_text_representation THEN
      v_user_id := NULL;
    END;
  END IF;

  IF v_user_id IS NULL AND v_utm IS NOT NULL THEN
    BEGIN
      SELECT user_id INTO v_user_id
      FROM public.profiles WHERE user_id = v_utm::uuid;
      IF v_user_id IS NOT NULL THEN v_matched_by := 'utm_content'; END IF;
    EXCEPTION WHEN invalid_text_representation THEN
      v_user_id := NULL;
    END;
  END IF;

  -- Exit events: match subscription id BEFORE email
  IF v_user_id IS NULL AND v_sub_id IS NOT NULL AND v_event IN (
    'subscription_canceled', 'subscription_late', 'subscription_renewed',
    'subscription_renewal_refused', 'subscription_late_recovered',
    'refund', 'chargeback'
  ) THEN
    SELECT user_id INTO v_user_id
    FROM public.profiles WHERE cakto_subscription_id = v_sub_id;
    IF v_user_id IS NOT NULL THEN v_matched_by := 'cakto_subscription_id'; END IF;
  END IF;

  IF v_user_id IS NULL AND v_email IS NOT NULL THEN
    SELECT user_id INTO v_user_id
    FROM public.profiles
    WHERE lower(email) = v_email
    LIMIT 2;
    IF FOUND THEN
      IF (SELECT count(*) FROM public.profiles WHERE lower(email) = v_email) = 1 THEN
        SELECT user_id INTO v_user_id FROM public.profiles WHERE lower(email) = v_email;
        v_matched_by := 'email';
      ELSE
        v_user_id := NULL;
      END IF;
    END IF;
  END IF;

  IF v_user_id IS NULL THEN
    UPDATE public.cakto_events
    SET status = 'pending', reason = 'user_unresolved', processed_at = now()
    WHERE event_key = v_event_key;
    RETURN jsonb_build_object('status', 'pending', 'reason', 'user_unresolved');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cakto:' || v_user_id::text));

  SELECT * INTO v_profile FROM public.profiles WHERE user_id = v_user_id FOR UPDATE;

  IF COALESCE(v_profile.is_deleted, false) THEN
    UPDATE public.cakto_events
    SET status = 'pending', reason = 'deleted_user', user_id = v_user_id, processed_at = now()
    WHERE event_key = v_event_key;
    RETURN jsonb_build_object('status', 'pending', 'reason', 'deleted_user');
  END IF;

  IF v_profile.stripe_price_id = 'admin_bypass' THEN
    UPDATE public.cakto_events
    SET status = 'pending', reason = 'admin_bypass', user_id = v_user_id, processed_at = now()
    WHERE event_key = v_event_key;
    RETURN jsonb_build_object('status', 'pending', 'reason', 'admin_bypass');
  END IF;

  -- P0-1: exit events só se a assinatura do evento for a atual do profile
  IF v_event IN (
        'subscription_canceled', 'subscription_late', 'subscription_renewed',
        'subscription_renewal_refused', 'subscription_late_recovered',
        'refund', 'chargeback'
      )
     AND v_sub_id IS NOT NULL
     AND v_profile.cakto_subscription_id IS DISTINCT FROM v_sub_id THEN
    UPDATE public.cakto_events
    SET status = 'pending',
        reason = 'pending:subscription_mismatch',
        user_id = v_user_id,
        processed_at = now()
    WHERE event_key = v_event_key;
    RETURN jsonb_build_object(
      'status', 'pending',
      'reason', 'pending:subscription_mismatch',
      'current_sub', v_profile.cakto_subscription_id
    );
  END IF;

  -- Stale (estado), refund/chargeback always apply
  IF v_event NOT IN ('refund', 'chargeback')
     AND v_profile.billing_last_event_at IS NOT NULL
     AND v_occurred_at < v_profile.billing_last_event_at THEN
    UPDATE public.cakto_events
    SET status = 'ignored', reason = 'ignored:stale', user_id = v_user_id, processed_at = now()
    WHERE event_key = v_event_key;
    RETURN jsonb_build_object('status', 'ignored', 'reason', 'ignored:stale');
  END IF;

  UPDATE public.cakto_events SET user_id = v_user_id WHERE event_key = v_event_key;

  -- ---- subscription_canceled (I-11) ----
  IF v_event = 'subscription_canceled' THEN
    UPDATE public.profiles SET
      cancel_at_period_end = true,
      canceled_at = COALESCE(NULLIF(p_event->>'canceled_at', '')::timestamptz, v_occurred_at),
      billing_last_event_at = GREATEST(COALESCE(billing_last_event_at, v_occurred_at), v_occurred_at)
    WHERE user_id = v_user_id;

    UPDATE public.cakto_events
    SET status = 'done', reason = 'cancel_at_period_end', processed_at = now()
    WHERE event_key = v_event_key;
    RETURN jsonb_build_object('status', 'done', 'reason', 'cancel_at_period_end', 'matched_by', v_matched_by);
  END IF;

  -- ---- late / recovered / renewal_refused ----
  IF v_event = 'subscription_late' THEN
    UPDATE public.profiles SET
      payment_late_since = COALESCE(payment_late_since, v_occurred_at),
      billing_last_event_at = GREATEST(COALESCE(billing_last_event_at, v_occurred_at), v_occurred_at)
    WHERE user_id = v_user_id;
    UPDATE public.cakto_events SET status = 'done', reason = 'late_badge', processed_at = now()
    WHERE event_key = v_event_key;
    RETURN jsonb_build_object('status', 'done', 'reason', 'late_badge');
  END IF;

  IF v_event = 'subscription_late_recovered' THEN
    -- P2-3: não reativar após canceled da mesma sub
    IF v_profile.subscription_status = 'canceled' THEN
      UPDATE public.cakto_events
      SET status = 'pending', reason = 'pending:reactivation_after_cancel', processed_at = now()
      WHERE event_key = v_event_key;
      RETURN jsonb_build_object('status', 'pending', 'reason', 'pending:reactivation_after_cancel');
    END IF;
    UPDATE public.profiles SET
      subscription_status = 'active',
      payment_late_since = NULL,
      billing_last_event_at = GREATEST(COALESCE(billing_last_event_at, v_occurred_at), v_occurred_at)
    WHERE user_id = v_user_id;
    UPDATE public.cakto_events SET status = 'done', processed_at = now() WHERE event_key = v_event_key;
    RETURN jsonb_build_object('status', 'done');
  END IF;

  IF v_event = 'subscription_renewal_refused' THEN
    UPDATE public.profiles SET
      subscription_status = 'past_due',
      billing_last_event_at = GREATEST(COALESCE(billing_last_event_at, v_occurred_at), v_occurred_at)
    WHERE user_id = v_user_id;
    UPDATE public.cakto_events SET status = 'done', processed_at = now() WHERE event_key = v_event_key;
    RETURN jsonb_build_object('status', 'done', 'reason', 'past_due');
  END IF;

  -- ---- refund / chargeback (imediato) ----
  IF v_event IN ('refund', 'chargeback') THEN
    UPDATE public.profiles SET
      subscription_status = 'canceled',
      cancel_at_period_end = false,
      canceled_at = v_occurred_at,
      is_suspended = CASE WHEN v_event = 'chargeback' THEN true ELSE is_suspended END,
      billing_last_event_at = GREATEST(COALESCE(billing_last_event_at, v_occurred_at), v_occurred_at)
    WHERE user_id = v_user_id;

    UPDATE public.subscription_addons
    SET status = 'cancelled'
    WHERE user_id = v_user_id AND status = 'active';

    UPDATE public.cakto_events SET status = 'done', processed_at = now() WHERE event_key = v_event_key;
    RETURN jsonb_build_object('status', 'done', 'reason', v_event);
  END IF;

  -- ---- renewed ----
  IF v_event = 'subscription_renewed' THEN
    -- P2-3: não reativar após canceled da mesma sub
    IF v_profile.subscription_status = 'canceled' THEN
      UPDATE public.cakto_events
      SET status = 'pending', reason = 'pending:reactivation_after_cancel', processed_at = now()
      WHERE event_key = v_event_key;
      RETURN jsonb_build_object('status', 'pending', 'reason', 'pending:reactivation_after_cancel');
    END IF;
    UPDATE public.profiles SET
      subscription_status = 'active',
      billing_cycle_start = v_paid_at,
      billing_cycle_end = COALESCE(v_cycle_end, v_paid_at + interval '30 days'),
      current_clicks = 0,
      cancel_at_period_end = false,
      canceled_at = NULL,
      payment_late_since = NULL,
      billing_last_event_at = GREATEST(COALESCE(billing_last_event_at, v_occurred_at), v_occurred_at)
    WHERE user_id = v_user_id;

    -- I-4 / fatia 4: expires_at em subscription_addons ainda não existe.
    -- Packs de clique com expires_at serão cancelados na renovação quando a coluna existir.

    UPDATE public.cakto_events SET status = 'done', processed_at = now() WHERE event_key = v_event_key;
    RETURN jsonb_build_object('status', 'done', 'reason', 'renewed');
  END IF;

  -- ---- purchase_approved / subscription_created (apply_plan) ----
  IF v_event NOT IN ('purchase_approved', 'subscription_created') THEN
    UPDATE public.cakto_events
    SET status = 'pending', reason = 'pending:unmapped', processed_at = now()
    WHERE event_key = v_event_key;
    RETURN jsonb_build_object('status', 'pending', 'reason', 'pending:unmapped');
  END IF;

  IF v_event = 'subscription_created' AND v_paid_payments < 1 THEN
    UPDATE public.cakto_events
    SET status = 'ignored', reason = 'ignored:unpaid', processed_at = now()
    WHERE event_key = v_event_key;
    RETURN jsonb_build_object('status', 'ignored', 'reason', 'ignored:unpaid');
  END IF;

  IF v_event = 'purchase_approved' AND v_status IS DISTINCT FROM 'paid' THEN
    UPDATE public.cakto_events
    SET status = 'ignored', reason = 'ignored:not_paid', processed_at = now()
    WHERE event_key = v_event_key;
    RETURN jsonb_build_object('status', 'ignored', 'reason', 'ignored:not_paid');
  END IF;

  IF v_product_type IS DISTINCT FROM 'subscription' THEN
    UPDATE public.cakto_events
    SET status = 'pending', reason = 'pending:type_mismatch', processed_at = now()
    WHERE event_key = v_event_key;
    RETURN jsonb_build_object('status', 'pending', 'reason', 'pending:type_mismatch');
  END IF;

  SELECT * INTO v_offer FROM public.cakto_offers WHERE offer_id = v_offer_id;
  IF NOT FOUND OR v_offer.active IS NOT TRUE THEN
    UPDATE public.cakto_events
    SET status = 'pending', reason = 'pending:unknown_offer', processed_at = now()
    WHERE event_key = v_event_key;
    RETURN jsonb_build_object('status', 'pending', 'reason', 'pending:unknown_offer');
  END IF;

  IF v_offer.kind = 'pack' THEN
    UPDATE public.cakto_events
    SET status = 'pending', reason = 'pending:packs_not_enabled', processed_at = now()
    WHERE event_key = v_event_key;
    RETURN jsonb_build_object('status', 'pending', 'reason', 'pending:packs_not_enabled');
  END IF;

  IF v_offer.kind IS DISTINCT FROM 'plan' THEN
    UPDATE public.cakto_events
    SET status = 'pending', reason = 'pending:unknown_offer', processed_at = now()
    WHERE event_key = v_event_key;
    RETURN jsonb_build_object('status', 'pending', 'reason', 'pending:unknown_offer');
  END IF;

  -- Value rules (§5)
  IF v_currency IS DISTINCT FROM 'BRL' THEN
    UPDATE public.cakto_events
    SET status = 'pending', reason = 'pending:currency', processed_at = now()
    WHERE event_key = v_event_key;
    RETURN jsonb_build_object('status', 'pending', 'reason', 'pending:currency');
  END IF;

  IF round(v_base_amount * 100)::integer IS DISTINCT FROM v_offer.price_cents THEN
    UPDATE public.cakto_events
    SET status = 'pending', reason = 'pending:price_mismatch', processed_at = now()
    WHERE event_key = v_event_key;
    RETURN jsonb_build_object('status', 'pending', 'reason', 'pending:price_mismatch');
  END IF;

  IF v_discount > 0 AND v_coupon IS NULL THEN
    UPDATE public.cakto_events
    SET status = 'pending', reason = 'pending:discount_without_coupon', processed_at = now()
    WHERE event_key = v_event_key;
    RETURN jsonb_build_object('status', 'pending', 'reason', 'pending:discount_without_coupon');
  END IF;

  IF v_amount < (v_base_amount - v_discount - 0.01) THEN
    UPDATE public.cakto_events
    SET status = 'pending', reason = 'pending:amount_too_low', processed_at = now()
    WHERE event_key = v_event_key;
    RETURN jsonb_build_object('status', 'pending', 'reason', 'pending:amount_too_low');
  END IF;

  SELECT * INTO v_limits FROM public.plan_limits WHERE plan_code = v_offer.plan_code;
  IF NOT FOUND THEN
    UPDATE public.cakto_events
    SET status = 'pending', reason = 'pending:unknown_plan', processed_at = now()
    WHERE event_key = v_event_key;
    RETURN jsonb_build_object('status', 'pending', 'reason', 'pending:unknown_plan');
  END IF;

  -- Mesma assinatura (cakto_subscription_id): só refina ciclo — sem current_clicks=0
  IF v_sub_id IS NOT NULL
     AND v_profile.cakto_subscription_id IS NOT DISTINCT FROM v_sub_id
     AND v_profile.subscription_status = 'active' THEN
    UPDATE public.profiles SET
      billing_cycle_end = COALESCE(v_cycle_end, billing_cycle_end),
      billing_last_event_at = GREATEST(COALESCE(billing_last_event_at, v_occurred_at), v_occurred_at),
      cakto_customer_id = COALESCE(v_cakto_customer, cakto_customer_id),
      payment_late_since = NULL
    WHERE user_id = v_user_id;

    IF v_order_id IS NOT NULL THEN
      UPDATE public.checkout_intents
      SET status = 'consumed', updated_at = now(), consumed_event_id = v_event_key
      WHERE order_id = v_order_id;
    END IF;

    UPDATE public.cakto_events
    SET status = 'done', reason = 'refine_cycle', processed_at = now()
    WHERE event_key = v_event_key;
    RETURN jsonb_build_object('status', 'done', 'reason', 'refine_cycle', 'matched_by', v_matched_by);
  END IF;

  -- New plan / new subscription
  v_old_sub := v_profile.cakto_subscription_id;
  v_reason := NULL;
  IF v_old_sub IS NOT NULL AND v_old_sub IS DISTINCT FROM v_sub_id THEN
    v_reason := 'previous_subscription_open:' || v_old_sub;
  END IF;
  -- P2-4: dinheiro entra, gate 1A continua fechado se suspended
  IF COALESCE(v_profile.is_suspended, false) THEN
    v_reason := concat_ws(';', v_reason, 'apply_plan:suspended');
  END IF;

  UPDATE public.subscription_addons
  SET status = 'cancelled'
  WHERE user_id = v_user_id AND status = 'active';

  UPDATE public.profiles SET
    plan_code = v_offer.plan_code,
    plan_name = COALESCE(v_offer.plan_name, v_limits.plan_name),
    max_clicks = v_limits.max_clicks,
    max_domains = v_limits.max_domains,
    max_campaigns = v_limits.max_campaigns,
    subscription_status = 'active',
    stripe_price_id = 'cakto:' || v_offer.offer_id,
    billing_provider = 'cakto',
    cakto_subscription_id = v_sub_id,
    cakto_customer_id = COALESCE(v_cakto_customer, cakto_customer_id),
    billing_cycle_start = v_paid_at,
    billing_cycle_end = COALESCE(v_cycle_end, v_paid_at + interval '30 days'),
    current_clicks = 0,
    cancel_at_period_end = false,
    canceled_at = NULL,
    payment_late_since = NULL,
    billing_last_event_at = GREATEST(COALESCE(billing_last_event_at, v_occurred_at), v_occurred_at)
  WHERE user_id = v_user_id;

  IF v_order_id IS NOT NULL THEN
    UPDATE public.checkout_intents
    SET status = 'consumed', user_id = v_user_id, updated_at = now(), consumed_event_id = v_event_key
    WHERE order_id = v_order_id;
  END IF;

  UPDATE public.cakto_events
  SET status = 'done', reason = COALESCE(v_reason, 'apply_plan'), processed_at = now()
  WHERE event_key = v_event_key;

  RETURN jsonb_build_object(
    'status', 'done',
    'reason', COALESCE(v_reason, 'apply_plan'),
    'matched_by', v_matched_by,
    'user_id', v_user_id,
    'plan_code', v_offer.plan_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cakto_apply_event(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cakto_apply_event(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.cakto_apply_event(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cakto_apply_event(jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.cakto_apply_event(jsonb) TO service_role;

-- =============================================================================
-- Checklist pós-aceite / pode lançar (operacional — NÃO roda sozinho)
-- =============================================================================
-- P1-2 PÓS-ACEITE A7 (mesmo dia, à mão):
--   UPDATE public.cakto_offers SET active = false WHERE offer_id = 'viyq5vd' AND is_test;
-- P1-3 Gate lançamento — 4 ofertas reais Cakto (não placeholder):
--   SELECT offer_id FROM public.cakto_offers
--   WHERE kind = 'plan' AND active AND NOT is_test;  -- deve retornar 4
-- P2-5 event_key é contrato edge↔ banco (normalize() na fatia 3b)
-- Saúde I-10:
--   SELECT count(*) FROM public.cakto_events
--   WHERE status = 'pending' AND reason = 'pending:unmapped';
-- =============================================================================

COMMIT;
