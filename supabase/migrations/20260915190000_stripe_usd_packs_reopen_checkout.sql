-- Stripe USD packs + reopen checkout_available (not Cakto 3b).
-- Pack unit_price_cents match Stripe test catalog (licensed add-ons).

ALTER TABLE public.subscription_addons
  DROP CONSTRAINT IF EXISTS subscription_addons_addon_type_check;

ALTER TABLE public.subscription_addons
  ADD CONSTRAINT subscription_addons_addon_type_check
  CHECK (addon_type = ANY (ARRAY['extra_domain'::text, 'extra_campaign'::text, 'extra_clicks'::text]));

CREATE OR REPLACE FUNCTION public.billing_state_for(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_checkout_available boolean := true;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO r FROM public.profiles WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0001';
  END IF;

  v_is_bypass := (r.stripe_price_id IS NOT DISTINCT FROM 'admin_bypass');

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

  -- Spec 3 hard caps + USD pack prices (Stripe test catalog)
  CASE v_plan_key
    WHEN 'BASIC' THEN
      v_cap_clicks := 18000; v_cap_domains := 3; v_cap_campaigns := 5;
      v_unit_clicks := 5000; v_price_clicks := 1500;
      v_price_domain := 700; v_price_campaign := 500;
    WHEN 'PRO' THEN
      v_cap_clicks := 40000; v_cap_domains := 6; v_cap_campaigns := 12;
      v_unit_clicks := 10000; v_price_clicks := 2000;
      v_price_domain := 1000; v_price_campaign := 700;
    WHEN 'FREEDOM' THEN
      v_cap_clicks := 150000; v_cap_domains := 15; v_cap_campaigns := 30;
      v_unit_clicks := 25000; v_price_clicks := 4000;
      v_price_domain := 1500; v_price_campaign := 1000;
    WHEN 'ENTERPRISE' THEN
      v_cap_clicks := 400000; v_cap_domains := 25; v_cap_campaigns := -1;
      v_unit_clicks := 50000; v_price_clicks := 5000;
      v_price_domain := 2000; v_price_campaign := NULL;
    ELSE
      v_cap_clicks := 0; v_cap_domains := 0; v_cap_campaigns := 0;
      v_unit_clicks := 0; v_price_clicks := 0;
      v_price_domain := 0; v_price_campaign := 0;
      v_checkout_available := false;
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

  RETURN jsonb_build_object(
    'plan', jsonb_build_object(
      'name', r.plan_name,
      'key', v_plan_key,
      'activation_status', r.activation_status,
      'subscription_status', r.subscription_status,
      'billing_cycle_start', r.billing_cycle_start,
      'billing_cycle_end', r.billing_cycle_end,
      'is_admin_bypass', v_is_bypass,
      'checkout_available', v_checkout_available
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
        v_eff_clicks, v_cap_clicks, v_checkout_available),
      'domains', public._billing_pack_obj(
        r.activation_status, v_plan_key, 'domains',
        v_extra_domains,
        CASE WHEN v_cap_domains < 0 THEN 0 ELSE GREATEST(v_cap_domains - v_base_domains, 0) END,
        1, v_price_domain,
        v_eff_domains, v_cap_domains, v_checkout_available),
      'campaigns', public._billing_pack_obj(
        r.activation_status, v_plan_key, 'campaigns',
        v_extra_campaigns,
        CASE WHEN v_cap_campaigns < 0 THEN 0 ELSE GREATEST(v_cap_campaigns - v_base_campaigns, 0) END,
        1, v_price_campaign,
        v_eff_campaigns, v_cap_campaigns, v_checkout_available)
    )
  );
END;
$function$;
