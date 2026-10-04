-- =============================================================================
-- Fix signup 500: handle_new_user + RLS after R2 dropped INSERT policy
-- =============================================================================
-- Auth wraps trigger failure as "Database error saving new user".
-- After REVOKE INSERT + DROP insert policy, the trigger must:
--   1) run SECURITY DEFINER as postgres (BYPASSRLS)
--   2) insert only columns that exist / have defaults
-- =============================================================================

ALTER TABLE public.profiles
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.profiles
  ALTER COLUMN postback_key SET DEFAULT gen_random_uuid();

ALTER TABLE public.profiles
  ALTER COLUMN is_deleted SET DEFAULT false;

ALTER TABLE public.profiles
  ALTER COLUMN max_campaigns SET DEFAULT 0;

ALTER TABLE public.profiles
  ALTER COLUMN plan_name SET DEFAULT 'FREE';

ALTER TABLE public.profiles
  ALTER COLUMN max_clicks SET DEFAULT 0;

ALTER TABLE public.profiles
  ALTER COLUMN max_domains SET DEFAULT 0;

ALTER TABLE public.profiles
  ALTER COLUMN current_clicks SET DEFAULT 0;

ALTER TABLE public.profiles
  ALTER COLUMN subscription_status SET DEFAULT 'incomplete';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    user_id,
    email,
    plan_name,
    max_clicks,
    max_domains,
    max_campaigns,
    current_clicks,
    subscription_status,
    stripe_price_id,
    is_deleted,
    is_suspended
  ) VALUES (
    NEW.id,
    lower(NEW.email),
    'FREE',
    0,
    0,
    0,
    0,
    'incomplete',
    NULL,
    false,
    false
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'handle_new_user failed for %: % (SQLSTATE %)',
      NEW.id, SQLERRM, SQLSTATE;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- Table privileges for roles that may touch profiles outside the app JWT
GRANT SELECT, INSERT, UPDATE ON public.profiles TO postgres;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO supabase_auth_admin;

-- Defense if FORCE RLS applies to a non-bypass role path
DROP POLICY IF EXISTS "profiles_insert_auth_admin" ON public.profiles;
CREATE POLICY "profiles_insert_auth_admin"
  ON public.profiles
  FOR INSERT
  TO supabase_auth_admin
  WITH CHECK (true);

DROP POLICY IF EXISTS "profiles_insert_service_role" ON public.profiles;
CREATE POLICY "profiles_insert_service_role"
  ON public.profiles
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Authenticated users must NOT insert their own profile (R2)
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Creates FREE/incomplete profile on signup. OWNER postgres + SECURITY DEFINER bypasses RLS.';
