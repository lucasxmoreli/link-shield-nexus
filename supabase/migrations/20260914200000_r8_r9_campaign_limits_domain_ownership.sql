-- =============================================================================
-- R8/R9 — campaign limit + domain ownership enforced in DB
-- =============================================================================
-- Idempotent. When CLI arrives: migration repair --status applied 20260914200000
-- if this was already applied live.
--
-- Note: protect_privileged_profile_columns must allow current_user postgres
-- (migrations have no JWT). Otherwise UPDATEs to max_campaigns are silently
-- reverted during apply_migration.
-- =============================================================================

BEGIN;

-- Allow migrations (postgres) + service_role + admin to update privileged cols
CREATE OR REPLACE FUNCTION public.protect_privileged_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF coalesce(auth.jwt()->>'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  NEW.plan_name              := OLD.plan_name;
  NEW.max_clicks             := OLD.max_clicks;
  NEW.max_domains            := OLD.max_domains;
  NEW.max_campaigns          := OLD.max_campaigns;
  NEW.current_clicks         := OLD.current_clicks;
  NEW.subscription_status    := OLD.subscription_status;
  NEW.is_suspended           := OLD.is_suspended;
  NEW.billing_cycle_start    := OLD.billing_cycle_start;
  NEW.billing_cycle_end      := OLD.billing_cycle_end;
  NEW.stripe_customer_id     := OLD.stripe_customer_id;
  NEW.stripe_subscription_id := OLD.stripe_subscription_id;
  NEW.stripe_price_id        := OLD.stripe_price_id;
  NEW.stripe_overage_item_id := OLD.stripe_overage_item_id;
  NEW.is_deleted             := OLD.is_deleted;
  NEW.deleted_at             := OLD.deleted_at;

  RETURN NEW;
END;
$$;

-- 0) Blocker: admin_bypass ENTERPRISE stuck at max_campaigns = 0
UPDATE public.profiles
SET max_campaigns = -1
WHERE stripe_price_id = 'admin_bypass'
  AND COALESCE(max_campaigns, 0) = 0;

CREATE OR REPLACE FUNCTION public.admin_change_plan(
  p_user_id uuid,
  p_plan_name text,
  p_max_clicks integer,
  p_max_domains integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_max_campaigns integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_max_campaigns := CASE upper(p_plan_name)
    WHEN 'BASIC PLAN'          THEN 5
    WHEN 'PRO PLAN'            THEN 20
    WHEN 'FREEDOM PLAN'        THEN 50
    WHEN 'ENTERPRISE CONQUEST' THEN -1
    ELSE 0
  END;

  UPDATE public.profiles SET
    plan_name           = p_plan_name,
    max_clicks          = p_max_clicks,
    max_domains         = p_max_domains,
    max_campaigns       = v_max_campaigns,
    billing_cycle_start = now(),
    billing_cycle_end   = now() + interval '30 days',
    subscription_status = 'active',
    stripe_price_id     = CASE
      WHEN stripe_subscription_id IS NULL THEN 'admin_bypass'
      ELSE stripe_price_id
    END
  WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_change_plan(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_change_plan(uuid, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_change_plan(uuid, text, integer, integer) TO service_role;

-- 1) R8 — campaign limit
CREATE OR REPLACE FUNCTION public.enforce_campaign_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_base  integer;
  v_extra integer;
  v_limit integer;
  v_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('campaign_limit:' || NEW.user_id::text));

  SELECT p.max_campaigns INTO v_base
  FROM public.profiles p
  WHERE p.user_id = NEW.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'campaign_limit_reached'
      USING ERRCODE = 'P0001', DETAIL = 'profile_not_found';
  END IF;

  v_base := COALESCE(v_base, 0);

  IF v_base < 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(quantity), 0)::integer INTO v_extra
  FROM public.subscription_addons
  WHERE user_id = NEW.user_id
    AND status = 'active'
    AND addon_type = 'extra_campaign';

  v_limit := v_base + v_extra;

  SELECT count(*)::integer INTO v_count
  FROM public.campaigns
  WHERE user_id = NEW.user_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'campaign_limit_reached'
      USING ERRCODE = 'P0001',
      DETAIL = format('limit=%s current=%s', v_limit, v_count);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_campaign_limit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_campaign_limit() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_campaign_limit() FROM authenticated;

DROP TRIGGER IF EXISTS trg_enforce_campaign_limit ON public.campaigns;
CREATE TRIGGER trg_enforce_campaign_limit
  BEFORE INSERT ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_campaign_limit();

-- 2) R9 — domain ownership
CREATE OR REPLACE FUNCTION public.enforce_campaign_domain_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_host     text;
  v_verified boolean;
BEGIN
  IF NEW.domain IS NULL OR btrim(NEW.domain) = '' THEN
    NEW.domain := NULL;
    RETURN NEW;
  END IF;

  -- lower first so HTTPS:// / Http:// strip correctly
  v_host := regexp_replace(lower(btrim(NEW.domain)), '^https?://|/.*$', '', 'g');
  NEW.domain := v_host;

  IF TG_OP = 'UPDATE'
     AND NEW.domain IS NOT DISTINCT FROM lower(btrim(COALESCE(OLD.domain, ''))) THEN
    RETURN NEW;
  END IF;

  SELECT d.is_verified INTO v_verified
  FROM public.domains d
  WHERE d.user_id = NEW.user_id
    AND lower(btrim(d.url)) = v_host
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'domain_not_owned'
      USING ERRCODE = 'P0001', DETAIL = v_host;
  END IF;

  IF COALESCE(v_verified, false) = false THEN
    RAISE EXCEPTION 'domain_not_verified'
      USING ERRCODE = 'P0001', DETAIL = v_host;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_campaign_domain_ownership() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_campaign_domain_ownership() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_campaign_domain_ownership() FROM authenticated;

DROP TRIGGER IF EXISTS trg_enforce_campaign_domain_ownership ON public.campaigns;
CREATE TRIGGER trg_enforce_campaign_domain_ownership
  BEFORE INSERT OR UPDATE OF domain ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_campaign_domain_ownership();

COMMIT;
