import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ═══════════════════════════════════════════════════════════════
// LAYER 1 — GLOBAL BOT DETECTION (catches everything first)
// ═══════════════════════════════════════════════════════════════
const GLOBAL_BOT_REGEX = new RegExp(
  [
    "bot\\b", "crawler", "spider", "scraper", "slurp",
    "headlesschrome", "phantomjs", "puppeteer", "selenium", "playwright",
    "webdriver", "electron", "nightmare",
    "googlebot", "google-inspectiontool", "adsbot-google", "mediapartners-google",
    "bingbot", "yandexbot", "baiduspider", "duckduckbot", "sogou", "exabot",
    "facebookexternalhit", "facebot",
    "bytespider", "twitterbot", "linkedinbot", "pinterestbot",
    "snapchat", "snapbot",
    "semrushbot", "ahrefsbot", "mj12bot", "dotbot", "rogerbot", "screaming frog",
    "majestic", "megaindex", "blexbot",
    "ia_archiver", "archive\\.org_bot",
    "curl\\/", "wget\\/", "httpie", "python-requests", "python-urllib",
    "go-http-client", "java\\/", "libwww", "lwp-trivial", "okhttp",
    "axios", "node-fetch", "undici", "got\\/", "superagent",
  ].join("|"),
  "i",
);

// ═══════════════════════════════════════════════════════════════
// LAYER 2 — DATACENTER / HOSTING ASN KEYWORDS
// ═══════════════════════════════════════════════════════════════
const BLOCKED_ORGS = [
  "amazon", "google cloud", "google llc", "facebook", "meta platforms",
  "bytedance", "tiktok", "datacenter", "data center", "hosting",
  "microsoft azure", "microsoft corporation", "digitalocean", "ovh",
  "hetzner", "linode", "vultr", "cloudflare", "oracle cloud",
  "alibaba cloud", "tencent cloud", "scaleway", "kamatera",
  "contabo", "leaseweb", "rackspace", "softlayer",
];

// ═══════════════════════════════════════════════════════════════
// LAYER 3 — SOURCE-SPECIFIC HEURISTIC FUNCTIONS
// ═══════════════════════════════════════════════════════════════

interface HeuristicResult {
  block: boolean;
  suspicious: boolean;
  reason: string;
}

const PASS: HeuristicResult = { block: false, suspicious: false, reason: "" };

function checkFacebook(ua: string, params: Record<string, string>, referer: string | null): HeuristicResult {
  if (/facebookexternalhit|facebot|facebook.*crawler/i.test(ua)) {
    return { block: true, suspicious: false, reason: "fb_review_bot" };
  }
  const hasFbclid = !!params.fbclid;
  const hasFbReferer = referer ? /facebook\.com|fb\.com|fbcdn\.net/i.test(referer) : false;
  if (!hasFbclid && !hasFbReferer) {
    return { block: false, suspicious: true, reason: "fb_no_click_id" };
  }
  return PASS;
}

function checkInstagram(ua: string, params: Record<string, string>, referer: string | null): HeuristicResult {
  if (/facebookexternalhit|facebot/i.test(ua)) {
    return { block: true, suspicious: false, reason: "ig_meta_bot" };
  }
  const hasIgshid = !!params.igshid;
  const hasFbclid = !!params.fbclid;
  const hasIgReferer = referer ? /instagram\.com|cdninstagram\.com/i.test(referer) : false;
  if (!hasIgshid && !hasFbclid && !hasIgReferer) {
    return { block: false, suspicious: true, reason: "ig_no_click_id" };
  }
  return PASS;
}

function checkTikTok(ua: string, deviceType: string, params: Record<string, string>): HeuristicResult {
  if (/bytespider/i.test(ua)) {
    return { block: true, suspicious: false, reason: "tiktok_bytespider" };
  }
  const tiktokSignals = ["bytelocale", "trill", "tiktok", "musical_ly", "bytedance", "tt_webid"];
  const hasTikTokUA = tiktokSignals.some((s) => ua.includes(s));
  const hasTtclid = !!params.ttclid;
  if (deviceType === "desktop" && !hasTikTokUA) {
    return { block: true, suspicious: false, reason: "tiktok_desktop_no_app" };
  }
  if (!hasTikTokUA && !hasTtclid) {
    return { block: false, suspicious: true, reason: "tiktok_no_signature" };
  }
  return PASS;
}

