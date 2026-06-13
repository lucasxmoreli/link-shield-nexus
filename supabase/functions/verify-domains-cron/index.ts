// =============================================================================
// EDGE FUNCTION: verify-domains-cron (v4 — hardened: retry/backoff, sanitized errors)
// =============================================================================
// Roda em background (via cron scheduler), varre dominios pendentes e verifica
// CNAME + SSL. Usa a mesma logica do verify-domain mas em batch.
//
// v4 changes (vs v3):
//   - Retry with exponential backoff + jitter on transient CF/DNS failures
//   - AbortController timeout (8s per attempt) on all external requests
//   - Sanitized error responses (caller is internal cron, but still no leak)
//   - Structured logging with [verify-cron] prefix + per-domain categorization
//   - Per-domain isolation: failure on one domain does NOT abort the batch
// =============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CNAME_TARGET = (Deno.env.get("CLOAKERX_CNAME_TARGET") || "cname.cloakerx.com").toLowerCase();
const stripTrailingDot = (s: string) => s.replace(/\.$/, "").toLowerCase();

// =============================================================================
// SHARED HELPERS — KEEP IN SYNC WITH delete-domain/index.ts
// =============================================================================

// Sleep with jitter (±20% of base) — prevents thundering herd if multiple
// retries align on the same clock boundary.
const sleepWithJitter = (baseMs: number): Promise<void> => {
  const jitter = baseMs * 0.2 * (Math.random() * 2 - 1);
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, baseMs + jitter)));
};

const isRetryableStatus = (status: number): boolean => {
  if (status === 408) return true;
  if (status === 429) return false;
  if (status >= 500 && status <= 599) return true;
  return false;
};

interface RetryableFetchResult {
  response?: Response;
  networkError?: Error;
  attempts: number;
}

const fetchWithRetry = async (
  url: string,
  init: RequestInit,
  opts: { timeoutMs?: number; maxAttempts?: number; logPrefix?: string } = {}
): Promise<RetryableFetchResult> => {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const maxAttempts = opts.maxAttempts ?? 3;
  const logPrefix = opts.logPrefix ?? "[verify-cron]";
  const backoffBases = [500, 1500];

  let lastNetworkError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeoutHandle);

      if (!isRetryableStatus(response.status) && response.status >= 400) {
        return { response, attempts: attempt };
      }

      if (response.ok) {
        return { response, attempts: attempt };
      }

      if (attempt < maxAttempts) {
        try { await response.text(); } catch { /* ignore */ }
        console.warn(`${logPrefix} transient ${response.status} on attempt ${attempt}/${maxAttempts}, retrying...`);
        await sleepWithJitter(backoffBases[attempt - 1]);
        continue;
      }

      return { response, attempts: attempt };
    } catch (err) {
      clearTimeout(timeoutHandle);
      lastNetworkError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxAttempts) {
        console.warn(`${logPrefix} network error on attempt ${attempt}/${maxAttempts}: ${lastNetworkError.message}, retrying...`);
        await sleepWithJitter(backoffBases[attempt - 1]);
        continue;
      }
      return { networkError: lastNetworkError, attempts: attempt };
    }
  }

  return { networkError: lastNetworkError || new Error("retry loop exhausted"), attempts: maxAttempts };
};

// DCV token extractor — mirror of the helper in add-domain and verify-domain.
// KEEP IN SYNC. Returns all possible SSL validation tokens Cloudflare may provide.
const extractDcvTokens = (cfHostname: any) => {
  const ssl = cfHostname?.ssl || {};

  const dcvRecord = Array.isArray(ssl.dcv_delegation_records) && ssl.dcv_delegation_records.length > 0
    ? ssl.dcv_delegation_records[0]
    : null;
  const dcvCnameName = dcvRecord?.cname || null;
  const dcvCnameTarget = dcvRecord?.cname_target || null;

  const validationRecord = Array.isArray(ssl.validation_records) && ssl.validation_records.length > 0
    ? ssl.validation_records[0]
    : null;
  const sslTxtName = validationRecord?.txt_name || ssl.txt_name || null;
  const sslTxtValue = validationRecord?.txt_value || ssl.txt_value || null;

  const ownershipToken = cfHostname?.ownership_verification?.value || null;

  return { dcvCnameName, dcvCnameTarget, sslTxtName, sslTxtValue, ownershipToken };
};

