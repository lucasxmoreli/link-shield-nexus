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
async function checkUrlHealth(url: string, timeoutMs = 2000): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    // 2xx and 3xx are healthy
    return res.status < 400;
  } catch {
    return false;
  }
}


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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

    if (!campaign_hash || !user_agent) {
      return new Response(JSON.stringify({ action: "safe_page", reason: "missing_params" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ─── STEP 1: Validate campaign ───
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, user_id, offer_url, safe_url, is_active, traffic_source, offer_page_b, target_countries, target_devices, strict_mode")
      .eq("hash", campaign_hash)
      .single();

    if (campaignError || !campaign || !campaign.is_active) {
      return new Response(JSON.stringify({ action: "safe_page", reason: "campaign_invalid" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── STEP 1.5: Check persistent IP blocklist ───
    const { data: blockedIp } = await supabase
      .from("blocked_ips")
      .select("id")
      .eq("ip_address", ip)
      .eq("user_id", campaign.user_id)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();

    if (blockedIp) {
      console.log(`[BLOCKED] Persistent blocklist — IP ${ip}`);
      // Log and return early
      await supabase.from("requests_log").insert({
        user_id: campaign.user_id,
        campaign_id: campaign.id,
        ip_address: ip,
        country_code: "XX",
        device_type: "desktop",
        user_agent,
        action_taken: "bot_blocked",
        block_reason: "ip_blocklist",
      });
      return new Response(
        JSON.stringify({ action: "safe_page", url: campaign.safe_url }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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

    // Helper: log & respond (now with block_reason)
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
        user_agent: user_agent,
        action_taken: action,
        block_reason: blockReason || null,
      });

      // Auto-blocklist: after 3 blocks from same IP in 24h, add to blocklist
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

      // Ensure a URL is absolute and not a self-referencing /c/ path
      const sanitizeRedirectUrl = (url: string, safeFallback: string): string => {
        let u = (url || "").trim();
        // Prepend https:// if missing protocol
        if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
        // Abort if URL contains /c/ (self-referencing cloaker loop)
        if (/\/c\//.test(u)) {
          console.error(`[LOOP-GUARD] Redirect URL "${u}" contains /c/ path — aborting to safe page`);
          return safeFallback;
        }
        // Validate it's a proper URL
        try { new URL(u); } catch {
          console.error(`[INVALID-URL] "${u}" is not a valid URL — falling back to safe page`);
          return safeFallback;
        }
        return u;
      };

      const safeUrl = sanitizeRedirectUrl(campaign.safe_url, "https://google.com");

      let redirectUrl: string;
      if (action === "offer_page") {
        const hasB = campaign.offer_page_b && campaign.offer_page_b.trim();
        const coinFlip = crypto.getRandomValues(new Uint8Array(1))[0] < 128;
        const candidateUrl = hasB && coinFlip ? campaign.offer_page_b : campaign.offer_url;
        const sanitizedCandidate = sanitizeRedirectUrl(candidateUrl, safeUrl);

        // Health check: verify offer page is reachable before redirecting
        const isHealthy = await checkUrlHealth(sanitizedCandidate);
        if (isHealthy) {
          redirectUrl = sanitizedCandidate;
        } else {
          if (hasB) {
            const fallbackOffer = candidateUrl === campaign.offer_page_b ? campaign.offer_url : campaign.offer_page_b;
            const sanitizedFallback = sanitizeRedirectUrl(fallbackOffer, safeUrl);
            const fallbackHealthy = await checkUrlHealth(sanitizedFallback);
            if (fallbackHealthy) {
              console.warn(`[FALLBACK] Primary offer ${sanitizedCandidate} is down, using alternate: ${sanitizedFallback}`);
              redirectUrl = sanitizedFallback;
            } else {
              console.error(`[FALLBACK] Both offer pages are down. Redirecting to safe page.`);
              redirectUrl = safeUrl;
            }
          } else {
            console.error(`[FALLBACK] Offer page ${sanitizedCandidate} is down. Redirecting to safe page.`);
            redirectUrl = safeUrl;
          }
        }
      } else {
        redirectUrl = safeUrl;
      }

      return new Response(
        JSON.stringify({ action: action === "offer_page" ? "redirect" : "safe_page", url: redirectUrl }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    };

    // ─── STEP 2.5: GEOFENCING — Country & Device filtering ───
    // We need countryCode for geo check; fetch it early from IPinfo
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

    // Geofencing: if campaign has target_countries and visitor is outside them → safe page
    const targetCountries: string[] = campaign.target_countries || [];
    if (targetCountries.length > 0 && countryCode !== "XX" && !targetCountries.includes(countryCode)) {
      console.log(`[BLOCKED] Geofence: ${countryCode} not in ${targetCountries.join(",")} — IP ${ip}`);
      return await logAndRespond("safe_page", countryCode, "geo_blocked");
    }

    // Device filtering: if campaign has target_devices and visitor device not in them → safe page
    const targetDevices: string[] = campaign.target_devices || [];
    if (targetDevices.length > 0 && !targetDevices.includes(deviceType)) {
      console.log(`[BLOCKED] Device filter: ${deviceType} not in ${targetDevices.join(",")} — IP ${ip}`);
      return await logAndRespond("safe_page", countryCode, "device_blocked");
    }

    // ─── STEP 3: LAYER 1 — Global Bot Detection ───
    if (GLOBAL_BOT_REGEX.test(user_agent)) {
      console.log(`[BLOCKED] Global bot regex matched for IP ${ip}`);
      return await logAndRespond("bot_blocked", countryCode, "global_bot_regex");
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

    // STRICT MODE: if campaign.strict_mode is on, block suspicious traffic
    if (result.suspicious) {
      if (campaign.strict_mode) {
        console.log(`[BLOCKED-STRICT] ${source} — ${result.reason} — IP ${ip}`);
        return await logAndRespond("bot_blocked", countryCode, `strict_${result.reason}`);
      }
      console.log(`[SUSPICIOUS] ${source} — ${result.reason} — IP ${ip} — allowing through`);
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
          return await logAndRespond("bot_blocked", proxyData[ip].country || countryCode, "vpn_proxy");
        }
      } catch {
        console.warn("Proxycheck.io request failed, skipping");
      }
    }

    // ─── STEP 6: LAYER 4 — ASN/Datacenter detection (already fetched ipOrg above) ───
    if (ipOrg) {
      const orgLower = ipOrg.toLowerCase();
      if (BLOCKED_ORGS.some((kw) => orgLower.includes(kw))) {
        console.log(`[BLOCKED] Datacenter ASN: ${ipOrg} — IP ${ip}`);
        return await logAndRespond("bot_blocked", countryCode, "datacenter_asn");
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
