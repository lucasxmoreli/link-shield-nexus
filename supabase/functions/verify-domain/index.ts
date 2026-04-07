// =============================================================================
// EDGE FUNCTION: verify-domain (v2 — Cloudflare for SaaS)
// =============================================================================
// 1. Resolve CNAME do dominio do cliente via Google DNS
// 2. Verifica se aponta para CLOAKERX_CNAME_TARGET (default: cname.cloakerx.com)
// 3. Consulta Cloudflare API para pegar status SSL atualizado
// 4. Marca is_verified = true SOMENTE quando CNAME ok + SSL active
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CNAME_TARGET = (Deno.env.get("CLOAKERX_CNAME_TARGET") || "cname.cloakerx.com").toLowerCase();

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const stripTrailingDot = (s: string) => s.replace(/\.$/, "").toLowerCase();

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── Auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Unauthorized" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json(401, { error: "Unauthorized" });

    const { domain_id } = await req.json();
    if (!domain_id) return json(400, { error: "domain_id required" });

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: domain, error: fetchError } = await adminClient
      .from("domains")
      .select("*")
      .eq("id", domain_id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !domain) return json(404, { error: "Domain not found" });

    if (domain.is_verified) {
      return json(200, { verified: true, already: true, ssl_status: domain.ssl_status });
    }

    const hostname = domain.url.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();

    // ── Step 1: Check CNAME via Google DNS ──
    let cnameOk = false;
    let cnameFound: string | null = null;
    try {
      const dnsResponse = await fetch(
        `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=CNAME`
      );
      const dnsData = await dnsResponse.json();
      if (dnsData.Answer && Array.isArray(dnsData.Answer)) {
        for (const answer of dnsData.Answer) {
          if (answer.type === 5) {
            const target = stripTrailingDot(answer.data || "");
            cnameFound = target;
            if (target === CNAME_TARGET) {
              cnameOk = true;
              break;
            }
          }
        }
      }
    } catch (err) {
      console.error("[verify-domain] DNS lookup failed:", err);
    }

    // ── Step 2: Query Cloudflare API for SSL status ──
    let sslStatus: string = domain.ssl_status || "pending_validation";
    let cfActive = false;
    let cfErrors: string | null = null;

    if (domain.cloudflare_hostname_id) {
      const cfZoneId = Deno.env.get("CLOUDFLARE_ZONE_ID");
      const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN");
      const cfEmail = Deno.env.get("CLOUDFLARE_EMAIL");

      if (cfZoneId && cfToken && cfEmail) {
        try {
          const cfResponse = await fetch(
            `https://api.cloudflare.com/client/v4/zones/${cfZoneId}/custom_hostnames/${domain.cloudflare_hostname_id}`,
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
            sslStatus = cfData.result?.ssl?.status || "pending_validation";
            cfActive = cfData.result?.status === "active" && sslStatus === "active";
            const validationErrors = cfData.result?.ssl?.validation_errors;
            if (validationErrors && validationErrors.length > 0) {
              cfErrors = validationErrors.map((e: any) => e.message).join("; ");
            }
          }
        } catch (err) {
          console.error("[verify-domain] CF API failed:", err);
        }
      }
    }

    // ── Step 3: Decide verification ──
    const verified = cnameOk && cfActive;

    const updatePayload: Record<string, unknown> = {
      ssl_status: sslStatus,
      verification_errors: cfErrors,
    };
    if (verified) updatePayload.is_verified = true;

    await adminClient.from("domains").update(updatePayload).eq("id", domain_id);

    return json(200, {
      verified,
      cname_ok: cnameOk,
      cname_found: cnameFound,
      cname_expected: CNAME_TARGET,
      ssl_status: sslStatus,
      ssl_active: cfActive,
      verification_errors: cfErrors,
      hostname,
    });
  } catch (err) {
    console.error("[verify-domain] Unexpected error:", err);
    return json(500, { error: "Internal error" });
  }
});
