
DROP FUNCTION IF EXISTS public.admin_list_users();

CREATE OR REPLACE FUNCTION public.admin_list_users()
 RETURNS TABLE(user_id uuid, email text, plan_name text, current_clicks integer, max_clicks integer, is_suspended boolean, created_at timestamp with time zone, campaign_count bigint, domain_count bigint, billing_cycle_end timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    coalesce(c.cnt, 0) AS campaign_count,
    coalesce(d.cnt, 0) AS domain_count,
    p.billing_cycle_end
  FROM profiles p
  LEFT JOIN (
    SELECT campaigns.user_id AS uid, count(*) AS cnt
    FROM campaigns
    WHERE campaigns.is_active = true
    GROUP BY campaigns.user_id
  ) c ON c.uid = p.user_id
  LEFT JOIN (
    SELECT domains.user_id AS uid, count(*) AS cnt
    FROM domains
    GROUP BY domains.user_id
  ) d ON d.uid = p.user_id
  ORDER BY p.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reset_billing(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE profiles SET
    current_clicks = 0,
    billing_cycle_start = now(),
    billing_cycle_end = now() + interval '30 days'
  WHERE user_id = p_user_id;
END;
$function$;
