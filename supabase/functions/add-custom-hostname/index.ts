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

    const { hostname } = await req.json();
    if (!hostname || typeof hostname !== "string") {
      return new Response(JSON.stringify({ error: "hostname is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanHostname = hostname.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");

    // Check for duplicate in user's domains
    const { data: existing } = await supabase
      .from("domains")
      .select("id")
      .eq("url", cleanHostname)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "Domain already exists" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Register custom hostname with Cloudflare for SaaS
    const cfZoneId = Deno.env.get("CLOUDFLARE_ZONE_ID");
    const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN");

    if (!cfZoneId || !cfToken) {
      return new Response(JSON.stringify({ error: "Cloudflare configuration missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cfResponse = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${cfZoneId}/custom_hostnames`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          hostname: cleanHostname,
          ssl: { method: "txt", type: "dv" },
        }),
      }
    );

    const cfData = await cfResponse.json();

    if (!cfData.success) {
      const errMsg = cfData.errors?.[0]?.message || "Cloudflare API error";
      console.error("Cloudflare FULL response:", JSON.stringify(cfData, null, 2));
      console.error("CF Zone ID used:", cfZoneId);
      console.error("CF HTTP status:", cfResponse.status);
      return new Response(JSON.stringify({ error: errMsg, cf_response: cfData }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customHostnameId = cfData.result.id;
    const sslStatus = cfData.result.ssl?.status || "pending";

    // Insert domain into database with Cloudflare hostname ID
    const { data: domain, error: insertError } = await supabase
      .from("domains")
      .insert({
        user_id: user.id,
        url: cleanHostname,
        is_verified: false,
        cloudflare_hostname_id: customHostnameId,
        ssl_status: sslStatus,
      })
      .select()
      .single();

    if (insertError) {
      // Cleanup: delete from Cloudflare if DB insert fails
      await fetch(
        `https://api.cloudflare.com/client/v4/zones/${cfZoneId}/custom_hostnames/${customHostnameId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${cfToken}` },
        }
      );
      throw insertError;
    }

    return new Response(JSON.stringify({ domain, cloudflare: cfData.result }), {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
