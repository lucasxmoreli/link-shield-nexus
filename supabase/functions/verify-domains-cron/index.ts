// =============================================================================
// EDGE FUNCTION: verify-domains-cron (v2 — Cloudflare for SaaS)
// =============================================================================
// Roda em background, varre dominios pendentes e verifica CNAME + SSL.
// Usa a mesma logica do verify-domain mas em batch.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CNAME_TARGET = (Deno.env.get("CLOAKERX_CNAME_TARGET") || "cname.cloakerx.com").toLowerCase();
const stripTrailingDot = (s: string) => s.replace(/\.$/, "").toLowerCase();

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SECRET");
  const authHeader = req.headers.get("Authorization");
  if (!cronSecret || !authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: domains, error } = await supabase
      .from("domains")
      .select("*")
      .eq("is_verified", false)
      .limit(50);

    if (error) {
      console.error("Failed to fetch domains:", error);
      return new Response(JSON.stringify({ error: "Internal error" }), {
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

    const cfZoneId = Deno.env.get("CLOUDFLARE_ZONE_ID");
    const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN");
    const cfEmail = Deno.env.get("CLOUDFLARE_EMAIL");
    const cfReady = !!(cfZoneId && cfToken && cfEmail);

    let verifiedCount = 0;
    let updatedCount = 0;

    for (const domain of domains) {
      const hostname = domain.url.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();

      // Check CNAME
      let cnameOk = false;
      try {
        const dnsResponse = await fetch(
          `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=CNAME`
        );
        const dnsData = await dnsResponse.json();
        if (dnsData.Answer && Array.isArray(dnsData.Answer)) {
          for (const answer of dnsData.Answer) {
            if (answer.type === 5 && stripTrailingDot(answer.data || "") === CNAME_TARGET) {
              cnameOk = true;
              break;
            }
          }
        }
      } catch (dnsErr) {
        console.error(`DNS lookup failed for ${hostname}:`, dnsErr);
        continue;
      }

      // Check SSL via CF API
      let sslStatus = domain.ssl_status || "pending_validation";
      let cfActive = false;
      let cfErrors: string | null = null;

      if (cfReady && domain.cloudflare_hostname_id) {
        try {
          const cfResponse = await fetch(
            `https://api.cloudflare.com/client/v4/zones/${cfZoneId}/custom_hostnames/${domain.cloudflare_hostname_id}`,
            {
              method: "GET",
              headers: {
                "X-Auth-Key": cfToken!,
                "X-Auth-Email": cfEmail!,
                "Content-Type": "application/json",
              },
            }
          );
          const cfData = await cfResponse.json();
          if (cfData.success) {
            sslStatus = cfData.result?.ssl?.status || "pending_validation";
            cfActive = cfData.result?.status === "active" && sslStatus === "active";
            const validationErrors = cfData.result?.ssl?.validation_errors;
            if (validationErrors && validationErrors.length > 0) {
              cfErrors = validationErrors.map((e: any) => e.message).join("; ");
            }
          }
        } catch (err) {
          console.error(`CF API failed for ${hostname}:`, err);
        }
      }

      const verified = cnameOk && cfActive;
      const updatePayload: Record<string, unknown> = {
        ssl_status: sslStatus,
        verification_errors: cfErrors,
      };
      if (verified) updatePayload.is_verified = true;

      await supabase.from("domains").update(updatePayload).eq("id", domain.id);
      updatedCount++;
      if (verified) verifiedCount++;
    }

    console.log(`Cron: checked ${domains.length}, updated ${updatedCount}, verified ${verifiedCount}`);

    return new Response(
      JSON.stringify({ checked: domains.length, updated: updatedCount, verified: verifiedCount }),
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