function checkGoogle(ua: string, params: Record<string, string>): HeuristicResult {
  if (/adsbot-google|mediapartners-google|google-inspectiontool|google-adwords/i.test(ua)) {
    return { block: true, suspicious: false, reason: "google_review_bot" };
  }
  if (!params.gclid && !params.wbraid && !params.gbraid) {
    return { block: false, suspicious: true, reason: "google_no_click_id" };
  }
  return PASS;
}

function checkYouTube(ua: string, params: Record<string, string>): HeuristicResult {
  if (/adsbot-google|mediapartners-google|google-inspectiontool/i.test(ua)) {
    return { block: true, suspicious: false, reason: "youtube_google_bot" };
  }
  if (!params.gclid && !params.wbraid) {
    return { block: false, suspicious: true, reason: "youtube_no_click_id" };
  }
  return PASS;
}

function checkTwitter(ua: string, params: Record<string, string>): HeuristicResult {
  if (/twitterbot/i.test(ua)) {
    return { block: true, suspicious: false, reason: "twitter_bot" };
  }
  if (!params.twclid) {
    return { block: false, suspicious: true, reason: "twitter_no_click_id" };
  }
  return PASS;
}

function checkPinterest(ua: string, params: Record<string, string>): HeuristicResult {
  if (/pinterestbot|pinterest.*crawler/i.test(ua)) {
    return { block: true, suspicious: false, reason: "pinterest_bot" };
  }
  if (!params.epik) {
    return { block: false, suspicious: true, reason: "pinterest_no_click_id" };
  }
  return PASS;
}

function checkLinkedIn(ua: string, params: Record<string, string>): HeuristicResult {
  if (/linkedinbot/i.test(ua)) {
    return { block: true, suspicious: false, reason: "linkedin_bot" };
  }
  if (!params.li_fat_id) {
    return { block: false, suspicious: true, reason: "linkedin_no_click_id" };
  }
  return PASS;
}

function checkSnapchat(ua: string, params: Record<string, string>, referer: string | null): HeuristicResult {
  if (/snapchat|snapbot/i.test(ua)) {
    return { block: true, suspicious: false, reason: "snapchat_bot" };
  }
  const hasScCid = !!params.ScCid || !!params.sccid;
  const hasSnapReferer = referer ? /snapchat\.com/i.test(referer) : false;
  // Improved: require click ID OR snapchat referer
  if (!hasScCid && !hasSnapReferer) {
    return { block: false, suspicious: true, reason: "snapchat_no_click_id" };
  }
  return PASS;
}

function checkKwai(ua: string, params: Record<string, string>, referer: string | null): HeuristicResult {
  if (/kwaibot|kwaicrawler/i.test(ua)) {
    return { block: true, suspicious: false, reason: "kwai_bot" };
  }
  const hasKwaiReferer = referer ? /kwai\.com|ksweb/i.test(referer) : false;
  const hasDid = !!params.did; // Kwai device ID
  // Improved: require referer OR device ID
  if (!hasKwaiReferer && !hasDid) {
    return { block: false, suspicious: true, reason: "kwai_no_referer_no_did" };
  }
  return PASS;
}

// ═══════════════════════════════════════════════════════════════
// RATE LIMITER — In-memory sliding window (20 req / 10s per IP)
// ═══════════════════════════════════════════════════════════════
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 10_000;
const ipHits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = ipHits.get(ip) || [];
  const recent = hits.filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  ipHits.set(ip, recent);
  if (ipHits.size > 10_000) {
    for (const [key, val] of ipHits) {
      if (val.every((t) => now - t >= RATE_WINDOW_MS)) ipHits.delete(key);
    }
  }
  return recent.length > RATE_LIMIT;
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════
// URL HEALTH CHECK — Verify offer page is reachable (2s timeout)
// ═══════════════════════════════════════════════════════════════
function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function redirectResponse(targetUrl: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      Location: targetUrl,
      "Cache-Control": "no-store",
    },
  });
}

