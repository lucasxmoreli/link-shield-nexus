import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";

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

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

  let reported = 0, skipped = 0, failed = 0;

  for (const p of profiles || []) {
    console.log(`[sync-usage] --- Profile ${p.user_id} ---`);
    console.log(`[sync-usage] current_clicks: ${p.current_clicks}`);
    console.log(`[sync-usage] max_clicks: ${p.max_clicks}`);
    console.log(`[sync-usage] is_suspended: ${p.is_suspended}`);
    console.log(`[sync-usage] stripe_customer_id: ${p.stripe_customer_id}`);
    console.log(`[sync-usage] billing_cycle_end: ${p.billing_cycle_end}`);

    if (p.is_suspended) {
      console.log(`[sync-usage] >>> SKIP motivo: is_suspended=true`);
      skipped++;
      continue;
    }

    const currentClicks = p.current_clicks ?? 0;
    const maxClicks = p.max_clicks ?? 0;
    const overageNow = Math.max(0, currentClicks - maxClicks);

    console.log(`[sync-usage] overageNow calculado: ${overageNow} (${currentClicks} - ${maxClicks})`);

    if (overageNow === 0) {
      console.log(`[sync-usage] >>> SKIP motivo: overageNow=0 (current=${currentClicks}, max=${maxClicks})`);
      skipped++;
      continue;
    }

    const { data: lastReport, error: lastReportError } = await admin
      .from("usage_report_log")
      .select("clicks_reported")
      .eq("user_id", p.user_id)
      .gte("period_end", p.billing_cycle_end ?? "1970-01-01")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastReportError) {
      console.log(`[sync-usage] ERRO ao ler usage_report_log:`, lastReportError);
    }

    console.log(`[sync-usage] lastReport retornado: ${JSON.stringify(lastReport)}`);

    const alreadyReported = lastReport?.clicks_reported ?? 0;
    const deltaToReport = overageNow - alreadyReported;

    console.log(`[sync-usage] alreadyReported: ${alreadyReported}`);
    console.log(`[sync-usage] deltaToReport: ${deltaToReport}`);

    if (deltaToReport <= 0) {
      console.log(`[sync-usage] >>> SKIP motivo: deltaToReport<=0 (overage=${overageNow}, reported=${alreadyReported})`);
      skipped++;
      continue;
    }

    console.log(`[sync-usage] >>> REPORTING ${deltaToReport} clicks to Stripe...`);

    try {
      // IMPORTANTE: chave "click" (não "value") porque o Meter no Stripe
      // está configurado com "Sobreposição de chave de valor" = click
      const meterEvent = await stripe.billing.meterEvents.create({
        event_name: METER_EVENT_NAME,
        payload: {
          click: String(deltaToReport),
          stripe_customer_id: p.stripe_customer_id!,
        },
      });

      await admin.from("usage_report_log").insert({
        user_id: p.user_id,
        period_end: p.billing_cycle_end,
        clicks_reported: overageNow,
        stripe_response: { identifier: meterEvent.identifier, value: deltaToReport },
      });

      reported++;
      console.log(`[sync-usage] >>> REPORTED OK. Stripe identifier: ${meterEvent.identifier}`);
    } catch (err) {
      failed++;
      console.error(`[sync-usage] >>> FAILED for user ${p.user_id}:`, err);
    }
  }

  console.log(`[sync-usage] ========== END ==========`);
  console.log(`[sync-usage] Summary: reported=${reported}, skipped=${skipped}, failed=${failed}, total=${profiles?.length ?? 0}`);

  return new Response(
    JSON.stringify({ reported, skipped, failed, total: profiles?.length ?? 0 }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});