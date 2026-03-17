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
    // Generic bots & crawlers
    "bot\\b", "crawler", "spider", "scraper", "slurp",
    // Headless / automation
    "headlesschrome", "phantomjs", "puppeteer", "selenium", "playwright",
    "webdriver", "electron", "nightmare",
    // Search engines
    "googlebot", "google-inspectiontool", "adsbot-google", "mediapartners-google",
    "bingbot", "yandexbot", "baiduspider", "duckduckbot", "sogou", "exabot",
    // Social platform bots (broad catch — source-specific logic refines below)
    "facebookexternalhit", "facebot",
    "bytespider", "twitterbot", "linkedinbot", "pinterestbot",
    "snapchat", "snapbot",
    // SEO / analytics bots
    "semrushbot", "ahrefsbot", "mj12bot", "dotbot", "rogerbot", "screaming frog",
    "majestic", "megaindex", "blexbot",
    // Archival
    "ia_archiver", "archive\\.org_bot",
    // HTTP libraries / programmatic access
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
// Each returns { block, suspicious, reason }
// block = hard reject → safe page
// suspicious = soft flag (logged but allowed through for now)
// ═══════════════════════════════════════════════════════════════

interface HeuristicResult {
  block: boolean;
  suspicious: boolean;
  reason: string;
}

const PASS: HeuristicResult = { block: false, suspicious: false, reason: "" };

function checkFacebook(ua: string, params: Record<string, string>, referer: string | null): HeuristicResult {
  // Facebook review bots
  if (/facebookexternalhit|facebot|facebook.*crawler/i.test(ua)) {
    return { block: true, suspicious: false, reason: "fb_review_bot" };
  }
  // Missing fbclid AND no FB referer → suspicious (could be direct link share)
  const hasFbclid = !!params.fbclid;
  const hasFbReferer = referer ? /facebook\.com|fb\.com|fbcdn\.net/i.test(referer) : false;
  if (!hasFbclid && !hasFbReferer) {
    return { block: false, suspicious: true, reason: "fb_no_click_id" };
  }
  return PASS;
}

function checkInstagram(ua: string, params: Record<string, string>, referer: string | null): HeuristicResult {
  // IG shares the Facebook bot infra
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
  // ByteSpider is TikTok's aggressive crawler — always block
  if (/bytespider/i.test(ua)) {
    return { block: true, suspicious: false, reason: "tiktok_bytespider" };
  }
  // TikTok in-app browser signatures
  const tiktokSignals = ["bytelocale", "trill", "tiktok", "musical_ly", "bytedance", "tt_webid"];
  const hasTikTokUA = tiktokSignals.some((s) => ua.includes(s));
  const hasTtclid = !!params.ttclid;

  // Desktop browser on a TikTok campaign with no TikTok UA → highly suspicious
  if (deviceType === "desktop" && !hasTikTokUA) {
    return { block: true, suspicious: false, reason: "tiktok_desktop_no_app" };
  }
  // Mobile but no TikTok UA and no ttclid → suspicious
  if (!hasTikTokUA && !hasTtclid) {
    return { block: false, suspicious: true, reason: "tiktok_no_signature" };
  }
  return PASS;
}

function checkGoogle(ua: string, params: Record<string, string>): HeuristicResult {
  // Google ad review bots
  if (/adsbot-google|mediapartners-google|google-inspectiontool|google-adwords/i.test(ua)) {
    return { block: true, suspicious: false, reason: "google_review_bot" };
  }
  // Check for Google click IDs
  const hasGclid = !!params.gclid;
  const hasWbraid = !!params.wbraid;
  const hasGbraid = !!params.gbraid;
  if (!hasGclid && !hasWbraid && !hasGbraid) {
    return { block: false, suspicious: true, reason: "google_no_click_id" };
  }
  return PASS;
}

function checkYouTube(ua: string, params: Record<string, string>): HeuristicResult {
  // YouTube uses Google's ad infra
  if (/adsbot-google|mediapartners-google|google-inspectiontool/i.test(ua)) {
    return { block: true, suspicious: false, reason: "youtube_google_bot" };
  }
  const hasGclid = !!params.gclid;
  const hasWbraid = !!params.wbraid;
  if (!hasGclid && !hasWbraid) {
    return { block: false, suspicious: true, reason: "youtube_no_click_id" };
  }
  return PASS;
}

