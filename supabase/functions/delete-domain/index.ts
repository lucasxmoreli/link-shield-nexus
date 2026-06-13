// =============================================================================
// EDGE FUNCTION: delete-domain (v3 — hardened: retry/backoff, UUID validation, sanitized errors)
// =============================================================================
// Deleta dominio do banco E do Cloudflare for SaaS (custom hostname).
//
// Politica: CF delete e best-effort.
//   - Se o hostname nao existe mais na CF (404), considera sucesso idempotente.
//   - Se a chamada falhar por outro motivo (apos retries), NAO bloqueia a
//     deletacao no banco — o importante para o usuario e liberar o slot do
//     plano. O erro e logado estruturadamente para o admin investigar.
//
// v3 changes (vs v2):
//   - Retry with exponential backoff + jitter on transient CF failures (5xx, network)
//   - AbortController timeout (8s per attempt) on all CF requests
//   - Strict UUID v4 validation on domain_id input
//   - Sanitized error responses (never leak internal/CF/Postgres details to client)
//   - Structured logging with [delete-domain] prefix + error categorization
// =============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// =============================================================================
// SHARED HELPERS — KEEP IN SYNC WITH verify-domains-cron/index.ts
// =============================================================================

// Strict UUID (v1-v5) validator. Rejects anything that isn't a well-formed
// 8-4-4-4-12 hex string. Used to prevent injection attempts and catch bugs
// in the frontend sending undefined/null/non-string values.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isValidUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID_REGEX.test(value);

// Client-facing error codes — stable enum for frontend categorization.
// NEVER add error codes that leak internal details (e.g. "postgres_error",
// "cloudflare_10001"). Keep this list small and generic.
type ClientErrorCode =
  | "unauthorized"
  | "invalid_input"
  | "not_found"
  | "forbidden"
  | "upstream_error"
  | "internal_error";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Sanitized error response. The `message` is a short, generic string safe for
// end users. Full details go to console.error for admin investigation only.
const errorResponse = (
  status: number,
  code: ClientErrorCode,
  message: string,
  internalDetails?: unknown
) => {
  if (internalDetails !== undefined) {
    // Log full context internally — includes stack, raw objects, CF payloads.
    // This is the only place where internal details should ever surface.
    console.error(`[delete-domain] error_code=${code} status=${status}`, internalDetails);
  }
  return json(status, { error: message, code });
};

// Sleep with jitter (±20% of base) — used between retry attempts to prevent
// thundering herd if multiple requests all retry at exactly the same intervals.
const sleepWithJitter = (baseMs: number): Promise<void> => {
  const jitter = baseMs * 0.2 * (Math.random() * 2 - 1); // ±20%
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, baseMs + jitter)));
};

// Classify an HTTP response as retryable. Transient failures (5xx, 408, 429)
// are worth retrying with backoff. Determinstic failures (4xx except above)
// should never be retried — they won't change.
const isRetryableStatus = (status: number): boolean => {
  if (status === 408) return true; // Request Timeout
  if (status === 429) return false; // Rate limited — retry would make it worse
  if (status >= 500 && status <= 599) return true; // 5xx server errors
  return false;
};

// Fetch with timeout + exponential backoff retry. Only retries on transient
// failures (network errors, timeouts, 5xx). Never retries on 4xx (determinstic).
//
// Config: 3 total attempts (1 initial + 2 retries), 8s timeout per attempt,
// backoff delays ~500ms then ~1500ms with jitter. Worst case: ~26s total.
interface RetryableFetchResult {
  response?: Response;
  networkError?: Error;
  attempts: number;
}

const fetchWithRetry = async (
  url: string,
  init: RequestInit,
  opts: { timeoutMs?: number; maxAttempts?: number } = {}
): Promise<RetryableFetchResult> => {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const maxAttempts = opts.maxAttempts ?? 3;
  const backoffBases = [500, 1500]; // ms between attempts 1→2 and 2→3

  let lastNetworkError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeoutHandle);

      // Determinstic failure — return immediately, no retry.
      if (!isRetryableStatus(response.status) && response.status >= 400) {
        return { response, attempts: attempt };
      }

      // Success — return immediately.
      if (response.ok) {
        return { response, attempts: attempt };
      }

      // Retryable server failure — consume body (to free connection) and retry if attempts remain.
      if (attempt < maxAttempts) {
        try { await response.text(); } catch { /* ignore */ }
        console.warn(`[delete-domain] CF transient ${response.status} on attempt ${attempt}/${maxAttempts}, retrying...`);
        await sleepWithJitter(backoffBases[attempt - 1]);
        continue;
      }

      // Out of retries — return the last bad response.
      return { response, attempts: attempt };
    } catch (err) {
      clearTimeout(timeoutHandle);
      lastNetworkError = err instanceof Error ? err : new Error(String(err));

      // AbortError means timeout — treated as retryable.
      // Other errors (DNS fail, TCP reset, TLS) also retryable.
      if (attempt < maxAttempts) {
        console.warn(`[delete-domain] CF network error on attempt ${attempt}/${maxAttempts}: ${lastNetworkError.message}, retrying...`);
        await sleepWithJitter(backoffBases[attempt - 1]);
        continue;
      }
      return { networkError: lastNetworkError, attempts: attempt };
    }
  }

  // Unreachable, but TypeScript doesn't know that.
  return { networkError: lastNetworkError || new Error("retry loop exhausted"), attempts: maxAttempts };
};

