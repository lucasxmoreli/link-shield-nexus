-- =============================================================================
-- Fatia 1 — billing_state_for + get_billing_state + backfill FREE
-- =============================================================================
-- A1: backfill sem ILIKE 'free%'; mapa hard_cap ENTERPRISE→FREEDOM→PRO→BASIC
-- A2: state ∈ ok | at_limit | over_limit; packs.reason at_cap separado
-- A3: billing_state_for(uuid) interna; get_billing_state() = wrapper auth.uid()
--
-- NÃO APLICAR até revisão read-only em prod. (aplicado em prod após aprovação)
--
-- Prod notes (subscription_addons) — NÃO alterar nesta fatia:
--   CHECK addon_type IN ('extra_domain','extra_campaign')
--     → SUM(extra_clicks) retorna 0 hoje (sem rows). Fatia 4 PRECISA:
--       ALTER … DROP CONSTRAINT subscription_addons_addon_type_check;
--       ADD CONSTRAINT … CHECK (addon_type IN
--         ('extra_domain','extra_campaign','extra_clicks'));
--   CHECK status IN ('active','cancelled') — grafia BRITÂNICA (dois L).
--     Nunca comparar com 'canceled' (Stripe/EUA) — quebra silencioso.
--   stripe_subscription_item_id e stripe_price_id são NOT NULL (+ UNIQUE no item).
--     Pack Cakto não terá Stripe IDs — Fatia 4: tornar NULLABLE (ou placeholder)
--     antes de inserir addon sem Stripe.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._billing_resource_state(
  p_used integer,
  p_effective integer
) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_effective IS NOT NULL AND p_effective < 0 THEN 'ok'
    WHEN p_used > COALESCE(p_effective, 0) THEN 'over_limit'
    WHEN p_used = COALESCE(p_effective, 0) THEN 'at_limit'
    ELSE 'ok'
  END;
$$;

CREATE OR REPLACE FUNCTION public._billing_resource_obj(
  p_base integer,
  p_pack_extra integer,
  p_effective integer,
  p_hard_cap integer,
  p_used integer
) RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'base', p_base,
    'pack_extra', p_pack_extra,
    'effective', p_effective,
    'hard_cap', p_hard_cap,
    'used', p_used,
    'state', public._billing_resource_state(p_used, p_effective)
  );
$$;

CREATE OR REPLACE FUNCTION public._billing_pack_obj(
  p_activation text,
  p_plan_key text,
  p_resource text,
  p_bought integer,
  p_max_per_cycle integer,
  p_unit_size integer,
  p_unit_price_cents integer,
  p_effective integer,
  p_hard_cap integer,
  p_checkout_available boolean
) RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_can boolean := false;
  v_reason text;
