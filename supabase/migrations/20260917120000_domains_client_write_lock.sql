-- =============================================================================
-- Domains: client write lock + DB limit (defense in depth)
-- =============================================================================
-- ACTIVE users could INSERT/UPDATE domains via PostgREST and set
-- is_verified=true, bypassing add-domain quota + Cloudflare DCV.
-- UI already uses edge functions only; revoke client writes.
-- Also: protect stripe_packs_subscription_id on profiles.
-- =============================================================================

BEGIN;

-- 1) Domains — SELECT only for authenticated/anon; mutations via service_role edges
REVOKE INSERT, UPDATE, DELETE ON TABLE public.domains FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.domains FROM anon;
GRANT SELECT ON TABLE public.domains TO authenticated;

-- Write policies no longer reachable for JWT clients; drop to avoid false sense of safety.
DROP POLICY IF EXISTS "Users can insert own domains when active" ON public.domains;
DROP POLICY IF EXISTS "Users can update own domains when active" ON public.domains;
DROP POLICY IF EXISTS "Users can delete own domains when active" ON public.domains;
-- Keep domains_select_own_or_admin

-- 2) Enforce domain quota on INSERT (service_role / edges still hit this)
CREATE OR REPLACE FUNCTION public.enforce_domain_limit()
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
  PERFORM pg_advisory_xact_lock(hashtext('domain_limit:' || NEW.user_id::text));

  SELECT p.max_domains INTO v_base
  FROM public.profiles p
  WHERE p.user_id = NEW.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'domain_limit_reached'
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
    AND addon_type = 'extra_domain';

  v_limit := v_base + v_extra;

  SELECT count(*)::integer INTO v_count
  FROM public.domains
  WHERE user_id = NEW.user_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'domain_limit_reached'
      USING ERRCODE = 'P0001',
      DETAIL = format('limit=%s current=%s', v_limit, v_count);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_domain_limit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_domain_limit() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_domain_limit() FROM authenticated;

DROP TRIGGER IF EXISTS trg_enforce_domain_limit ON public.domains;
CREATE TRIGGER trg_enforce_domain_limit
  BEFORE INSERT ON public.domains
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_domain_limit();

-- 3) Profiles — revert client writes to packs subscription pointer
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

  NEW.plan_name                     := OLD.plan_name;
  NEW.max_clicks                    := OLD.max_clicks;
  NEW.max_domains                   := OLD.max_domains;
  NEW.max_campaigns                 := OLD.max_campaigns;
  NEW.current_clicks                := OLD.current_clicks;
  NEW.subscription_status           := OLD.subscription_status;
  NEW.is_suspended                  := OLD.is_suspended;
  NEW.billing_cycle_start           := OLD.billing_cycle_start;
  NEW.billing_cycle_end             := OLD.billing_cycle_end;
  NEW.stripe_customer_id            := OLD.stripe_customer_id;
  NEW.stripe_subscription_id        := OLD.stripe_subscription_id;
  NEW.stripe_packs_subscription_id  := OLD.stripe_packs_subscription_id;
  NEW.stripe_price_id               := OLD.stripe_price_id;
  NEW.stripe_overage_item_id        := OLD.stripe_overage_item_id;
  NEW.is_deleted                    := OLD.is_deleted;
  NEW.deleted_at                    := OLD.deleted_at;

  RETURN NEW;
END;
$$;

-- 4) Hygiene: anon cannot probe workspace ACTIVE via EXECUTE
REVOKE EXECUTE ON FUNCTION public.is_workspace_active(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_workspace_active(uuid) FROM anon;
-- authenticated keeps EXECUTE so RLS policies on campaigns still work
GRANT EXECUTE ON FUNCTION public.is_workspace_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_active(uuid) TO service_role;

COMMIT;
