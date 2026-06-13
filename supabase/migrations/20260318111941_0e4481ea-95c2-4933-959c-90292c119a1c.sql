
-- Add is_suspended column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;

-- Create admin aggregate functions (security definer, no RLS bypass needed)
CREATE OR REPLACE FUNCTION public.admin_get_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total_users integer;
  v_total_campaigns integer;
  v_monthly_clicks bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT count(*) INTO v_total_users FROM profiles;
  SELECT count(*) INTO v_total_campaigns FROM campaigns WHERE is_active = true;
  SELECT coalesce(sum(current_clicks), 0) INTO v_monthly_clicks FROM profiles;

  RETURN jsonb_build_object(
    'total_users', v_total_users,
    'active_campaigns', v_total_campaigns,
    'monthly_clicks', v_monthly_clicks
  );
END;
$$;

-- Create admin function to list all users with their campaign counts
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(
  user_id uuid,
  email text,
  plan_name text,
  current_clicks integer,
  max_clicks integer,
  is_suspended boolean,
  created_at timestamptz,
  campaign_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    p.user_id,
    p.email,
    p.plan_name,
    p.current_clicks,
    p.max_clicks,
    p.is_suspended,
    p.created_at,
    coalesce(c.cnt, 0) AS campaign_count
  FROM profiles p
  LEFT JOIN (
    SELECT campaigns.user_id AS uid, count(*) AS cnt
    FROM campaigns
    WHERE campaigns.is_active = true
    GROUP BY campaigns.user_id
  ) c ON c.uid = p.user_id
  ORDER BY p.created_at DESC;
END;
$$;

-- Create admin function to suspend/unsuspend a user
CREATE OR REPLACE FUNCTION public.admin_toggle_suspend(p_user_id uuid, p_suspend boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE profiles SET is_suspended = p_suspend WHERE user_id = p_user_id;

  -- If suspending, deactivate all their campaigns
  IF p_suspend THEN
    UPDATE campaigns SET is_active = false WHERE campaigns.user_id = p_user_id;
  END IF;
END;
$$;

-- Create admin function to change user plan
CREATE OR REPLACE FUNCTION public.admin_change_plan(p_user_id uuid, p_plan_name text, p_max_clicks integer, p_max_domains integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE profiles SET
    plan_name = p_plan_name,
    max_clicks = p_max_clicks,
    max_domains = p_max_domains,
    billing_cycle_start = now(),
    billing_cycle_end = now() + interval '30 days'
  WHERE user_id = p_user_id;
END;
$$;

-- Restrict these admin functions to authenticated only
REVOKE EXECUTE ON FUNCTION public.admin_get_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_stats() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_toggle_suspend(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_toggle_suspend(uuid, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_change_plan(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_change_plan(uuid, text, integer, integer) TO authenticated;
