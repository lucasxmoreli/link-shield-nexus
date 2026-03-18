import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const cfZoneId = Deno.env.get("CLOUDFLARE_ZONE_ID");
    const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN");

    if (!cfZoneId || !cfToken) {
      return new Response(
        JSON.stringify({
          status: "error",
          message: "Missing secrets: CLOUDFLARE_ZONE_ID or CLOUDFLARE_API_TOKEN not configured.",
          secrets: {
            CLOUDFLARE_ZONE_ID: !!cfZoneId,
            CLOUDFLARE_API_TOKEN: !!cfToken,
          },
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify token by hitting the Cloudflare API (list custom hostnames, limit 1)
    const cfResponse = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${cfZoneId}/custom_hostnames?per_page=1`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cfToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const cfData = await cfResponse.json();

    if (cfData.success) {
      return new Response(
        JSON.stringify({
          status: "success",
          message: "✅ Cloudflare API connection verified. Token and Zone ID are valid.",
          hostname_count: cfData.result_info?.total_count ?? "unknown",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      const errMsg = cfData.errors?.[0]?.message || "Unknown Cloudflare error";
      return new Response(
        JSON.stringify({
          status: "unauthorized",
          message: `❌ Cloudflare API rejected the request: ${errMsg}`,
          errors: cfData.errors,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    console.error("CF API test error:", err);
    return new Response(
      JSON.stringify({ status: "error", message: `Network error: ${err.message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
