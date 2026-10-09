-- =============================================================================
-- B-P0-1: campaigns must have a domain
-- =============================================================================
-- The motor only serves a campaign when campaign.domain === request host, so a
-- campaign without domain is a dead link. The panel used to save it anyway and
-- hand out https://yourdomain.com/c/<hash>.
--
-- Rules:
--   INSERT with NULL/blank domain              -> domain_required
--   UPDATE clearing a domain that was set      -> domain_required
--   UPDATE of a legacy row already NULL->NULL  -> allowed (2 inactive rows in prod)
-- Everything else is unchanged from r9_normalize_scheme_case_insensitive.
--
-- Rollback: re-run the previous body (20260914200000 r8_r9 + r9 normalize).
-- =============================================================================

BEGIN;

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
    IF TG_OP = 'INSERT'
       OR (OLD.domain IS NOT NULL AND btrim(OLD.domain) <> '') THEN
      RAISE EXCEPTION 'domain_required'
        USING ERRCODE = 'P0001';
    END IF;
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

COMMIT;
