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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch all unverified domains
    const { data: domains, error } = await supabase
      .from("domains")
      .select("*")
      .eq("is_verified", false);

    if (error) {
      console.error("Failed to fetch domains:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch domains" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!domains || domains.length === 0) {
      return new Response(JSON.stringify({ message: "No pending domains", verified: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let verifiedCount = 0;
    const results: { domain: string; verified: boolean }[] = [];

    for (const domain of domains) {
      const hostname = domain.url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      const txtHost = `_cloakguard.${hostname}`;
      const expectedValue = `cloakguard-verify=${domain.id}`;

      try {
        const dnsResponse = await fetch(
          `https://dns.google/resolve?name=${encodeURIComponent(txtHost)}&type=TXT`
        );
        const dnsData = await dnsResponse.json();

        let verified = false;
        if (dnsData.Answer && Array.isArray(dnsData.Answer)) {
          for (const answer of dnsData.Answer) {
            const txt = (answer.data || "").replace(/"/g, "").trim();
            if (txt === expectedValue) {
              verified = true;
              break;
            }
          }
        }

        if (verified) {
          await supabase.from("domains").update({ is_verified: true }).eq("id", domain.id);
          verifiedCount++;
        }

        results.push({ domain: hostname, verified });
      } catch (dnsErr) {
        console.error(`DNS lookup failed for ${hostname}:`, dnsErr);
        results.push({ domain: hostname, verified: false });
      }
    }

    console.log(`Checked ${domains.length} domains, verified ${verifiedCount}`);

    return new Response(
      JSON.stringify({ message: `Checked ${domains.length} domains`, verified: verifiedCount, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