// =============================================================================
// MAIN HANDLER
// =============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── Auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse(401, "unauthorized", "Authentication required");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return errorResponse(401, "unauthorized", "Authentication required", authError);
    }

    // ── Parse and validate input ──
    let body: unknown;
    try {
      body = await req.json();
    } catch (parseErr) {
      return errorResponse(400, "invalid_input", "Invalid request body", parseErr);
    }

    const domain_id = (body as { domain_id?: unknown })?.domain_id;
    if (!isValidUuid(domain_id)) {
      // Intentionally vague — don't reveal whether input was missing, wrong type, or malformed UUID.
      return errorResponse(400, "invalid_input", "Invalid domain identifier");
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ── Fetch domain and verify ownership ──
    const { data: domain, error: fetchError } = await adminClient
      .from("domains")
      .select("id, url, user_id, cloudflare_hostname_id")
      .eq("id", domain_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError) {
      return errorResponse(500, "internal_error", "Could not process request", fetchError);
    }

    if (!domain) {
      // Same error for "not found" and "not owned by this user" — prevents
      // enumeration of domain IDs belonging to other tenants.
      return errorResponse(404, "not_found", "Domain not found");
    }

    // ── Delete from Cloudflare (best-effort, non-blocking) ──
    let cfDeleted = false;
    let cfWarningInternal: string | null = null;

    if (domain.cloudflare_hostname_id) {
      const cfZoneId = Deno.env.get("CLOUDFLARE_ZONE_ID");
      const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN");

      if (cfZoneId && cfToken) {
        const result = await fetchWithRetry(
          `https://api.cloudflare.com/client/v4/zones/${cfZoneId}/custom_hostnames/${domain.cloudflare_hostname_id}`,
          {
            method: "DELETE",
            headers: {
              "Authorization": `Bearer ${cfToken}`,
              "Content-Type": "application/json",
            },
          },
          { timeoutMs: 8000, maxAttempts: 3 }
        );

        if (result.networkError) {
          cfWarningInternal = `network: ${result.networkError.message} (${result.attempts} attempts)`;
          console.error(`[delete-domain] CF delete network failure after retries | hostname_id=${domain.cloudflare_hostname_id} attempts=${result.attempts} err=${result.networkError.message}`);
        } else if (result.response) {
          const cfResponse = result.response;

          // Idempotent success — hostname already gone.
          if (cfResponse.status === 404) {
            cfDeleted = true;
            console.log(`[delete-domain] CF hostname already gone (404 idempotent) | hostname_id=${domain.cloudflare_hostname_id} attempts=${result.attempts}`);
          } else {
            // Try to parse JSON body. If CF returned non-JSON on an error path, fall back gracefully.
            let cfData: any = null;
            try {
              cfData = await cfResponse.json();
            } catch {
              cfWarningInternal = `non-json response status=${cfResponse.status}`;
            }

            if (cfData?.success) {
              cfDeleted = true;
              console.log(`[delete-domain] CF hostname deleted | hostname_id=${domain.cloudflare_hostname_id} attempts=${result.attempts}`);
            } else if (cfData) {
              const cfCode = cfData.errors?.[0]?.code;
              const cfMessage = cfData.errors?.[0]?.message || "unknown";
              cfWarningInternal = `cf_code=${cfCode} cf_message=${cfMessage}`;
              console.warn(`[delete-domain] CF delete non-success | hostname_id=${domain.cloudflare_hostname_id} ${cfWarningInternal}`);
            } else {
              console.warn(`[delete-domain] CF delete non-json | hostname_id=${domain.cloudflare_hostname_id} status=${cfResponse.status}`);
            }
          }
        }
      } else {
        cfWarningInternal = "cf_secrets_missing";
        console.error(`[delete-domain] Missing CF secrets — hostname will be orphaned | hostname_id=${domain.cloudflare_hostname_id}`);
      }
    }

    // ── Delete from database (always proceed, even if CF failed) ──
    const { error: deleteError } = await adminClient
      .from("domains")
      .delete()
      .eq("id", domain_id)
      .eq("user_id", user.id);

    if (deleteError) {
      return errorResponse(500, "internal_error", "Could not process request", deleteError);
    }

    // ── Success response — sanitized, no internal warning details ──
    // The client sees only: success flag, cleaned url, and whether CF deletion worked.
    // cfWarningInternal is NEVER returned to the client — admins see it in logs.
    return json(200, {
      success: true,
      url: domain.url,
      cf_deleted: cfDeleted,
    });
  } catch (err) {
    return errorResponse(500, "internal_error", "Could not process request", err);
  }
});