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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { domain_id } = await req.json();
    if (!domain_id) {
      return new Response(JSON.stringify({ error: "domain_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the domain
    const { data: domain, error: domainError } = await supabase
      .from("domains")
      .select("*")
      .eq("id", domain_id)
      .eq("user_id", user.id)
      .single();

    if (domainError || !domain) {
      return new Response(JSON.stringify({ error: "Domain not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!domain.cloudflare_hostname_id) {
      return new Response(
        JSON.stringify({ error: "No Cloudflare hostname associated with this domain" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cfZoneId = Deno.env.get("CLOUDFLARE_ZONE_ID");
    const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN");

    if (!cfZoneId || !cfToken) {
      return new Response(JSON.stringify({ error: "Cloudflare configuration missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check custom hostname status on Cloudflare
    const cfResponse = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${cfZoneId}/custom_hostnames/${domain.cloudflare_hostname_id}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cfToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const cfData = await cfResponse.json();

    if (!cfData.success) {
      const errMsg = cfData.errors?.[0]?.message || "Cloudflare API error";
      return new Response(JSON.stringify({ error: errMsg }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hostnameStatus = cfData.result.status;
    const sslStatus = cfData.result.ssl?.status || "pending";
    const isActive = hostnameStatus === "active" && (sslStatus === "active" || sslStatus === "pending_deployment");

    // Update domain in database
    await supabase
      .from("domains")
      .update({
        is_verified: isActive,
        ssl_status: sslStatus,
      })
      .eq("id", domain_id);

    return new Response(
      JSON.stringify({
        active: isActive,
        hostname_status: hostnameStatus,
        ssl_status: sslStatus,
        message: isActive
          ? "Domain is active and ready for traffic!"
          : `Domain status: ${hostnameStatus}, SSL: ${sslStatus}. Ensure your CNAME points to proxy.cloakerguard.shop.`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
