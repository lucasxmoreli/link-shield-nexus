-- =============================================================================
-- Fatia 1A — Workspace write gate (fail-closed)
-- =============================================================================
-- Goal: INVITED / unpaid / suspended / soft-deleted users can READ their own
-- rows but cannot INSERT/UPDATE/DELETE campaigns or domains via the
-- authenticated role. Paying + admin_bypass workspaces stay ACTIVE.
--
-- Does NOT change: activation_status generated column, invite flow, Cakto,
-- plan prices, motor. Companion: add-domain edge must also check ACTIVE
-- (service_role bypasses RLS).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Helper: single source of truth for write eligibility
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_workspace_active(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = p_user_id
      AND p.activation_status = 'ACTIVE'
      AND COALESCE(p.is_suspended, false) = false
      AND COALESCE(p.is_deleted, false) = false
  );
$$;

REVOKE ALL ON FUNCTION public.is_workspace_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_workspace_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_active(uuid) TO service_role;

COMMENT ON FUNCTION public.is_workspace_active(uuid) IS
  '1A write gate. ACTIVE + not suspended + not soft-deleted. Used by RLS on campaigns/domains.';

-- ---------------------------------------------------------------------------
-- 2) Safe defaults for new profiles (and any insert that omits columns)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ALTER COLUMN plan_name SET DEFAULT 'FREE',
  ALTER COLUMN max_clicks SET DEFAULT 0,
  ALTER COLUMN max_domains SET DEFAULT 0,
  ALTER COLUMN current_clicks SET DEFAULT 0,
  ALTER COLUMN subscription_status SET DEFAULT 'incomplete';

-- Ensure columns used by gate / handle_new_user exist (may lag in types.ts)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS max_campaigns integer DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_price_id text;

ALTER TABLE public.profiles
  ALTER COLUMN max_campaigns SET DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 3) handle_new_user — explicit FREE / incomplete / zeros / no payment ref
-- ---------------------------------------------------------------------------
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
    stripe_price_id
  ) VALUES (
    NEW.id,
    NEW.email,
    'FREE',
    0,
    0,
    0,
    0,
    'incomplete',
    NULL
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Creates FREE profile with subscription_status=incomplete so activation_status=INVITED.';

-- ---------------------------------------------------------------------------
-- 4) Backfill: Free rows that look "active" but never paid
--    Never touches rows with stripe_price_id (paid or admin_bypass).
-- ---------------------------------------------------------------------------
UPDATE public.profiles
SET
  subscription_status = 'incomplete',
  plan_name = CASE
    WHEN plan_name IS NULL OR btrim(plan_name) = '' THEN 'FREE'
    WHEN lower(plan_name) IN ('free', 'free plan') THEN 'FREE'
    ELSE plan_name
  END,
  max_clicks = 0,
  max_domains = 0,
  max_campaigns = 0,
  current_clicks = COALESCE(current_clicks, 0)
WHERE stripe_price_id IS NULL
  AND COALESCE(subscription_status, '') IN ('active', 'trialing', '')
  AND COALESCE(is_deleted, false) = false;

-- ---------------------------------------------------------------------------
-- 5) RLS campaigns — write only when workspace is ACTIVE
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can update own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can delete own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can insert own campaigns when active" ON public.campaigns;
DROP POLICY IF EXISTS "Users can update own campaigns when active" ON public.campaigns;
DROP POLICY IF EXISTS "Users can delete own campaigns when active" ON public.campaigns;

CREATE POLICY "Users can insert own campaigns when active"
ON public.campaigns
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND public.is_workspace_active(auth.uid())
);

CREATE POLICY "Users can update own campaigns when active"
ON public.campaigns
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  AND public.is_workspace_active(auth.uid())
)
WITH CHECK (
  auth.uid() = user_id
  AND public.is_workspace_active(auth.uid())
);

CREATE POLICY "Users can delete own campaigns when active"
ON public.campaigns
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  AND public.is_workspace_active(auth.uid())
);

-- ---------------------------------------------------------------------------
-- 6) RLS domains — write only when workspace is ACTIVE
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert own domains" ON public.domains;
DROP POLICY IF EXISTS "Users can update own domains" ON public.domains;
DROP POLICY IF EXISTS "Users can delete own domains" ON public.domains;
DROP POLICY IF EXISTS "Users can insert own domains when active" ON public.domains;
DROP POLICY IF EXISTS "Users can update own domains when active" ON public.domains;
DROP POLICY IF EXISTS "Users can delete own domains when active" ON public.domains;

CREATE POLICY "Users can insert own domains when active"
ON public.domains
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND public.is_workspace_active(auth.uid())
);

CREATE POLICY "Users can update own domains when active"
ON public.domains
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  AND public.is_workspace_active(auth.uid())
)
WITH CHECK (
  auth.uid() = user_id
  AND public.is_workspace_active(auth.uid())
);

CREATE POLICY "Users can delete own domains when active"
ON public.domains
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  AND public.is_workspace_active(auth.uid())
);
