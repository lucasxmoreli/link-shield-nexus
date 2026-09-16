-- =============================================================================
-- Fatia 3b — billing_settings + billing_state_for v2 + checkout_sessions
--            + fix admin_change_plan (P1 Cakto + Spec 2 max_campaigns)
-- =============================================================================
-- Spec Claude 2026-09-15. NÃO APLICAR até revisão read-only.
--
-- Nits Cursor vs Spec:
--   N1: managed_account checa stripe_price_id='admin_bypass' (não billing_provider)
--   N2: FREEDOM vitalício Fabio = UPDATE manual bypass (P1 impede bypass acidental
--       em pagante Cakto; não usar admin_change_plan pra “forçar” bypass nele)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- billing_settings (kill switch checkout)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE public.billing_settings FROM PUBLIC;
REVOKE ALL ON TABLE public.billing_settings FROM anon;
REVOKE ALL ON TABLE public.billing_settings FROM authenticated;
GRANT ALL ON TABLE public.billing_settings TO postgres;
GRANT ALL ON TABLE public.billing_settings TO service_role;

INSERT INTO public.billing_settings (key, value)
VALUES ('checkout', '{"enabled": false, "audience": "admins"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.billing_settings IS
  'Fatia 3b: checkout.enabled + audience ∈ admins|all. Só service_role/postgres.';

-- ---------------------------------------------------------------------------
-- checkout_sessions (métrica / rate limit / utm_campaign=cs_<id>)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id),
  offer_id text NOT NULL,
  plan_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checkout_sessions_user_created_idx
  ON public.checkout_sessions (user_id, created_at DESC);

REVOKE ALL ON TABLE public.checkout_sessions FROM PUBLIC;
REVOKE ALL ON TABLE public.checkout_sessions FROM anon;
REVOKE ALL ON TABLE public.checkout_sessions FROM authenticated;
GRANT ALL ON TABLE public.checkout_sessions TO postgres;
GRANT ALL ON TABLE public.checkout_sessions TO service_role;