function checkTwitter(ua: string, params: Record<string, string>): HeuristicResult {
  if (/twitterbot/i.test(ua)) {
    return { block: true, suspicious: false, reason: "twitter_bot" };
  }
  const hasTwclid = !!params.twclid;
  const hasTwitterRef = false; // referer often stripped by X
  if (!hasTwclid) {
    return { block: false, suspicious: true, reason: "twitter_no_click_id" };
  }
  return PASS;
}

function checkPinterest(ua: string, params: Record<string, string>): HeuristicResult {
  if (/pinterestbot|pinterest.*crawler/i.test(ua)) {
    return { block: true, suspicious: false, reason: "pinterest_bot" };
  }
  const hasEpik = !!params.epik;
  if (!hasEpik) {
    return { block: false, suspicious: true, reason: "pinterest_no_click_id" };
  }
  return PASS;
}

function checkLinkedIn(ua: string, params: Record<string, string>): HeuristicResult {
  if (/linkedinbot/i.test(ua)) {
    return { block: true, suspicious: false, reason: "linkedin_bot" };
  }
  const hasLiFatId = !!params.li_fat_id;
  if (!hasLiFatId) {
    return { block: false, suspicious: true, reason: "linkedin_no_click_id" };
  }
  return PASS;
}

function checkSnapchat(ua: string, params: Record<string, string>): HeuristicResult {
  if (/snapchat|snapbot/i.test(ua)) {
    return { block: true, suspicious: false, reason: "snapchat_bot" };
  }
  const hasScCid = !!params.ScCid || !!params.sccid;
  if (!hasScCid) {
    return { block: false, suspicious: true, reason: "snapchat_no_click_id" };
  }
  return PASS;
}

