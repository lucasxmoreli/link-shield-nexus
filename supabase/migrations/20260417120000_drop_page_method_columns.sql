-- Descontinuação da feature "Masking" (content_fetch).
-- O engine de roteamento passa a operar EXCLUSIVAMENTE via Redirect 302.
-- As colunas safe_page_method / offer_page_method deixam de ter uso.
--
-- ⚠️ Antes de aplicar em produção, garanta que o engine de clique externo
-- (Cloudflare Worker / backend de redirecionamento) já foi atualizado
-- para NÃO ler mais essas colunas. Caso contrário, ele vai quebrar.

ALTER TABLE public.campaigns
  DROP COLUMN IF EXISTS safe_page_method,
  DROP COLUMN IF EXISTS offer_page_method;
