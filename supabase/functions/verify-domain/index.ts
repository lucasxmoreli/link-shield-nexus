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

    const {
      data: { user },
    } = await supabase.auth.getUser();
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

    // Extract root domain for DNS lookup
    const hostname = domain.url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

    // Check TXT record: _cloakguard.<hostname>
    const txtHost = `_cloakguard.${hostname}`;
    const expectedValue = `cloakguard-verify=${domain.id}`;

    let verified = false;

    try {
      const dnsResponse = await fetch(
        `https://dns.google/resolve?name=${encodeURIComponent(txtHost)}&type=TXT`
      );
      const dnsData = await dnsResponse.json();

      if (dnsData.Answer && Array.isArray(dnsData.Answer)) {
        for (const answer of dnsData.Answer) {
          const txt = (answer.data || "").replace(/"/g, "").trim();
          if (txt === expectedValue) {
            verified = true;
            break;
          }
        }
      }
    } catch (dnsErr) {
      console.error("DNS lookup failed:", dnsErr);
      return new Response(
        JSON.stringify({ error: "DNS lookup failed. Try again later." }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if domain is behind Cloudflare proxy
    let cloudflareProtected = false;
    try {
      const healthCheck = await fetch(`https://${hostname}`, { method: "HEAD", redirect: "follow" });
      cloudflareProtected = (healthCheck.headers.get("server") || "").toLowerCase().includes("cloudflare");
    } catch { /* ignore - domain may not be reachable yet */ }

    if (verified) {
      // Update domain as verified
      await supabase
        .from("domains")
        .update({ is_verified: true })
        .eq("id", domain_id);

      return new Response(
        JSON.stringify({ verified: true, cloudflare: cloudflareProtected, message: "Domain verified!" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        verified: false,
        cloudflare: cloudflareProtected,
        message: "TXT record not found. Check your DNS settings and wait for propagation.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