function checkKwai(ua: string, referer: string | null): HeuristicResult {
  // Kwai doesn't have well-known bots yet — rely on referer
  if (/kwaibot|kwaicrawler/i.test(ua)) {
    return { block: true, suspicious: false, reason: "kwai_bot" };
  }
  const hasKwaiReferer = referer ? /kwai\.com|ksweb/i.test(referer) : false;
  if (!hasKwaiReferer) {
    return { block: false, suspicious: true, reason: "kwai_no_referer" };
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
  // Garbage collect stale IPs periodically
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Extract IP early for rate limiting
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : (req.headers.get("x-real-ip") || "0.0.0.0");

  // Rate limit check BEFORE any DB logic
  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ action: "safe_page", reason: "rate_limited" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 429,
    });
  }

  try {
    const { campaign_hash, user_agent, referer, query_params } = await req.json();

    // Extract real client IP from headers (prevents spoofing)
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : (req.headers.get("x-real-ip") || "0.0.0.0");

    if (!campaign_hash || !user_agent) {
      return new Response(JSON.stringify({ action: "safe_page", reason: "missing_params" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ─── STEP 1: Validate campaign & fetch traffic_source ───
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, user_id, offer_url, safe_url, is_active, traffic_source, offer_page_b")
      .eq("hash", campaign_hash)
      .single();

    if (campaignError || !campaign || !campaign.is_active) {
      return new Response(JSON.stringify({ action: "safe_page", reason: "campaign_invalid" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── STEP 2: Check user click limit ───
    const { data: profile } = await supabase
      .from("profiles")
      .select("max_clicks, current_clicks")
      .eq("user_id", campaign.user_id)
      .single();

    if (profile && profile.max_clicks > 0 && profile.current_clicks >= profile.max_clicks) {
      return new Response(
        JSON.stringify({ action: "safe_page", url: campaign.safe_url, reason: "click_limit_reached" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Device detection
    const isMobile = /mobile|android|iphone|ipad/i.test(user_agent);
    const deviceType = isMobile ? "mobile" : "desktop";
    const uaLower = user_agent.toLowerCase();
    const params: Record<string, string> = query_params || {};

    // Helper: log & respond
    const logAndRespond = async (action: "safe_page" | "offer_page" | "bot_blocked", countryCode: string) => {
      await supabase.from("requests_log").insert({
        user_id: campaign.user_id,
        campaign_id: campaign.id,
        ip_address: ip,
        country_code: countryCode,
        device_type: deviceType,
        user_agent: user_agent,
        action_taken: action,
      });

      let redirectUrl: string;
      if (action === "offer_page") {
        // A/B Storm: 50/50 split when offer_page_b exists (crypto-secure coin flip)
        const hasB = campaign.offer_page_b && campaign.offer_page_b.trim();
        const coinFlip = crypto.getRandomValues(new Uint8Array(1))[0] < 128;
        redirectUrl = hasB && coinFlip ? campaign.offer_page_b : campaign.offer_url;
      } else {
        redirectUrl = campaign.safe_url;
      }

      return new Response(
        JSON.stringify({ action: action === "offer_page" ? "redirect" : "safe_page", url: redirectUrl }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    };

    // ─── STEP 3: LAYER 1 — Global Bot Detection ───
    if (GLOBAL_BOT_REGEX.test(user_agent)) {
      console.log(`[BLOCKED] Global bot regex matched for IP ${ip}`);
      return await logAndRespond("bot_blocked", "XX");
    }

    // ─── STEP 4: LAYER 2 — Source-Specific Heuristics ───
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
        result = checkSnapchat(uaLower, params);
        break;
      case "kwai":
        result = checkKwai(uaLower, referer);
        break;
      default:
        // Unknown or null source — global bot detection already ran, allow through
        break;
    }

    if (result.block) {
      console.log(`[BLOCKED] Source heuristic: ${source} — ${result.reason} — IP ${ip}`);
      return await logAndRespond("bot_blocked", "XX");
    }

    if (result.suspicious) {
      console.log(`[SUSPICIOUS] ${source} — ${result.reason} — IP ${ip} — allowing through`);
      // Future: could redirect to safe page in strict mode
    }

    // ─── STEP 5: LAYER 3 — Proxy/VPN detection via Proxycheck.io ───
    const proxyCheckKey = Deno.env.get("PROXYCHECK_API_KEY");
    if (proxyCheckKey) {
      try {
        const proxyRes = await fetch(`https://proxycheck.io/v2/${ip}?key=${proxyCheckKey}&vpn=1`, {
          signal: AbortSignal.timeout(3000),
        });
        const proxyData = await proxyRes.json();
        if (proxyData[ip] && (proxyData[ip].proxy === "yes" || proxyData[ip].type === "VPN")) {
          return await logAndRespond("bot_blocked", proxyData[ip].country || "XX");
        }
      } catch {
        console.warn("Proxycheck.io request failed, skipping");
      }
    }

    // ─── STEP 6: LAYER 4 — ASN/Datacenter detection via IPinfo.io ───
    const ipinfoToken = Deno.env.get("IPINFO_API_KEY");
    let countryCode = "XX";
    if (ipinfoToken) {
      try {
        const ipRes = await fetch(`https://ipinfo.io/${ip}/json?token=${ipinfoToken}`, {
          signal: AbortSignal.timeout(3000),
        });
        const ipData = await ipRes.json();
        countryCode = ipData.country || "XX";

        if (ipData.org) {
          const orgLower = ipData.org.toLowerCase();
          if (BLOCKED_ORGS.some((kw) => orgLower.includes(kw))) {
            console.log(`[BLOCKED] Datacenter ASN: ${ipData.org} — IP ${ip}`);
            return await logAndRespond("bot_blocked", countryCode);
          }
        }
      } catch {
        console.warn("IPinfo.io request failed, skipping");
      }
    }

    // ─── STEP 7: PASSED — Increment clicks & redirect to offer ───
    if (profile) {
      await supabase
        .from("profiles")
        .update({ current_clicks: (profile.current_clicks ?? 0) + 1 })
        .eq("user_id", campaign.user_id);
    }

    return await logAndRespond("offer_page", countryCode);
  } catch (error) {
    console.error("Filter error:", error);
    return new Response(JSON.stringify({ action: "safe_page", reason: "internal_error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
