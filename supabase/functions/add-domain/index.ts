// =============================================================================
// EDGE FUNCTION: add-domain (v2 — Delegated DCV capture)
// =============================================================================
// Recebe { url } do cliente, valida, cria Custom Hostname na Cloudflare for SaaS,
// captura Delegated DCV CNAME (preferido) + TXT fallback, salva no banco.
//
// Fluxo:
//   1. POST /custom_hostnames
//   2. Lê ssl.dcv_delegation_records[0] (preferido) e ssl.validation_records[0] (fallback)
//   3. Se ambos vazios, faz GET com delay 2s (retry 1)
//   4. Se ainda vazios, faz GET com delay 3s adicional (retry 2, total 5s)
//   5. Grava o que conseguiu no banco. verify-domain pega o resto depois se precisar.
//
// Requer secrets:
//   CLOUDFLARE_ZONE_ID, CLOUDFLARE_API_TOKEN
//   CLOAKERX_CNAME_TARGET (default: cname.cloakerx.com)
//
// v2 changes:
//   - Bearer Token auth (X-Auth-Key/X-Auth-Email deprecated per infra Pro upgrade)
//   - Captures dcv_delegation_records + validation_records with retry
//   - Stores new dcv_cname_name/target + ssl_txt_name/value columns
//   - Keeps ownership_token populated for backwards compat (not read by new UI)
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Extract DCV tokens from a Cloudflare custom hostname object.
// Returns { dcvCnameName, dcvCnameTarget, sslTxtName, sslTxtValue, ownershipToken }.
// Any of these may be null if Cloudflare hasn't populated them yet.
const extractDcvTokens = (cfHostname: any) => {
  const ssl = cfHostname?.ssl || {};

  // Preferred: Delegated DCV CNAME (permanent, no expiration).
  const dcvRecord = Array.isArray(ssl.dcv_delegation_records) && ssl.dcv_delegation_records.length > 0
    ? ssl.dcv_delegation_records[0]
    : null;
  const dcvCnameName = dcvRecord?.cname || null;
  const dcvCnameTarget = dcvRecord?.cname_target || null;

  // Fallback: TXT DCV (expires with cert).
  // API may expose this in two places: ssl.validation_records[0] or ssl.txt_name/txt_value directly.
  const validationRecord = Array.isArray(ssl.validation_records) && ssl.validation_records.length > 0
    ? ssl.validation_records[0]
    : null;
  const sslTxtName = validationRecord?.txt_name || ssl.txt_name || null;
  const sslTxtValue = validationRecord?.txt_value || ssl.txt_value || null;

  // Legacy: ownership_verification (UUID, kept for backwards compat).
  const ownershipToken = cfHostname?.ownership_verification?.value || null;

  return { dcvCnameName, dcvCnameTarget, sslTxtName, sslTxtValue, ownershipToken };
};

// Check if we got at least one usable token (either DCV CNAME or TXT fallback).
const hasUsableTokens = (tokens: ReturnType<typeof extractDcvTokens>): boolean => {
  return !!(tokens.dcvCnameTarget || tokens.sslTxtValue);
};

// Fetch custom hostname metadata from Cloudflare (used for retry).
const fetchCustomHostname = async (
  cfZoneId: string,
  cfToken: string,
  hostnameId: string
): Promise<any> => {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${cfZoneId}/custom_hostnames/${hostnameId}`,
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${cfToken}`,
        "Content-Type": "application/json",
      },
    }
  );
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.errors?.[0]?.message || "Cloudflare GET error");
  }
  return data.result;
};

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

    if (!cfZoneId || !cfToken) {
      console.error("[add-domain] Missing Cloudflare secrets");
      return json(500, { error: "Cloudflare not configured" });
    }

    const cfResponse = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${cfZoneId}/custom_hostnames`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${cfToken}`,
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
      return json(502, { error: `Cloudflare: ${errorMsg}` });
    }

    let cfHostname = cfData.result;
    const hostnameId = cfHostname.id;

    // ── Extract DCV tokens with retry ──
    // Cloudflare's POST response may not include validation_records / dcv_delegation_records
    // immediately. Per docs: "make a second GET command (with a delay) to retrieve these details".
    let tokens = extractDcvTokens(cfHostname);

    if (!hasUsableTokens(tokens)) {
      console.log(`[add-domain] POST response missing DCV tokens, retrying GET (attempt 1)`);
      await sleep(2000);
      try {
        cfHostname = await fetchCustomHostname(cfZoneId, cfToken, hostnameId);
        tokens = extractDcvTokens(cfHostname);
      } catch (err) {
        console.warn(`[add-domain] GET retry 1 failed: ${(err as Error).message}`);
      }
    }

    if (!hasUsableTokens(tokens)) {
      console.log(`[add-domain] Still missing DCV tokens, retrying GET (attempt 2)`);
      await sleep(3000);
      try {
        cfHostname = await fetchCustomHostname(cfZoneId, cfToken, hostnameId);
        tokens = extractDcvTokens(cfHostname);
      } catch (err) {
        console.warn(`[add-domain] GET retry 2 failed: ${(err as Error).message}`);
      }
    }

    if (!hasUsableTokens(tokens)) {
      // Not fatal — verify-domain will retry later when the client clicks "Verify".
      console.warn(`[add-domain] DCV tokens still empty after 2 retries. Hostname ${hostnameId} saved without tokens. User will need to click Verify to retry.`);
    } else {
      console.log(`[add-domain] DCV tokens captured: cname=${!!tokens.dcvCnameTarget} txt=${!!tokens.sslTxtValue}`);
    }

    const sslStatus = cfHostname.ssl?.status || "pending_validation";

    // ── Save to database ──
    const { data: domain, error: insertError } = await adminClient
      .from("domains")
      .insert({
        url: hostname,
        user_id: user.id,
        is_verified: false,
        cloudflare_hostname_id: hostnameId,
        ssl_status: sslStatus,
        ownership_token: tokens.ownershipToken,
        dcv_cname_name: tokens.dcvCnameName,
        dcv_cname_target: tokens.dcvCnameTarget,
        ssl_txt_name: tokens.sslTxtName,
        ssl_txt_value: tokens.sslTxtValue,
      })
      .select()
      .single();

    if (insertError) {
      // Rollback CF if DB insert failed
      console.error("[add-domain] DB insert failed, rolling back CF:", insertError);
      await fetch(
        `https://api.cloudflare.com/client/v4/zones/${cfZoneId}/custom_hostnames/${hostnameId}`,
        {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${cfToken}`,
          },
        }
      ).catch(() => {});
      return json(500, { error: "Database error" });
    }

    return json(200, {
      success: true,
      domain,
      cname_target: CNAME_TARGET,
      ssl_status: sslStatus,
    });
  } catch (err) {
    console.error("[add-domain] Unexpected error:", err);
    return json(500, { error: "Internal error" });
  }
});