DROP VIEW IF EXISTS public.dashboard_analytics_view;
CREATE VIEW public.dashboard_analytics_view AS
SELECT
  r.id,
  r.user_id,
  r.campaign_id,
  r.action_taken,
  r.created_at,
  r.ip_address,
  r.country_code,
  r.device_type,
  r.block_reason,
  r.risk_score,
  r.source_platform,
  r.campaign_name_platform,
  r.cost,
  r.click_id,
  r.is_unique,
  r.user_agent,
  c.name AS campaign_name,
  CASE
    WHEN r.action_taken = 'offer_page'::action_taken THEN 'Aprovado'::text
    ELSE 'Bloqueado'::text
  END AS status_final,
  CASE
    WHEN r.action_taken = 'offer_page'::action_taken THEN NULL::text
    WHEN r.block_reason IS NOT NULL AND r.block_reason <> ''::text THEN r.block_reason
    WHEN r.action_taken = 'safe_page'::action_taken THEN 'Fantasma / Orgânico'::text
    ELSE 'Bot Genérico'::text
  END AS motivo_limpo,
  r.is_conversion,
  r.revenue
FROM requests_log r
LEFT JOIN campaigns c ON c.id = r.campaign_id;