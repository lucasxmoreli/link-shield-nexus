// =============================================================================
// EDGE FUNCTION: sync-usage-stripe
// =============================================================================
// Sprint 1 — Item 4.2: corrigido double-billing em cron concorrente.
//
// Fluxo POR USER (agora seguro contra race):
//   1. Chama RPC `reserve_usage_report` → advisory lock transacional
//      atomiza leitura do HWM + inserção da claim.
//   2. Se RPC retornar claim_id + delta > 0, chama Stripe com o delta.
//   3. UPDATE na claim com o stripe_identifier (success) ou com erro (failed).
//
// Invariantes:
//   • Se dois crons rodarem ao mesmo tempo, um pega o lock e cria a claim;
//     o outro vê o novo HWM e retorna 'already_reported'.
//   • Se Stripe falhar, a claim fica marcada 'failed' mas o HWM permanece —
//     a próxima execução verá delta = overage - HWM_da_claim_failed = 0
//     e vai pular (evitando spam de retry). Ajuste manual resolve casos edge.
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17.5.0";

// ─── CORS Allowlist (menos crítico aqui — auth via CRON_SECRET) ────
const ALLOWED_ORIGINS = [
  "https://www.cloakerx.com",
  "https://cloakerx.com",
  "http://localhost:5173",
  "http://localhost:8080",
];

const VERCEL_PREVIEW_REGEX = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;

function getCorsHeaders(origin: string | null) {
  if (!origin) {
    return {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    };
  }
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || VERCEL_PREVIEW_REGEX.test(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const METER_EVENT_NAME = "cloakerx_clicks";

interface ReserveResult {
  claim_id: string | null;
  delta_to_report: number;
  hwm_before: number;
  overage_now: number;
  skipped_reason: string | null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ─── Auth via CRON_SECRET ──────────────────────────────────────────
  const cronSecret = Deno.env.get("CRON_SECRET");
  const authHeader = req.headers.get("Authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });

  // ─── Busca candidatos a reporte ───────────────────────────────────
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("user_id, current_clicks, max_clicks, stripe_customer_id, billing_cycle_end, is_suspended")
    .not("stripe_customer_id", "is", null)
    .not("max_clicks", "is", null);

  if (error) {
    console.error("[sync-usage] Failed to fetch profiles:", error);
    return new Response(JSON.stringify({ error: "DB error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log(`[sync-usage] ========== START ==========`);
  console.log(`[sync-usage] Total profiles retornados pela query: ${profiles?.length ?? 0}`);

  let reported = 0, skipped = 0, failed = 0, lockedOut = 0;

  for (const p of profiles || []) {
    console.log(`[sync-usage] --- Profile ${p.user_id} ---`);

    if (p.is_suspended) {
      console.log(`[sync-usage] >>> SKIP: is_suspended=true`);
      skipped++;
      continue;
    }

    // ─────────────────────────────────────────────────────────────
    // FASE 1: reserva atômica via RPC (advisory lock transacional)
    // ─────────────────────────────────────────────────────────────
    const { data: reserveRows, error: reserveErr } = await admin.rpc("reserve_usage_report", {
      p_user_id: p.user_id,
      p_period_end: p.billing_cycle_end,
      p_current_clicks: p.current_clicks ?? 0,
      p_max_clicks: p.max_clicks ?? 0,
    });

    if (reserveErr) {
      console.error(`[sync-usage] RPC reserve_usage_report falhou pro user ${p.user_id}:`, reserveErr);
      failed++;
      continue;
    }

    // RPC retorna SETOF → pega primeira linha
    const reserve: ReserveResult | undefined = Array.isArray(reserveRows) ? reserveRows[0] : reserveRows;

    if (!reserve) {
      console.error(`[sync-usage] RPC retornou vazio pro user ${p.user_id}`);
      failed++;
      continue;
    }

    console.log(
      `[sync-usage] reserve: claim=${reserve.claim_id} delta=${reserve.delta_to_report} ` +
      `hwm=${reserve.hwm_before} overage=${reserve.overage_now} reason=${reserve.skipped_reason}`,
    );

    if (reserve.skipped_reason === "locked_by_another_run") {
      lockedOut++;
      continue;
    }

    if (!reserve.claim_id || reserve.delta_to_report <= 0) {
      // no_overage | already_reported — fluxo normal, só pular
      skipped++;
      continue;
    }

    // ─────────────────────────────────────────────────────────────
    // FASE 2: chamar Stripe (já temos claim reservada no banco)
    // ─────────────────────────────────────────────────────────────
    console.log(`[sync-usage] >>> REPORTING ${reserve.delta_to_report} clicks to Stripe (claim ${reserve.claim_id})`);

    try {
      // IMPORTANTE: chave "click" (não "value") porque o Meter no Stripe
      // está configurado com "Sobreposição de chave de valor" = click
      const meterEvent = await stripe.billing.meterEvents.create({
        event_name: METER_EVENT_NAME,
        payload: {
          click: String(reserve.delta_to_report),
          stripe_customer_id: p.stripe_customer_id!,
        },
      });

      // ─── FASE 3: marca claim como success ───────────────────────
      await admin
        .from("usage_report_log")
        .update({
          stripe_response: {
            status: "success",
            identifier: meterEvent.identifier,
            value: reserve.delta_to_report,
            reported_at: new Date().toISOString(),
          },
        })
        .eq("id", reserve.claim_id);

      reported++;
      console.log(`[sync-usage] >>> REPORTED OK. Stripe identifier: ${meterEvent.identifier}`);
    } catch (err: any) {
      // Stripe falhou — marca claim como failed mas MANTÉM o HWM.
      // Próximo cron verá o HWM e não vai tentar de novo automaticamente
      // (evita retry loop batendo no Stripe). Requer investigação manual.
      failed++;
      console.error(`[sync-usage] >>> FAILED for user ${p.user_id}:`, err);

      await admin
        .from("usage_report_log")
        .update({
          stripe_response: {
            status: "failed",
            error: err?.message ?? "Unknown Stripe error",
            delta_attempted: reserve.delta_to_report,
            failed_at: new Date().toISOString(),
          },
        })
        .eq("id", reserve.claim_id);
    }
  }

  console.log(`[sync-usage] ========== END ==========`);
  console.log(
    `[sync-usage] Summary: reported=${reported}, skipped=${skipped}, ` +
    `failed=${failed}, lockedOut=${lockedOut}, total=${profiles?.length ?? 0}`,
  );

  return new Response(
    JSON.stringify({
      reported,
      skipped,
      failed,
      locked_out: lockedOut,
      total: profiles?.length ?? 0,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
