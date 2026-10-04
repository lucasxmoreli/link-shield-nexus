-- =============================================================================
-- Fix: "Database error saving new user" on Auth signUp
-- =============================================================================
-- Cause: handle_new_user INSERT fails (NOT NULL without default, missing
-- column, or RLS/permission edge). Auth wraps any trigger failure as
-- unexpected_failure / Database error saving new user.
-- =============================================================================

-- Root cause of signup 500: profiles.id lost DEFAULT gen_random_uuid().
-- handle_new_user does not supply id → NOT NULL violation → Auth wraps as
-- "Database error saving new user".
ALTER TABLE public.profiles
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Soft-delete / language columns must never block INSERT
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ALTER COLUMN is_deleted SET DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';

ALTER TABLE public.profiles
  ALTER COLUMN language SET DEFAULT 'en';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ALTER COLUMN is_suspended SET DEFAULT false;

-- Ensure 1A columns exist (idempotent)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS max_campaigns integer DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_price_id text;

ALTER TABLE public.profiles
  ALTER COLUMN plan_name SET DEFAULT 'FREE';

ALTER TABLE public.profiles
  ALTER COLUMN max_clicks SET DEFAULT 0;

ALTER TABLE public.profiles
  ALTER COLUMN max_domains SET DEFAULT 0;

ALTER TABLE public.profiles
  ALTER COLUMN max_campaigns SET DEFAULT 0;

ALTER TABLE public.profiles
  ALTER COLUMN current_clicks SET DEFAULT 0;

ALTER TABLE public.profiles
  ALTER COLUMN subscription_status SET DEFAULT 'incomplete';

-- Minimal, resilient trigger: only required identity + rely on column defaults.
-- Explicit zeros / FREE / incomplete keep INVITED even if someone changes defaults.
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
    is_suspended,
    language
  ) VALUES (
    NEW.id,
    NEW.email,
    'FREE',
    0,
    0,
    0,
    0,
    'incomplete',
    NULL,
    false,
    false,
    'en'
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'handle_new_user failed for %: % (SQLSTATE %)',
      NEW.id, SQLERRM, SQLSTATE;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Creates FREE/incomplete profile (INVITED). Hardened for open signup.';

-- Auth admin must be able to execute the trigger function
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
