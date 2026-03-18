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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { domain_id } = await req.json();
    if (!domain_id) {
      return new Response(JSON.stringify({ error: "Missing domain_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the domain (RLS ensures ownership)
    const { data: domain, error: domainError } = await supabase
      .from("domains")
      .select("*")
      .eq("id", domain_id)
      .single();

    if (domainError || !domain) {
      return new Response(JSON.stringify({ error: "Domain not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete from Cloudflare if hostname ID exists
    if (domain.cloudflare_hostname_id) {
      const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN");
      const cfEmail = Deno.env.get("CLOUDFLARE_EMAIL");
      const cfZoneId = Deno.env.get("CLOUDFLARE_ZONE_ID");

      if (cfToken && cfEmail && cfZoneId) {
        const cfResponse = await fetch(
          `https://api.cloudflare.com/client/v4/zones/${cfZoneId}/custom_hostnames/${domain.cloudflare_hostname_id}`,
          {
            method: "DELETE",
            headers: {
              "X-Auth-Key": cfToken,
              "X-Auth-Email": cfEmail,
              "Content-Type": "application/json",
            },
          }
        );

        const cfData = await cfResponse.json();
        if (!cfData.success) {
          const errMsg = cfData.errors?.[0]?.message || "Cloudflare deletion failed";
          console.error(`Cloudflare API Error: ${cfResponse.status} - ${errMsg}`);
          // Continue with DB deletion even if CF fails
        }
      }
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from("domains")
      .delete()
      .eq("id", domain_id);

    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`Edge function error: ${e.message}`);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
