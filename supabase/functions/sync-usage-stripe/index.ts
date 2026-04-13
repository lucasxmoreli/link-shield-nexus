import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const METER_EVENT_NAME = "cloakerx_clicks";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SECRET");
  const authHeader = req.headers.get("Authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const stripe = new Stripe(stripeKey, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  });

  // Busca profiles em possível overage
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("user_id, current_clicks, max_clicks, stripe_customer_id, billing_cycle_end, is_suspended")
    .not("stripe_customer_id", "is", null)
    .not("max_clicks", "is", null);

  if (error) {
    console.error("[sync-usage] Failed to fetch profiles:", error);
    return new Response(JSON.stringify({ error: "DB error" }), { status: 500 });
  }

  let reported = 0, skipped = 0, failed = 0;

  for (const p of profiles || []) {
    if (p.is_suspended) { skipped++; continue; }

    const currentClicks = p.current_clicks ?? 0;
    const maxClicks = p.max_clicks ?? 0;
    const overageNow = Math.max(0, currentClicks - maxClicks);

    if (overageNow === 0) { skipped++; continue; }

    // Quanto já reportamos nesse ciclo?
    const { data: lastReport } = await admin
      .from("usage_report_log")
      .select("clicks_reported")
      .eq("user_id", p.user_id)
      .gte("period_end", p.billing_cycle_end ?? "1970-01-01")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const alreadyReported = lastReport?.clicks_reported ?? 0;
    const deltaToReport = overageNow - alreadyReported;

    if (deltaToReport <= 0) { skipped++; continue; }

    try {
      // API nova: meter_events.create
      // Usa customer_id (não subscription_item_id) — o Stripe rotea pelo customer
      const meterEvent = await stripe.billing.meterEvents.create({
        event_name: METER_EVENT_NAME,
        payload: {
          value: String(deltaToReport),
          stripe_customer_id: p.stripe_customer_id!,
        },
      });

      // Grava cumulativo no log
      await admin.from("usage_report_log").insert({
        user_id: p.user_id,
        period_end: p.billing_cycle_end,
        clicks_reported: overageNow,
        stripe_response: { identifier: meterEvent.identifier, value: deltaToReport },
      });

      reported++;
      console.log(`[sync-usage] User ${p.user_id}: +${deltaToReport} clicks reported`);
    } catch (err) {
      failed++;
      console.error(`[sync-usage] Failed for user ${p.user_id}:`, err);
    }
  }

  return new Response(
    JSON.stringify({ reported, skipped, failed, total: profiles?.length ?? 0 }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});