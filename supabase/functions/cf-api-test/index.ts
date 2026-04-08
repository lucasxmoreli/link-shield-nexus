// =============================================================================
// EDGE FUNCTION: cf-api-test
// =============================================================================
// Testa conectividade com a Cloudflare API. Endpoint de diagnóstico restrito
// a admins autenticados — NÃO é público.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    // ── Auth: exige JWT válido ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ status: "unauthorized", message: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ status: "unauthorized", message: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Authz: exige role admin ──
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: isAdmin, error: roleError } = await adminClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (roleError || !isAdmin) {
      console.warn("[cf-api-test] Forbidden access attempt by user:", user.id);
      return new Response(
        JSON.stringify({ status: "forbidden", message: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Cloudflare API check ──
    const cfZoneId = Deno.env.get("CLOUDFLARE_ZONE_ID");
    const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN");
    const cfEmail = Deno.env.get("CLOUDFLARE_EMAIL");

    if (!cfZoneId || !cfToken || !cfEmail) {
      return new Response(
        JSON.stringify({
          status: "error",
          message: "Missing secrets: CLOUDFLARE_ZONE_ID, CLOUDFLARE_API_TOKEN, or CLOUDFLARE_EMAIL not configured.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cfResponse = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${cfZoneId}/custom_hostnames?per_page=1`,
      {
        method: "GET",
        headers: {
          "X-Auth-Key": cfToken,
          "X-Auth-Email": cfEmail,
          "Content-Type": "application/json",
        },
      }
    );

    const cfData = await cfResponse.json();

    if (cfData.success) {
      return new Response(
        JSON.stringify({
          status: "success",
          message: "✅ Cloudflare API connection verified. Global Key and Zone ID are valid.",
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
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    console.error("CF API test error:", err);
    return new Response(
      JSON.stringify({ status: "error", message: `Network error: ${(err as Error).message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
