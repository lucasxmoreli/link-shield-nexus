// =============================================================================
// EDGE FUNCTION: add-domain
// =============================================================================
// Recebe { url } do cliente, valida, cria Custom Hostname na Cloudflare for SaaS,
// salva no banco com cloudflare_hostname_id + ownership_token + ssl_status.
//
// Requer secrets:
//   CLOUDFLARE_ZONE_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_EMAIL
//   CLOAKERX_CNAME_TARGET (default: cname.cloakerx.com)
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CNAME_TARGET = Deno.env.get("CLOAKERX_CNAME_TARGET") || "cname.cloakerx.com";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const normalizeHostname = (raw: string): string =>
  raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");

const isValidHostname = (h: string): boolean =>
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(h);

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

    // ── Parse and validate input ──
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return json(400, { error: "url required" });
    }

    const hostname = normalizeHostname(url);
    if (!isValidHostname(hostname)) {
      return json(400, { error: "Invalid hostname format" });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ── Check duplicates for this user ──
    const { data: existing } = await adminClient
      .from("domains")
      .select("id")
      .eq("user_id", user.id)
      .eq("url", hostname)
      .maybeSingle();

    if (existing) {
      return json(409, { error: "Domain already exists for this user" });
    }

    // ── Check plan limit ──
    const { data: profile } = await adminClient
      .from("profiles")
      .select("max_domains")
      .eq("user_id", user.id)
      .single();

    if (!profile || (profile.max_domains ?? 0) <= 0) {
      return json(403, { error: "Plan does not allow custom domains" });
    }

    const { count: currentCount } = await adminClient
      .from("domains")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    if ((currentCount ?? 0) >= (profile.max_domains ?? 0)) {
      return json(403, { error: "Domain limit reached for this plan" });
    }

    // ── Cloudflare API: create Custom Hostname ──
    const cfZoneId = Deno.env.get("CLOUDFLARE_ZONE_ID");
    const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN");
    const cfEmail = Deno.env.get("CLOUDFLARE_EMAIL");

    if (!cfZoneId || !cfToken || !cfEmail) {
      console.error("[add-domain] Missing Cloudflare secrets");
      return json(500, { error: "Cloudflare not configured" });
    }

    const cfResponse = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${cfZoneId}/custom_hostnames`,
      {
        method: "POST",
        headers: {
          "X-Auth-Key": cfToken,
          "X-Auth-Email": cfEmail,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          hostname,
          ssl: {
            method: "txt",
            type: "dv",
            settings: {
              http2: "on",
              min_tls_version: "1.2",
              tls_1_3: "on",
            },
          },
        }),
      }
    );

    const cfData = await cfResponse.json();

    if (!cfData.success) {
      const errorMsg = cfData.errors?.[0]?.message || "Cloudflare API error";
      console.error("[add-domain] CF API error:", JSON.stringify(cfData.errors));
      return json(502, { error: `Cloudflare: ${errorMsg}`, cf_errors: cfData.errors });
    }

    const cfHostname = cfData.result;
    const ownershipToken = cfHostname.ownership_verification?.value || null;
    const sslStatus = cfHostname.ssl?.status || "pending_validation";

    // ── Save to database ──
    const { data: domain, error: insertError } = await adminClient
      .from("domains")
      .insert({
        url: hostname,
        user_id: user.id,
        is_verified: false,
        cloudflare_hostname_id: cfHostname.id,
        ssl_status: sslStatus,
        ownership_token: ownershipToken,
      })
      .select()
      .single();

    if (insertError) {
      // Rollback CF if DB insert failed
      console.error("[add-domain] DB insert failed, rolling back CF:", insertError);
      await fetch(
        `https://api.cloudflare.com/client/v4/zones/${cfZoneId}/custom_hostnames/${cfHostname.id}`,
        {
          method: "DELETE",
          headers: {
            "X-Auth-Key": cfToken,
            "X-Auth-Email": cfEmail,
          },
        }
      ).catch(() => {});
      return json(500, { error: "Database error" });
    }

    return json(200, {
      success: true,
      domain,
      cname_target: CNAME_TARGET,
      ownership_token: ownershipToken,
      ssl_status: sslStatus,
    });
  } catch (err) {
    console.error("[add-domain] Unexpected error:", err);
    return json(500, { error: "Internal error" });
  }
});
