
-- View: dashboard_analytics_view
CREATE OR REPLACE VIEW public.dashboard_analytics_view AS
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
    WHEN r.action_taken = 'offer_page' THEN 'Aprovado'
    ELSE 'Bloqueado'
  END AS status_final,
  CASE
    WHEN r.action_taken = 'offer_page' THEN NULL
    WHEN r.block_reason IS NOT NULL AND r.block_reason != '' THEN r.block_reason
    WHEN r.action_taken = 'safe_page' THEN 'Fantasma / Orgânico'
    ELSE 'Bot Genérico'
  END AS motivo_limpo
FROM public.requests_log r
LEFT JOIN public.campaigns c ON c.id = r.campaign_id;

-- RPC: get_block_reasons_summary
CREATE OR REPLACE FUNCTION public.get_block_reasons_summary(p_campaign_id uuid DEFAULT NULL)
RETURNS TABLE(motivo text, total bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(
      CASE
        WHEN r.block_reason IS NOT NULL AND r.block_reason != '' THEN r.block_reason
        WHEN r.action_taken = 'safe_page' THEN 'Fantasma / Orgânico'
        ELSE 'Bot Genérico'
      END,
      'Desconhecido'
    ) AS motivo,
    count(*) AS total
  FROM public.requests_log r
  WHERE r.action_taken IN ('bot_blocked', 'safe_page')
    AND (p_campaign_id IS NULL OR r.campaign_id = p_campaign_id)
  GROUP BY motivo
  ORDER BY total DESC;
$$;
