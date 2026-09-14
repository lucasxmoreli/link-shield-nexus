-- =============================================================================
-- Sync prod fixes (2026-09-14): R2 grants + R3 trigger + signup FK (id=user_id)
-- =============================================================================
-- ALREADY APPLIED LIVE on project jhjympznbobcgdltnjfk (CloakGuard).
-- This file records that state in the repo so local history matches prod.
--
-- When Supabase CLI is available, BEFORE db pull / db push:
--
--   supabase link --project-ref jhjympznbobcgdltnjfk
--   supabase migration list
--   supabase migration repair --status applied 20260914120000
--   supabase db pull
--
-- Without `migration repair`, db pull/push can re-run or duplicate this diff
-- (e.g. UNIQUE profiles_user_id_key) and conflict with prod.
--
-- Full remaining drift (stripe_events, invoices, subscription_addons,
-- admin_audit_log, etc.) still needs `supabase db pull` after repair.
--
-- Idempotent: safe to re-run (CREATE OR REPLACE, DROP IF EXISTS, DO blocks).
-- =============================================================================

-- 1) Signup trigger: id must equal auth.users.id
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, user_id, email,
    plan_name, max_clicks, max_domains, max_campaigns, current_clicks,
    subscription_status, stripe_price_id, is_deleted, is_suspended
  ) VALUES (
    NEW.id, NEW.id, lower(NEW.email),
    'FREE', 0, 0, 0, 0,
    'incomplete', NULL, false, false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- No random default: missing id must fail hard, not invent a broken FK value
ALTER TABLE public.profiles ALTER COLUMN id DROP DEFAULT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_user_id_key'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- 2) R3: privileged-column guard + service_role/admin bypass
CREATE OR REPLACE FUNCTION public.protect_privileged_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
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

DROP TRIGGER IF EXISTS protect_profile_privileged_cols ON public.profiles;
CREATE TRIGGER protect_profile_privileged_cols
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_privileged_profile_columns();

-- 3) R2: authenticated cannot INSERT profiles; UPDATE only safe columns
REVOKE INSERT, UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (display_name, language) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- Auth admin / service_role insert paths (trigger + edges)
DROP POLICY IF EXISTS "profiles_insert_auth_admin" ON public.profiles;
CREATE POLICY "profiles_insert_auth_admin"
  ON public.profiles FOR INSERT TO supabase_auth_admin WITH CHECK (true);

DROP POLICY IF EXISTS "profiles_insert_service_role" ON public.profiles;
CREATE POLICY "profiles_insert_service_role"
  ON public.profiles FOR INSERT TO service_role WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO postgres;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO supabase_auth_admin;
