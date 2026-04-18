// ───────────────────────────────────────────────────────────────────────
// Macro & Bot Signature Filter — Trava nº 10 do Motor CloakerX
//
// Problema: O robô de auditoria do TikTok (e equivalentes Meta/Google)
// dispara a URL crua do anúncio com os placeholders não substituídos
// (ex: __CALLBACK_PARAM__, {{ad.id}}). O strict_mode antigo só checava
// presença do parâmetro, então aprovava. Esta camada bloqueia esses
// casos antes da aprovação final.
//
// Regras:
//   1) Se QUALQUER query param contiver um literal de macro → BLOCK.
//      Motivo: "bot_macro_detected"
//   2) Se o User-Agent bater em assinatura de infra de ads → BLOCK.
//      Motivo: "bot_ua_signature"
//
// Design: funções puras, sem side effects. Chame antes de aprovar.
// Performance: O(n) no nº de params + 1 regex test no UA. Nada de LRU.
// ───────────────────────────────────────────────────────────────────────

// ── 1. Padrões de macros não substituídas ───────────────────────────────
// Cobre os principais formatos usados pelas plataformas de ads:
//   __WORD__          (TikTok, Kwai)                  ex: __CALLBACK_PARAM__
//   __WORD|__WORD__   (TikTok valor composto)         ex: __CID_NAME__|__CID__
//   {{word}}          (Meta / Facebook)               ex: {{ad.id}}
//   {{word.word}}     (Meta dotted)                   ex: {{campaign.id}}
//   {word}            (Google Ads ValueTrack, Taboola) ex: {campaignid}
//
// Nota: o regex precisa ser "loose" o bastante pra pegar variações óbvias
// (ex: __callbackparam__, {{Ad.Id}}) sem falso-positivo em dados reais.
const MACRO_PATTERNS: RegExp[] = [
  // __WORD__ com pelo menos 3 chars dentro (evita casar "__" puro)
  /__[A-Z0-9_]{3,}__/i,
  // {{ word }} ou {{ word.word }}  (aceita espaço interno)
  /\{\{\s*[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*\s*\}\}/i,
  // { word } — só casa se for o VALOR inteiro entre chaves simples,
  // pra não pegar JSON legítimo em strings livres
  /^\{[a-z][a-z0-9_]*\}$/i,
];

// Lista de keys onde macro nunca deveria aparecer. Serve como fast-path
// (checagem prioritária) — mas o filtro roda em TODOS os params.
const SUSPECT_PARAM_KEYS = new Set([
  "ttclid",
  "fbclid",
  "gclid",
  "click_id",
  "clickid",
  "ad_id",
  "adid",
  "ad_name",
  "adset_id",
  "adset_name",
  "campaign_id",
  "campaign_name",
  "placement",
  "cost",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
]);

// ── 2. Assinaturas de UA de infraestrutura de ads / auditoria ──────────
// Substring match case-insensitive. Mantenha esta lista em sync com
// findings da auditoria forense — adicione novas assinaturas conforme
// aparecerem em requests_log.
const BOT_UA_SIGNATURES: string[] = [
  "thirdlandingpagefeinfra", // TikTok ad audit
  "byteplus",                // TikTok infra
  "bytespider",              // ByteDance crawler
  "adsbot-",                 // Google ad audit
  "ads-google",
  "facebookcatalog",         // Meta catalog scraper
  // Automação genérica (não são crawlers legítimos como Googlebot/FB preview)
  "headlesschrome",
  "phantomjs",
  "selenium",
  "playwright",
  "puppeteer",
  "python-requests",
  "go-http-client",
  "node-fetch",
];

// ── 3. Resultado tipado ────────────────────────────────────────────────
export type FilterResult =
  | { blocked: false }
  | { blocked: true; reason: "bot_macro_detected" | "bot_ua_signature"; detail: string };

// ── 4. Funções puras ───────────────────────────────────────────────────

/**
 * Verifica se um valor de param contém um literal de macro não substituído.
 * Retorna o padrão que casou (pra log) ou null.
 */
function matchMacro(value: string): string | null {
  if (!value || typeof value !== "string") return null;
  for (const pattern of MACRO_PATTERNS) {
    if (pattern.test(value)) return pattern.source;
  }
  return null;
}

/**
 * Varre todos os query params e bloqueia se qualquer um contiver macro.
 * Prioriza SUSPECT_PARAM_KEYS no log (motivo mais informativo), mas
 * bloqueia igual em qualquer key — bot pode vazar macro em qualquer param.
 */
export function checkMacros(query: Record<string, string | string[] | undefined>): FilterResult {
  // Primeiro passo: keys suspeitas (log mais detalhado)
  for (const key of Object.keys(query)) {
    const raw = query[key];
    const values = Array.isArray(raw) ? raw : [raw ?? ""];
    for (const value of values) {
      const hit = matchMacro(value);
      if (hit) {
        return {
          blocked: true,
          reason: "bot_macro_detected",
          detail: `param=${key} value=${value.slice(0, 80)} pattern=${hit}`,
        };
      }
    }
  }
  return { blocked: false };
}

/**
 * Verifica se o User-Agent bate em assinatura conhecida de infra de ads.
 */
export function checkUserAgentSignature(userAgent: string | undefined | null): FilterResult {
  if (!userAgent) return { blocked: false };
  const ua = userAgent.toLowerCase();
  for (const signature of BOT_UA_SIGNATURES) {
    if (ua.includes(signature)) {
      return {
        blocked: true,
        reason: "bot_ua_signature",
        detail: `signature=${signature}`,
      };
    }
  }
  return { blocked: false };
}

/**
 * Entrypoint único do filtro. Retorna o primeiro bloqueio encontrado.
 * Ordem: UA (O(1)) → Macros (O(n)) — UA é mais barato, checa primeiro.
 */
export function runBotSignatureFilter(input: {
  userAgent: string | undefined | null;
  query: Record<string, string | string[] | undefined>;
}): FilterResult {
  const uaResult = checkUserAgentSignature(input.userAgent);
  if (uaResult.blocked) return uaResult;

  const macroResult = checkMacros(input.query);
  if (macroResult.blocked) return macroResult;

  return { blocked: false };
}
