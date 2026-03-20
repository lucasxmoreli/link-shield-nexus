import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VPS_IP = "187.124.233.229";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the user's JWT
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { domain_id } = await req.json();
    if (!domain_id) {
      return new Response(JSON.stringify({ error: "domain_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Fetch domain and ensure it belongs to the user
    const { data: domain, error: fetchError } = await adminClient
      .from("domains")
      .select("*")
      .eq("id", domain_id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !domain) {
      return new Response(JSON.stringify({ error: "Domain not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (domain.is_verified) {
      return new Response(JSON.stringify({ verified: true, already: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check A record via Google DNS
    const hostname = domain.url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const dnsResponse = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`
    );
    const dnsData = await dnsResponse.json();

    let verified = false;
    if (dnsData.Answer && Array.isArray(dnsData.Answer)) {
      for (const answer of dnsData.Answer) {
        if (answer.type === 1 && answer.data === VPS_IP) {
          verified = true;
          break;
        }
      }
    }

    if (verified) {
      await adminClient
        .from("domains")
        .update({ is_verified: true })
        .eq("id", domain_id);
    }

    return new Response(
      JSON.stringify({ verified, hostname }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
