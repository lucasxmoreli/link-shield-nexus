import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Blocked ASN keywords (datacenters, bots, known crawlers)
const BLOCKED_ORGS = [
  "amazon", "google cloud", "facebook", "meta", "bytedance",
  "tiktok", "datacenter", "hosting", "microsoft", "digitalocean",
  "ovh", "hetzner", "linode", "vultr",
];

// Blocked user-agent keywords
const BLOCKED_UA = [
  "bot", "crawler", "spider", "tiktok", "facebookexternalhit",
  "bytespider", "googlebot", "bingbot", "yandexbot", "semrush",
  "ahrefsbot", "mj12bot", "dotbot",
];

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { campaign_hash, ip, user_agent, referer } = await req.json();

    if (!campaign_hash || !ip || !user_agent) {
      return new Response(
        JSON.stringify({ action: "safe_page", reason: "missing_params" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Create Supabase client with service role (bypasses RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ─── STEP 1: Validate campaign ───
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, user_id, offer_url, safe_url, is_active")
      .eq("hash", campaign_hash)
      .single();

    if (campaignError || !campaign || !campaign.is_active) {
      return new Response(
        JSON.stringify({ action: "safe_page", reason: "campaign_invalid" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── STEP 2: Check user click limit ───
    const { data: profile } = await supabase
      .from("profiles")
      .select("max_clicks, current_clicks")
      .eq("user_id", campaign.user_id)
      .single();

    if (profile && profile.current_clicks >= profile.max_clicks) {
      return new Response(
        JSON.stringify({ action: "safe_page", reason: "click_limit_reached" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Helper: log request and return response
    const logAndRespond = async (
      action: "safe_page" | "offer_page" | "bot_blocked",
      deviceType: "mobile" | "desktop",
      countryCode: string
    ) => {
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
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    };

    // Detect device type from user agent
    const isMobile = /mobile|android|iphone|ipad/i.test(user_agent);
    const deviceType = isMobile ? "mobile" : "desktop";

    // ─── STEP 3: User-Agent check (fast, no external API) ───
    const uaLower = user_agent.toLowerCase();
    if (BLOCKED_UA.some((keyword) => uaLower.includes(keyword))) {
      return await logAndRespond("bot_blocked", deviceType, "XX");
    }

    // ─── STEP 4: Proxy/VPN detection via Proxycheck.io ───
    const proxyCheckKey = Deno.env.get("PROXYCHECK_API_KEY")!;
    try {
      const proxyRes = await fetch(
        `https://proxycheck.io/v2/${ip}?key=${proxyCheckKey}&vpn=1`,
        { signal: AbortSignal.timeout(3000) }
      );
      const proxyData = await proxyRes.json();
      if (proxyData[ip] && (proxyData[ip].proxy === "yes" || proxyData[ip].type === "VPN")) {
        return await logAndRespond("bot_blocked", deviceType, proxyData[ip].country || "XX");
      }
    } catch {
      // If proxycheck fails, continue (don't block real users)
      console.warn("Proxycheck.io request failed, skipping");
    }

    // ─── STEP 5: ASN/Datacenter detection via IPinfo.io ───
    const ipinfoToken = Deno.env.get("IPINFO_API_KEY")!;
    let countryCode = "XX";
    try {
      const ipRes = await fetch(
        `https://ipinfo.io/${ip}/json?token=${ipinfoToken}`,
        { signal: AbortSignal.timeout(3000) }
      );
      const ipData = await ipRes.json();
      countryCode = ipData.country || "XX";

      if (ipData.org) {
        const orgLower = ipData.org.toLowerCase();
        if (BLOCKED_ORGS.some((keyword) => orgLower.includes(keyword))) {
          return await logAndRespond("bot_blocked", deviceType, countryCode);
        }
      }
    } catch {
      console.warn("IPinfo.io request failed, skipping");
    }

    // ─── STEP 6: User is real — increment clicks & redirect to offer ───
    if (profile) {
      await supabase
        .from("profiles")
        .update({ current_clicks: profile.current_clicks + 1 })
        .eq("user_id", campaign.user_id);
    }

    return await logAndRespond("offer_page", deviceType, countryCode);
  } catch (error) {
    console.error("Filter error:", error);
    return new Response(
      JSON.stringify({ action: "safe_page", reason: "internal_error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