// =============================================================================
// MAIN HANDLER
// =============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── Cron authentication via shared secret ──
  // This endpoint is NOT user-facing — it's called by a scheduled job.
  // The CRON_SECRET acts as a shared bearer token between scheduler and function.
  const cronSecret = Deno.env.get("CRON_SECRET");
  const authHeader = req.headers.get("Authorization");
  if (!cronSecret || !authHeader || authHeader !== `Bearer ${cronSecret}`) {
    // Generic 401 — don't reveal whether secret was missing, wrong, or misformatted.
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: domains, error: fetchError } = await supabase
      .from("domains")
      .select("*")
      .eq("is_verified", false)
      .limit(50);

    if (fetchError) {
      console.error("[verify-cron] Failed to fetch domains:", fetchError);
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
    const cfReady = !!(cfZoneId && cfToken);

    if (!cfReady) {
      console.error("[verify-cron] CF secrets not configured — will only check CNAME, skip SSL and DCV backfill");
    }

    // Batch accumulators — aggregated at the end for the response body and final log.
    let verifiedCount = 0;
    let updatedCount = 0;
    let backfilledCount = 0;
    let skippedDnsCount = 0;
    let skippedCfCount = 0;
    let dbUpdateErrors = 0;

    // Per-domain isolation: wrap each domain in its own try/catch so a failure
    // on one doesn't abort the entire batch.
    for (const domain of domains) {
      try {
        const hostname = domain.url.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();

        // ── DNS check with retry ──
        let cnameOk = false;
        const dnsResult = await fetchWithRetry(
          `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=CNAME`,
          { method: "GET" },
          { timeoutMs: 5000, maxAttempts: 3, logPrefix: `[verify-cron] dns ${hostname}` }
        );

        if (dnsResult.networkError) {
          console.warn(`[verify-cron] DNS lookup failed for ${hostname} after retries: ${dnsResult.networkError.message}`);
          skippedDnsCount++;
          continue;
        }

        if (dnsResult.response && dnsResult.response.ok) {
          try {
            const dnsData = await dnsResult.response.json();
            if (dnsData.Answer && Array.isArray(dnsData.Answer)) {
              for (const answer of dnsData.Answer) {
                if (answer.type === 5 && stripTrailingDot(answer.data || "") === CNAME_TARGET) {
                  cnameOk = true;
                  break;
                }
              }
            }
          } catch (parseErr) {
            console.warn(`[verify-cron] DNS response parse failed for ${hostname}`);
            skippedDnsCount++;
            continue;
          }
        } else {
          skippedDnsCount++;
          continue;
        }

        // ── CF API check with retry (if CF configured and domain has hostname ID) ──
        let sslStatus = domain.ssl_status || "pending_validation";
        let cfActive = false;
        let cfErrors: string | null = null;
        let capturedTokens: ReturnType<typeof extractDcvTokens> | null = null;

        if (cfReady && domain.cloudflare_hostname_id) {
          const cfResult = await fetchWithRetry(
            `https://api.cloudflare.com/client/v4/zones/${cfZoneId}/custom_hostnames/${domain.cloudflare_hostname_id}`,
            {
              method: "GET",
              headers: {
                "Authorization": `Bearer ${cfToken!}`,
                "Content-Type": "application/json",
              },
            },
            { timeoutMs: 8000, maxAttempts: 3, logPrefix: `[verify-cron] cf ${hostname}` }
          );

          if (cfResult.networkError) {
            console.warn(`[verify-cron] CF API failed for ${hostname} after retries: ${cfResult.networkError.message}`);
            skippedCfCount++;
            // Don't `continue` — we still want to update the domain with
            // whatever CNAME data we have, just without SSL status refresh.
          } else if (cfResult.response) {
            try {
              const cfData = await cfResult.response.json();
              if (cfData.success) {
                sslStatus = cfData.result?.ssl?.status || "pending_validation";
                cfActive = cfData.result?.status === "active" && sslStatus === "active";
                const validationErrors = cfData.result?.ssl?.validation_errors;
                if (validationErrors && validationErrors.length > 0) {
                  // Internal log gets full details; DB only gets concatenated message.
                  cfErrors = validationErrors.map((e: any) => e.message).join("; ");
                }
                capturedTokens = extractDcvTokens(cfData.result);
              } else {
                const cfCode = cfData.errors?.[0]?.code;
                console.warn(`[verify-cron] CF returned success=false for ${hostname} cf_code=${cfCode}`);
                skippedCfCount++;
              }
            } catch (parseErr) {
              console.warn(`[verify-cron] CF response parse failed for ${hostname}`);
              skippedCfCount++;
            }
          }
        }

        // ── Build update payload ──
        const verified = cnameOk && cfActive;
        const updatePayload: Record<string, unknown> = {
          ssl_status: sslStatus,
          verification_errors: cfErrors,
        };
        if (verified) updatePayload.is_verified = true;

        // DCV backfill — only fill empty columns, never overwrite
        if (capturedTokens) {
          let backfilled = false;
          if (!domain.dcv_cname_name && capturedTokens.dcvCnameName) {
            updatePayload.dcv_cname_name = capturedTokens.dcvCnameName;
            backfilled = true;
          }
          if (!domain.dcv_cname_target && capturedTokens.dcvCnameTarget) {
            updatePayload.dcv_cname_target = capturedTokens.dcvCnameTarget;
            backfilled = true;
          }
          if (!domain.ssl_txt_name && capturedTokens.sslTxtName) {
            updatePayload.ssl_txt_name = capturedTokens.sslTxtName;
            backfilled = true;
          }
          if (!domain.ssl_txt_value && capturedTokens.sslTxtValue) {
            updatePayload.ssl_txt_value = capturedTokens.sslTxtValue;
            backfilled = true;
          }
          if (!domain.ownership_token && capturedTokens.ownershipToken) {
            updatePayload.ownership_token = capturedTokens.ownershipToken;
            backfilled = true;
          }
          if (backfilled) backfilledCount++;
        }

        // ── Apply update ──
        const { error: updateError } = await supabase
          .from("domains")
          .update(updatePayload)
          .eq("id", domain.id);

        if (updateError) {
          dbUpdateErrors++;
          console.error(`[verify-cron] DB update failed for ${hostname}:`, updateError.message);
          continue;
        }

        updatedCount++;
        if (verified) verifiedCount++;
      } catch (perDomainErr) {
        // Any unexpected failure in the per-domain block — log and move on.
        dbUpdateErrors++;
        console.error(`[verify-cron] Unexpected per-domain failure for ${domain.url}:`, perDomainErr);
      }
    }

    // Structured batch summary for observability dashboards.
    console.log(
      `[verify-cron] batch_complete checked=${domains.length} updated=${updatedCount} verified=${verifiedCount} backfilled=${backfilledCount} skipped_dns=${skippedDnsCount} skipped_cf=${skippedCfCount} db_errors=${dbUpdateErrors}`
    );

    return new Response(
      JSON.stringify({
        checked: domains.length,
        updated: updatedCount,
        verified: verifiedCount,
        backfilled: backfilledCount,
        skipped_dns: skippedDnsCount,
        skipped_cf: skippedCfCount,
        db_errors: dbUpdateErrors,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[verify-cron] Unexpected top-level error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});