-- ---------------------------------------------------------------------------
-- admin_change_plan — P1 Cakto + limites via plan_limits (Spec 2)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_change_plan(
  p_user_id uuid,
  p_plan_name text,
  p_max_clicks integer,
  p_max_domains integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_plan_code text;
  v_max_campaigns integer;
  v_limits public.plan_limits%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_plan_code := CASE
    WHEN upper(btrim(COALESCE(p_plan_name, ''))) LIKE '%ENTERPRISE%' THEN 'ENTERPRISE'
    WHEN upper(btrim(COALESCE(p_plan_name, ''))) LIKE '%FREEDOM%'    THEN 'FREEDOM'
    WHEN upper(btrim(COALESCE(p_plan_name, ''))) LIKE '%PRO%'        THEN 'PRO'
    WHEN upper(btrim(COALESCE(p_plan_name, ''))) LIKE '%BASIC%'      THEN 'BASIC'
    ELSE 'FREE'
  END;

  SELECT * INTO v_limits FROM public.plan_limits WHERE plan_code = v_plan_code;
  IF FOUND THEN
    v_max_campaigns := v_limits.max_campaigns;
  ELSE
    -- FREE / desconhecido
    v_max_campaigns := 0;
  END IF;

  UPDATE public.profiles SET
    plan_name           = p_plan_name,
    plan_code           = NULLIF(v_plan_code, 'FREE'),
    max_clicks          = p_max_clicks,
    max_domains         = p_max_domains,
    max_campaigns       = v_max_campaigns,
    billing_cycle_start = now(),
    billing_cycle_end   = now() + interval '30 days',
    subscription_status = 'active',
    -- P1: nunca sobrescrever cakto:* com admin_bypass (pagante continua no adaptador)
    stripe_price_id     = CASE
      WHEN billing_provider = 'cakto' THEN stripe_price_id
      WHEN stripe_subscription_id IS NULL THEN 'admin_bypass'
      ELSE stripe_price_id
    END
  WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_change_plan(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_change_plan(uuid, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_change_plan(uuid, text, integer, integer) TO service_role;

COMMENT ON FUNCTION public.admin_change_plan(uuid, text, integer, integer) IS
  'Admin plan change. Cakto payers keep stripe_price_id. max_campaigns from plan_limits.';

-- ---------------------------------------------------------------------------
-- billing_state_for v2 — checkout_available + plans[] + can_change_plan
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_state_for(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.profiles%ROWTYPE;
  v_plan_key text;
  v_pack_count_clicks integer := 0;
  v_extra_domains integer := 0;
  v_extra_campaigns integer := 0;
  v_pack_extra_clicks integer := 0;
  v_used_clicks integer := 0;
  v_used_domains integer := 0;
  v_used_campaigns integer := 0;
  v_base_clicks integer;
  v_base_domains integer;
  v_base_campaigns integer;
  v_eff_clicks integer;
  v_eff_domains integer;
  v_eff_campaigns integer;
  v_cap_clicks integer;
  v_cap_domains integer;
  v_cap_campaigns integer;
  v_unit_clicks integer;
  v_price_clicks integer;
  v_price_domain integer;
  v_price_campaign integer;
  v_max_click_packs integer := 2;
  v_is_bypass boolean;
  v_is_admin boolean;
  v_settings jsonb;
  v_enabled boolean := false;
  v_audience text := 'admins';
  v_checkout_available boolean := false;
  v_plans jsonb := '[]'::jsonb;
  v_limits public.plan_limits%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO r FROM public.profiles WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0001';
  END IF;

  v_is_bypass := (r.stripe_price_id IS NOT DISTINCT FROM 'admin_bypass');
  v_is_admin := public.has_role(p_user_id, 'admin');

  SELECT value INTO v_settings
  FROM public.billing_settings WHERE key = 'checkout';
  IF FOUND THEN
    v_enabled := COALESCE((v_settings->>'enabled')::boolean, false);
    v_audience := COALESCE(v_settings->>'audience', 'admins');
  END IF;

  -- Prefer plan_code; fallback por nome (compat FREE antigo)
  v_plan_key := COALESCE(
    NULLIF(upper(btrim(r.plan_code)), ''),
    CASE
      WHEN upper(btrim(COALESCE(r.plan_name, ''))) LIKE '%ENTERPRISE%' THEN 'ENTERPRISE'
      WHEN upper(btrim(COALESCE(r.plan_name, ''))) LIKE '%FREEDOM%'    THEN 'FREEDOM'
      WHEN upper(btrim(COALESCE(r.plan_name, ''))) LIKE '%PRO%'        THEN 'PRO'
      WHEN upper(btrim(COALESCE(r.plan_name, ''))) LIKE '%BASIC%'      THEN 'BASIC'
      ELSE 'FREE'
    END
  );

  v_base_clicks    := COALESCE(r.max_clicks, 0);
  v_base_domains   := COALESCE(r.max_domains, 0);
  v_base_campaigns := COALESCE(r.max_campaigns, 0);
  v_used_clicks    := COALESCE(r.current_clicks, 0);

  SELECT
    COALESCE(SUM(CASE WHEN addon_type = 'extra_clicks'   THEN quantity ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE WHEN addon_type = 'extra_domain'   THEN quantity ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE WHEN addon_type = 'extra_campaign' THEN quantity ELSE 0 END), 0)::integer
  INTO v_pack_count_clicks, v_extra_domains, v_extra_campaigns
  FROM public.subscription_addons
  WHERE user_id = p_user_id AND status = 'active';

  SELECT count(*)::integer INTO v_used_domains
  FROM public.domains WHERE user_id = p_user_id;

  SELECT count(*)::integer INTO v_used_campaigns
  FROM public.campaigns WHERE user_id = p_user_id;

  -- Hard caps + preços pack: plan_limits quando existir; senão mapa Spec 3
  SELECT * INTO v_limits FROM public.plan_limits WHERE plan_code = v_plan_key;
  IF FOUND THEN
    v_cap_clicks := v_limits.hard_cap_clicks;
    v_cap_domains := v_limits.hard_cap_domains;
    v_cap_campaigns := v_limits.hard_cap_campaigns;
  ELSE
    v_cap_clicks := 0; v_cap_domains := 0; v_cap_campaigns := 0;
  END IF;

  CASE v_plan_key
    WHEN 'BASIC' THEN
      v_unit_clicks := 5000; v_price_clicks := 14700;
      v_price_domain := 6700; v_price_campaign := 4700;
    WHEN 'PRO' THEN
      v_unit_clicks := 10000; v_price_clicks := 19700;
      v_price_domain := 9700; v_price_campaign := 6700;
    WHEN 'FREEDOM' THEN
      v_unit_clicks := 25000; v_price_clicks := 39700;
      v_price_domain := 14700; v_price_campaign := 9700;
    WHEN 'ENTERPRISE' THEN
      v_unit_clicks := 50000; v_price_clicks := 49700;
      v_price_domain := 19700; v_price_campaign := NULL;
    ELSE
      v_unit_clicks := 0; v_price_clicks := 0;
      v_price_domain := 0; v_price_campaign := 0;
  END CASE;

  v_pack_extra_clicks := v_pack_count_clicks * COALESCE(v_unit_clicks, 0);

  v_eff_clicks := CASE
    WHEN v_base_clicks < 0 THEN -1
    ELSE v_base_clicks + v_pack_extra_clicks
  END;
  v_eff_domains := CASE
    WHEN v_base_domains < 0 THEN -1
    ELSE v_base_domains + v_extra_domains
  END;
  v_eff_campaigns := CASE
    WHEN v_base_campaigns < 0 THEN -1
    ELSE v_base_campaigns + v_extra_campaigns
  END;

  IF v_is_bypass THEN
    v_cap_clicks := v_eff_clicks;
    v_cap_domains := v_eff_domains;
    v_cap_campaigns := v_eff_campaigns;
  END IF;

  -- checkout_available
  v_checkout_available :=
    v_enabled
    AND (
      v_audience = 'all'
      OR (v_audience = 'admins' AND v_is_admin)
    )
    AND EXISTS (
      SELECT 1 FROM public.cakto_offers o
      WHERE o.kind = 'plan'
        AND o.active IS TRUE
        AND (o.is_test IS NOT TRUE OR (v_audience = 'admins' AND v_is_admin))
    );

  -- plans[] — active offers; is_test só para admin + audience admins
  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.sort_ord), '[]'::jsonb)
  INTO v_plans
  FROM (
    SELECT
      pl.plan_code,
      pl.plan_name,
      o.price_cents,
      o.offer_id,
      pl.max_clicks,
      pl.max_domains,
      pl.max_campaigns,
      pl.hard_cap_clicks,
      pl.hard_cap_domains,
      pl.hard_cap_campaigns,
      o.is_test,
      (pl.plan_code = v_plan_key) AS is_current,
      CASE pl.plan_code
        WHEN 'BASIC' THEN 1
        WHEN 'PRO' THEN 2
        WHEN 'FREEDOM' THEN 3
        WHEN 'ENTERPRISE' THEN 4
        ELSE 9
      END AS sort_ord
    FROM public.cakto_offers o
    JOIN public.plan_limits pl ON pl.plan_code = o.plan_code
    WHERE o.kind = 'plan'
      AND o.active IS TRUE
      AND (
        o.is_test IS NOT TRUE
        OR (v_is_admin AND v_audience = 'admins')
      )
  ) x;

  RETURN jsonb_build_object(
    'plan', jsonb_build_object(
      'name', r.plan_name,
      'key', v_plan_key,
      'activation_status', r.activation_status,
      'subscription_status', r.subscription_status,
      'billing_cycle_start', r.billing_cycle_start,
      'billing_cycle_end', r.billing_cycle_end,
      'is_admin_bypass', v_is_bypass,
      'checkout_available', v_checkout_available,
      'can_change_plan', false,
      'cancel_at_period_end', COALESCE(r.cancel_at_period_end, false),
      'billing_provider', r.billing_provider
    ),
    'plans', v_plans,
    'resources', jsonb_build_object(
      'clicks', public._billing_resource_obj(
        v_base_clicks, v_pack_extra_clicks, v_eff_clicks, v_cap_clicks, v_used_clicks),
      'domains', public._billing_resource_obj(
        v_base_domains, v_extra_domains, v_eff_domains, v_cap_domains, v_used_domains),
      'campaigns', public._billing_resource_obj(
        v_base_campaigns, v_extra_campaigns, v_eff_campaigns, v_cap_campaigns, v_used_campaigns)
    ),
    'packs', jsonb_build_object(
      'clicks', public._billing_pack_obj(
        r.activation_status, v_plan_key, 'clicks',
        v_pack_count_clicks, v_max_click_packs, v_unit_clicks, v_price_clicks,
        v_eff_clicks, v_cap_clicks, false),
      'domains', public._billing_pack_obj(
        r.activation_status, v_plan_key, 'domains',
        v_extra_domains,
        CASE WHEN v_cap_domains < 0 THEN 0 ELSE GREATEST(v_cap_domains - v_base_domains, 0) END,
        1, v_price_domain,
        v_eff_domains, v_cap_domains, false),
      'campaigns', public._billing_pack_obj(
        r.activation_status, v_plan_key, 'campaigns',
        v_extra_campaigns,
        CASE WHEN v_cap_campaigns < 0 THEN 0 ELSE GREATEST(v_cap_campaigns - v_base_campaigns, 0) END,
        1, v_price_campaign,
        v_eff_campaigns, v_cap_campaigns, false)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.billing_state_for(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_state_for(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.billing_state_for(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.billing_state_for(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_state_for(uuid) TO postgres;

-- get_billing_state wrapper unchanged (calls billing_state_for)
CREATE OR REPLACE FUNCTION public.get_billing_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;
  RETURN public.billing_state_for(auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.get_billing_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_billing_state() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_billing_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_billing_state() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_billing_state() TO postgres;

COMMIT;