BEGIN
  IF p_resource = 'campaigns' AND p_effective IS NOT NULL AND p_effective < 0 THEN
    v_reason := 'unlimited';
  ELSIF p_activation IS DISTINCT FROM 'ACTIVE' OR p_plan_key = 'FREE' THEN
    v_reason := 'free_plan';
  ELSIF p_hard_cap IS NOT NULL AND p_hard_cap >= 0
        AND p_effective IS NOT NULL AND p_effective >= p_hard_cap THEN
    v_reason := 'at_cap';
  ELSIF p_resource = 'clicks' AND COALESCE(p_bought, 0) >= COALESCE(p_max_per_cycle, 0) THEN
    v_reason := 'cycle_quota';
  ELSIF COALESCE(p_checkout_available, false) IS NOT TRUE THEN
    v_reason := 'checkout_unavailable';
  ELSE
    v_can := true;
    v_reason := NULL;
  END IF;

  -- Fatia 1: checkout off → nunca can_buy=true
  IF COALESCE(p_checkout_available, false) IS NOT TRUE THEN
    v_can := false;
    IF v_reason IS NULL THEN
      v_reason := 'checkout_unavailable';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'bought_this_cycle', COALESCE(p_bought, 0),
    'max_per_cycle', COALESCE(p_max_per_cycle, 0),
    'unit_size', COALESCE(p_unit_size, 0),
    'unit_price_cents', p_unit_price_cents,
    'can_buy', v_can,
    'reason', v_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public._billing_resource_state(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._billing_resource_state(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public._billing_resource_state(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._billing_resource_state(integer, integer) TO postgres;
GRANT EXECUTE ON FUNCTION public._billing_resource_state(integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public._billing_resource_obj(integer, integer, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._billing_resource_obj(integer, integer, integer, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public._billing_resource_obj(integer, integer, integer, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._billing_resource_obj(integer, integer, integer, integer, integer) TO postgres;
GRANT EXECUTE ON FUNCTION public._billing_resource_obj(integer, integer, integer, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public._billing_pack_obj(text, text, text, integer, integer, integer, integer, integer, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._billing_pack_obj(text, text, text, integer, integer, integer, integer, integer, integer, boolean) FROM anon;
REVOKE ALL ON FUNCTION public._billing_pack_obj(text, text, text, integer, integer, integer, integer, integer, integer, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._billing_pack_obj(text, text, text, integer, integer, integer, integer, integer, integer, boolean) TO postgres;
GRANT EXECUTE ON FUNCTION public._billing_pack_obj(text, text, text, integer, integer, integer, integer, integer, integer, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- Internal: billing_state_for(user_id) — service_role / postgres only
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
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO r FROM public.profiles WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0001';
  END IF;

  v_is_bypass := (r.stripe_price_id IS NOT DISTINCT FROM 'admin_bypass');

  -- A1 match order
  v_plan_key := CASE
    WHEN upper(btrim(COALESCE(r.plan_name, ''))) LIKE '%ENTERPRISE%' THEN 'ENTERPRISE'
    WHEN upper(btrim(COALESCE(r.plan_name, ''))) LIKE '%FREEDOM%'    THEN 'FREEDOM'
    WHEN upper(btrim(COALESCE(r.plan_name, ''))) LIKE '%PRO%'        THEN 'PRO'
    WHEN upper(btrim(COALESCE(r.plan_name, ''))) LIKE '%BASIC%'      THEN 'BASIC'
    ELSE 'FREE'
  END;

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

  CASE v_plan_key
    WHEN 'BASIC' THEN
      v_cap_clicks := 18000; v_cap_domains := 3; v_cap_campaigns := 5;
      v_unit_clicks := 5000; v_price_clicks := 14700;
      v_price_domain := 6700; v_price_campaign := 4700;
    WHEN 'PRO' THEN
      v_cap_clicks := 40000; v_cap_domains := 6; v_cap_campaigns := 12;
      v_unit_clicks := 10000; v_price_clicks := 19700;
      v_price_domain := 9700; v_price_campaign := 6700;
    WHEN 'FREEDOM' THEN
      v_cap_clicks := 150000; v_cap_domains := 15; v_cap_campaigns := 30;
      v_unit_clicks := 25000; v_price_clicks := 39700;
      v_price_domain := 14700; v_price_campaign := 9700;
    WHEN 'ENTERPRISE' THEN
      v_cap_clicks := 400000; v_cap_domains := 25; v_cap_campaigns := -1;
      v_unit_clicks := 50000; v_price_clicks := 49700;
      v_price_domain := 19700; v_price_campaign := NULL;
    ELSE
      v_cap_clicks := 0; v_cap_domains := 0; v_cap_campaigns := 0;
      v_unit_clicks := 0; v_price_clicks := 0;
      v_price_domain := 0; v_price_campaign := 0;
  END CASE;

  -- pack_extra clicks = nº packs × unit_size (hoje 0)
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

  -- admin_bypass: hard_cap espelha effective (não força Spec 2)
  IF v_is_bypass THEN
    v_cap_clicks := v_eff_clicks;
    v_cap_domains := v_eff_domains;
    v_cap_campaigns := v_eff_campaigns;
  END IF;

  RETURN jsonb_build_object(
    'plan', jsonb_build_object(
      'name', r.plan_name,
      'key', v_plan_key,
      'activation_status', r.activation_status,
      'subscription_status', r.subscription_status,
      'billing_cycle_start', r.billing_cycle_start,
      'billing_cycle_end', r.billing_cycle_end,
      'is_admin_bypass', v_is_bypass,
      'checkout_available', false
    ),
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

-- ---------------------------------------------------------------------------
-- Authenticated wrapper
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- A1 backfill
-- ---------------------------------------------------------------------------
UPDATE public.profiles
SET plan_name = 'FREE'
WHERE upper(btrim(plan_name)) IN ('FREE', 'FREE PLAN')
  AND activation_status IS DISTINCT FROM 'ACTIVE'
  AND plan_name IS DISTINCT FROM 'FREE';

COMMIT;
