import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── GLOBAL BOT DETECTION ───
const BOT_UA_REGEX = new RegExp(
  [
    "bot", "crawler", "spider", "scraper", "slurp",
    "headlesschrome", "phantomjs", "puppeteer", "selenium",
    "google-inspectiontool", "googlebot", "bingbot",
    "yandexbot", "baiduspider", "duckduckbot",
    "facebookexternalhit", "facebot",
    "bytespider", "semrushbot", "ahrefsbot", "mj12bot",
    "dotbot", "rogerbot", "sogou", "exabot",
    "ia_archiver", "archive.org_bot",
    "curl", "wget", "httpie", "python-requests", "go-http-client",
    "java\\/", "libwww", "lwp-trivial",
  ].join("|"),
  "i",
);

// Blocked ASN / datacenter org keywords
const BLOCKED_ORGS = [
  "amazon", "google cloud", "facebook", "meta", "bytedance", "tiktok",
  "datacenter", "hosting", "microsoft", "digitalocean", "ovh",
  "hetzner", "linode", "vultr", "cloudflare", "oracle",
];

// ─── SOURCE-SPECIFIC HEURISTICS ───

function checkFacebookInstagram(uaLower: string, referer: string | null, queryParams: Record<string, string>): { block: boolean; reason: string } {
  // Block Facebook's automated review bots
  if (/facebookexternalhit|facebot|facebook.*crawler/i.test(uaLower)) {
    return { block: true, reason: "fb_review_bot" };
  }
  // If no fbclid and no Facebook referer, suspicious but not blocking (soft signal)
  // We allow it through but could flag in the future
  return { block: false, reason: "" };
}

function checkTikTok(uaLower: string, deviceType: string): { block: boolean; reason: string } {
  // TikTok in-app browser identifiers
  const tiktokUASignals = ["bytelocale", "trill", "tiktok", "musical_ly", "bytedance"];
  const hasTikTokUA = tiktokUASignals.some((sig) => uaLower.includes(sig));

  // ByteSpider is TikTok's aggressive crawler — always block
  if (uaLower.includes("bytespider")) {
    return { block: true, reason: "tiktok_bytespider" };
  }

  // Desktop browser clicking a TikTok mobile ad is highly suspicious
  if (deviceType === "desktop" && !hasTikTokUA) {
    return { block: true, reason: "tiktok_desktop_suspicious" };
  }

  return { block: false, reason: "" };
}

function checkGoogleAds(uaLower: string, queryParams: Record<string, string>): { block: boolean; reason: string } {
  // Block Google's inspection/review tools
  if (/google-inspectiontool|adsbot-google|mediapartners-google/i.test(uaLower)) {
    return { block: true, reason: "google_review_bot" };
  }
  return { block: false, reason: "" };
}

function checkSnapchat(uaLower: string): { block: boolean; reason: string } {
  if (/snapchat.*bot|snapchat.*crawler/i.test(uaLower)) {
    return { block: true, reason: "snapchat_bot" };
  }
  return { block: false, reason: "" };
}

function checkTwitter(uaLower: string): { block: boolean; reason: string } {
  if (/twitterbot/i.test(uaLower)) {
    return { block: true, reason: "twitter_bot" };
  }
  return { block: false, reason: "" };
}

function checkLinkedIn(uaLower: string): { block: boolean; reason: string } {
  if (/linkedinbot/i.test(uaLower)) {
    return { block: true, reason: "linkedin_bot" };
  }
  return { block: false, reason: "" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
      .select("id, user_id, offer_url, safe_url, is_active, traffic_source")
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

    // Helper: log request and return response
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

      const redirectUrl = action === "offer_page" ? campaign.offer_url : campaign.safe_url;
      return new Response(
        JSON.stringify({ action: action === "offer_page" ? "redirect" : "safe_page", url: redirectUrl }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    };

    // ─── STEP 3: Global Bot Detection (baseline) ───
    if (BOT_UA_REGEX.test(uaLower)) {
      return await logAndRespond("bot_blocked", "XX");
    }

    // ─── STEP 4: Source-Specific Heuristics ───
    const source = (campaign.traffic_source || "").toLowerCase();
    let sourceCheck: { block: boolean; reason: string } = { block: false, reason: "" };

    switch (source) {
      case "facebook":
      case "instagram":
        sourceCheck = checkFacebookInstagram(uaLower, referer, params);
        break;
      case "tiktok":
        sourceCheck = checkTikTok(uaLower, deviceType);
        break;
      case "google ads":
        sourceCheck = checkGoogleAds(uaLower, params);
        break;
      case "snapchat":
        sourceCheck = checkSnapchat(uaLower);
        break;
      case "twitter":
        sourceCheck = checkTwitter(uaLower);
        break;
      case "linkedin":
        sourceCheck = checkLinkedIn(uaLower);
        break;
      // youtube, pinterest, native ads, etc. — fallback to global detection only
      default:
        break;
    }

    if (sourceCheck.block) {
      console.log(`Source-specific block: ${source} — ${sourceCheck.reason}`);
      return await logAndRespond("bot_blocked", "XX");
    }

    // ─── STEP 5: Proxy/VPN detection via Proxycheck.io ───
    const proxyCheckKey = Deno.env.get("PROXYCHECK_API_KEY")!;
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

    // ─── STEP 6: ASN/Datacenter detection via IPinfo.io ───
    const ipinfoToken = Deno.env.get("IPINFO_API_KEY")!;
    let countryCode = "XX";
    try {
      const ipRes = await fetch(`https://ipinfo.io/${ip}/json?token=${ipinfoToken}`, {
        signal: AbortSignal.timeout(3000),
      });
      const ipData = await ipRes.json();
      countryCode = ipData.country || "XX";

      if (ipData.org) {
        const orgLower = ipData.org.toLowerCase();
        if (BLOCKED_ORGS.some((keyword) => orgLower.includes(keyword))) {
          return await logAndRespond("bot_blocked", countryCode);
        }
      }
    } catch {
      console.warn("IPinfo.io request failed, skipping");
    }

    // ─── STEP 7: User is real — increment clicks & redirect to offer ───
    if (profile) {
      await supabase
        .from("profiles")
        .update({ current_clicks: profile.current_clicks + 1 })
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