// ═══════════════════════════════════════════════════════════════
// TRANSPARENT CONTENT FETCH — Proxy HTML with rewritten paths
// ═══════════════════════════════════════════════════════════════

const MAINTENANCE_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page Under Maintenance</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8f9fa;color:#333}main{text-align:center;padding:2rem;max-width:480px}h1{font-size:1.5rem;margin-bottom:.75rem}p{font-size:.95rem;color:#666;line-height:1.6}</style></head><body><main><h1>🔧 Under Maintenance</h1><p>This page is temporarily unavailable. We are performing scheduled maintenance to improve your experience. Please check back shortly.</p><p style="margin-top:1.5rem;font-size:.8rem;color:#999">If you believe this is an error, please contact support.</p></main></body></html>`;

function rewriteRelativeUrls(html: string, baseUrl: string): string {
  const base = new URL(baseUrl);
  const origin = base.origin;
  const basePath = base.pathname.replace(/\/[^/]*$/, "/");

  // Rewrite src="/ href='/ action="/ etc. (double quotes, single quotes)
  html = html.replace(/((?:src|href|action|poster|data|srcset)\s*=\s*)(["'])\/(?!\/)/gi, `$1$2${origin}/`);

  // Rewrite relative paths (no protocol, no leading slash, no fragment/data/js/mailto)
  html = html.replace(
    /((?:src|href|action|poster|data)\s*=\s*)(["'])(?!https?:\/\/|\/\/|\/|#|data:|javascript:|mailto:|blob:)([^"'>\s]+)/gi,
    `$1$2${origin}${basePath}$3`,
  );

  // Rewrite unquoted attributes: src=/path or href=/path
  html = html.replace(/((?:src|href|action)\s*=\s*)\/(?!\/|["'])/gi, `$1${origin}/`);

  // Rewrite url() in inline styles — handles url('/path'), url("/path"), url(/path)
  html = html.replace(/(url\(\s*)(["']?)\/(?!\/)/gi, `$1$2${origin}/`);
  html = html.replace(
    /(url\(\s*)(["']?)(?!https?:\/\/|\/\/|\/|data:|blob:)([^"')>\s]+)/gi,
    `$1$2${origin}${basePath}$3`,
  );

  // Rewrite @import "/path" or @import '/path'
  html = html.replace(/(@import\s*)(["'])\/(?!\/)/gi, `$1$2${origin}/`);

  // Add <base> tag if not present
  if (!/<base\s/i.test(html)) {
    html = html.replace(/(<head[^>]*>)/i, `$1<base href="${origin}${basePath}">`);
  }

  return html;
}

async function contentFetchResponse(
  targetUrl: string,
  clientUA: string,
  clientLang: string | null,
  campaignDomain?: string,
): Promise<Response> {
  // Same-domain loop prevention
  if (campaignDomain) {
    const cleanCampaignDomain = campaignDomain.replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/+$/, "");
    try {
      const parsed = new URL(targetUrl);
      const targetHost = parsed.hostname.replace(/^www\./, "");
      if (targetHost === cleanCampaignDomain || targetHost.endsWith(`.${cleanCampaignDomain}`)) {
        if (parsed.pathname === "/" || /^\/c(\/|$)/i.test(parsed.pathname)) {
          console.warn(`[CONTENT-FETCH] Same-domain loop for ${targetUrl}, serving maintenance`);
          return new Response(MAINTENANCE_HTML, {
            headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
          });
        }
      }
    } catch { /* continue */ }
  }

  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent": clientUA || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": clientLang || "en-US,en;q=0.5",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(4000),
    });

    // 4xx/5xx → serve maintenance page
    if (res.status >= 400) {
      console.error(`[CONTENT-FETCH] Destination returned ${res.status} for ${targetUrl}`);
      await res.text(); // consume body
      return new Response(MAINTENANCE_HTML, {
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    const contentType = res.headers.get("content-type") || "text/html";

    // Build forwarded headers
    const fwdHeaders: Record<string, string> = {
      ...corsHeaders,
      "Cache-Control": "no-store",
    };
    // Forward critical headers from destination
    for (const h of ["content-type", "set-cookie", "content-language", "x-frame-options"]) {
      const val = res.headers.get(h);
      if (val) fwdHeaders[h] = val;
    }

    // Non-HTML → stream directly with forwarded headers
    if (!contentType.includes("text/html")) {
      return new Response(res.body, { headers: fwdHeaders });
    }

    let html = await res.text();
    html = rewriteRelativeUrls(html, targetUrl);

    fwdHeaders["Content-Type"] = "text/html; charset=utf-8";

    return new Response(html, { headers: fwdHeaders });
  } catch (err) {
    console.error(`[CONTENT-FETCH] Failed for ${targetUrl}:`, err);
    return new Response(MAINTENANCE_HTML, {
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}

function sanitizeRedirectUrl(url: string | null | undefined, safeFallback: string): string {
  const fallback = safeFallback || "https://google.com";
  const rawValue = (url || "").trim();

  if (!rawValue) {
    return fallback;
  }

  const cleanedValue = rawValue.replace(/^\/+/, "");
  const absoluteUrl = /^https?:\/\//i.test(cleanedValue)
    ? cleanedValue
    : `https://${cleanedValue}`;

  try {
    const parsedUrl = new URL(absoluteUrl);

    if (!/^https?:$/i.test(parsedUrl.protocol)) {
      console.error(`[INVALID-URL] Unsupported protocol in redirect URL "${absoluteUrl}"`);
      return fallback;
    }

    if (/^\/c(\/|$)/i.test(parsedUrl.pathname)) {
      console.error(`[LOOP-GUARD] Redirect URL "${absoluteUrl}" contains a cloaker path — aborting to safe page`);
      return fallback;
    }

    return parsedUrl.toString();
  } catch {
    console.error(`[INVALID-URL] "${absoluteUrl}" is not a valid absolute URL — falling back to safe page`);
    return fallback;
  }
}

async function checkUrlHealth(url: string, timeoutMs = 2000): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    return res.status < 400;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestUrl = new URL(req.url);
  const responseMode = req.method === "GET" ? "redirect" : "json";

  if (!["GET", "POST"].includes(req.method)) {
    return jsonResponse({ action: "safe_page", reason: "method_not_allowed" }, 405);
  }

  // Cloudflare-aware IP detection: cf-connecting-ip > x-forwarded-for > x-real-ip
  const cfIp = req.headers.get("cf-connecting-ip");
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = cfIp?.trim() || (forwarded ? forwarded.split(",")[0].trim() : (req.headers.get("x-real-ip") || "0.0.0.0"));

  if (isRateLimited(ip)) {
    return responseMode === "redirect"
      ? redirectResponse("https://google.com")
      : jsonResponse({ action: "safe_page", reason: "rate_limited" }, 429);
  }

  try {
    let campaign_hash = "";
    let user_agent = "";
    let referer: string | null = null;
    let query_params: Record<string, string> = {};

    if (req.method === "GET") {
      campaign_hash = requestUrl.searchParams.get("campaign_hash") || "";
      user_agent = req.headers.get("user-agent") || "";
      referer = req.headers.get("referer");
      query_params = Object.fromEntries(requestUrl.searchParams.entries());
      delete query_params.campaign_hash;
    } else {
      const body = await req.json();
      campaign_hash = body.campaign_hash || "";
      user_agent = body.user_agent || "";
      referer = body.referer || null;
      query_params = body.query_params || {};
    }

    if (!campaign_hash || !user_agent) {
      return responseMode === "redirect"
        ? redirectResponse("https://google.com")
        : jsonResponse({ action: "safe_page", reason: "missing_params" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, user_id, offer_url, safe_url, is_active, traffic_source, offer_page_b, target_countries, target_devices, strict_mode, safe_page_method, offer_page_method, domain")
      .eq("hash", campaign_hash)
      .single();

    if (campaignError || !campaign || !campaign.is_active) {
      return responseMode === "redirect"
        ? redirectResponse("https://google.com")
        : jsonResponse({ action: "safe_page", reason: "campaign_invalid" });
    }

    const safeUrl = sanitizeRedirectUrl(campaign.safe_url, "https://google.com");

    const logAndRespond = async (
      action: "safe_page" | "offer_page" | "bot_blocked",
      countryCode: string,
      blockReason?: string,
    ) => {
      await supabase.from("requests_log").insert({
        user_id: campaign.user_id,
        campaign_id: campaign.id,
        ip_address: ip,
        country_code: countryCode,
        device_type: deviceType,
        user_agent,
        action_taken: action,
        block_reason: blockReason || null,
      });

      if (action === "bot_blocked") {
        try {
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { count } = await supabase
            .from("requests_log")
            .select("id", { count: "exact", head: true })
            .eq("ip_address", ip)
            .eq("user_id", campaign.user_id)
            .eq("action_taken", "bot_blocked")
            .gte("created_at", since);

          if (count && count >= 3) {
            await supabase.from("blocked_ips").upsert(
              {
                ip_address: ip,
                user_id: campaign.user_id,
                reason: blockReason || "auto_repeat_offender",
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              },
              { onConflict: "ip_address,user_id", ignoreDuplicates: true },
            ).select();
          }
        } catch {
          // Non-critical, don't fail the request
        }
      }

      let redirectUrl = safeUrl;

      if (action === "offer_page") {
        const hasB = campaign.offer_page_b && campaign.offer_page_b.trim();
        const coinFlip = crypto.getRandomValues(new Uint8Array(1))[0] < 128;
        const candidateUrl = hasB && coinFlip ? campaign.offer_page_b : campaign.offer_url;
        const sanitizedCandidate = sanitizeRedirectUrl(candidateUrl, safeUrl);

        const isHealthy = await checkUrlHealth(sanitizedCandidate);
        if (isHealthy) {
          redirectUrl = sanitizedCandidate;
        } else if (hasB) {
          const fallbackOffer = candidateUrl === campaign.offer_page_b ? campaign.offer_url : campaign.offer_page_b;
          const sanitizedFallback = sanitizeRedirectUrl(fallbackOffer, safeUrl);
          const fallbackHealthy = await checkUrlHealth(sanitizedFallback);

          if (fallbackHealthy) {
            console.warn(`[FALLBACK] Primary offer ${sanitizedCandidate} is down, using alternate: ${sanitizedFallback}`);
            redirectUrl = sanitizedFallback;
          } else {
            console.error("[FALLBACK] Both offer pages are down. Redirecting to safe page.");
          }
        } else {
          console.error(`[FALLBACK] Offer page ${sanitizedCandidate} is down. Redirecting to safe page.`);
        }
      }

      // Determine delivery method based on action and campaign settings
      const method = action === "offer_page"
        ? (campaign.offer_page_method || "redirect")
        : (campaign.safe_page_method || "redirect");

      if (responseMode === "redirect" && method === "content_fetch") {
        return contentFetchResponse(redirectUrl, user_agent, req.headers.get("accept-language"), campaign.domain || undefined);
      }

      return responseMode === "redirect"
        ? redirectResponse(redirectUrl)
        : jsonResponse({ action: action === "offer_page" ? "redirect" : "safe_page", url: redirectUrl, method });
    };

    const { data: blockedIp } = await supabase
      .from("blocked_ips")
      .select("id")
      .eq("ip_address", ip)
      .eq("user_id", campaign.user_id)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();

    const isMobile = /mobile|android|iphone|ipad/i.test(user_agent);
    const deviceType = isMobile ? "mobile" : "desktop";
    const uaLower = user_agent.toLowerCase();
    const params: Record<string, string> = query_params || {};

    if (blockedIp) {
      console.log(`[BLOCKED] Persistent blocklist — IP ${ip}`);
      return await logAndRespond("bot_blocked", "XX", "ip_blocklist");
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("max_clicks, current_clicks")
      .eq("user_id", campaign.user_id)
      .single();

    if (profile && profile.max_clicks > 0 && profile.current_clicks >= profile.max_clicks) {
      return responseMode === "redirect"
        ? redirectResponse(safeUrl)
        : jsonResponse({ action: "safe_page", url: safeUrl, reason: "click_limit_reached" });
    }

    const ipinfoToken = Deno.env.get("IPINFO_API_KEY");
    let countryCode = "XX";
    let ipOrg = "";

    if (ipinfoToken) {
      try {
        const ipRes = await fetch(`https://ipinfo.io/${ip}/json?token=${ipinfoToken}`, {
          signal: AbortSignal.timeout(3000),
        });
        const ipData = await ipRes.json();
        countryCode = ipData.country || "XX";
        ipOrg = ipData.org || "";
      } catch {
        console.warn("IPinfo.io request failed, skipping");
      }
    }

    const targetCountries: string[] = campaign.target_countries || [];
    if (targetCountries.length > 0 && countryCode !== "XX" && !targetCountries.includes(countryCode)) {
      console.log(`[BLOCKED] Geofence: ${countryCode} not in ${targetCountries.join(",")} — IP ${ip}`);
      return await logAndRespond("safe_page", countryCode, "geo_blocked");
    }

    const targetDevices: string[] = campaign.target_devices || [];
    if (targetDevices.length > 0 && !targetDevices.includes(deviceType)) {
      console.log(`[BLOCKED] Device filter: ${deviceType} not in ${targetDevices.join(",")} — IP ${ip}`);
      return await logAndRespond("safe_page", countryCode, "device_blocked");
    }

    if (GLOBAL_BOT_REGEX.test(user_agent)) {
      console.log(`[BLOCKED] Global bot regex matched for IP ${ip}`);
      return await logAndRespond("bot_blocked", countryCode, "global_bot_regex");
    }

    const source = (campaign.traffic_source || "").toLowerCase();
    let result: HeuristicResult = PASS;

    switch (source) {
      case "facebook":
        result = checkFacebook(uaLower, params, referer);
        break;
      case "instagram":
        result = checkInstagram(uaLower, params, referer);
        break;
      case "tiktok":
        result = checkTikTok(uaLower, deviceType, params);
        break;
      case "google":
        result = checkGoogle(uaLower, params);
        break;
      case "youtube":
        result = checkYouTube(uaLower, params);
        break;
      case "twitter":
        result = checkTwitter(uaLower, params);
        break;
      case "pinterest":
        result = checkPinterest(uaLower, params);
        break;
      case "linkedin":
        result = checkLinkedIn(uaLower, params);
        break;
      case "snapchat":
        result = checkSnapchat(uaLower, params, referer);
        break;
      case "kwai":
        result = checkKwai(uaLower, params, referer);
        break;
      default:
        break;
    }

    if (result.block) {
      console.log(`[BLOCKED] Source heuristic: ${source} — ${result.reason} — IP ${ip}`);
      return await logAndRespond("bot_blocked", countryCode, result.reason);
    }

    if (result.suspicious) {
      if (campaign.strict_mode) {
        console.log(`[BLOCKED-STRICT] ${source} — ${result.reason} — IP ${ip}`);
        return await logAndRespond("bot_blocked", countryCode, `strict_${result.reason}`);
      }
      console.log(`[SUSPICIOUS] ${source} — ${result.reason} — IP ${ip} — allowing through`);
    }

    const proxyCheckKey = Deno.env.get("PROXYCHECK_API_KEY");
    if (proxyCheckKey) {
      try {
        const proxyRes = await fetch(`https://proxycheck.io/v2/${ip}?key=${proxyCheckKey}&vpn=1`, {
          signal: AbortSignal.timeout(3000),
        });
        const proxyData = await proxyRes.json();
        if (proxyData[ip] && (proxyData[ip].proxy === "yes" || proxyData[ip].type === "VPN")) {
          return await logAndRespond("bot_blocked", proxyData[ip].country || countryCode, "vpn_proxy");
        }
      } catch {
        console.warn("Proxycheck.io request failed, skipping");
      }
    }

    if (ipOrg) {
      const orgLower = ipOrg.toLowerCase();
      if (BLOCKED_ORGS.some((kw) => orgLower.includes(kw))) {
        console.log(`[BLOCKED] Datacenter ASN: ${ipOrg} — IP ${ip}`);
        return await logAndRespond("bot_blocked", countryCode, "datacenter_asn");
      }
    }

    if (profile) {
      await supabase
        .from("profiles")
        .update({ current_clicks: (profile.current_clicks ?? 0) + 1 })
        .eq("user_id", campaign.user_id);
    }

    return await logAndRespond("offer_page", countryCode);
  } catch (error) {
    console.error("Filter error:", error);
    return jsonResponse({ action: "safe_page", reason: "internal_error" }, 500);
  }
});
