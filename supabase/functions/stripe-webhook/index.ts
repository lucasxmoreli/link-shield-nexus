// =============================================================================
// EDGE FUNCTION: stripe-webhook
// =============================================================================
// Recebe eventos do Stripe, valida assinatura criptografica e atualiza
// profiles + cria invoices de forma idempotente.
//
// Requer secrets:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET (whsec_...)
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

// CORS basico (Stripe nao precisa, mas mantemos por consistencia)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// ─────────────────────────────────────────────────────────────────────────────
// Mapeamento de price_id → plano interno
// CRITICO: copie EXATAMENTE os mesmos price IDs do plan-config.ts
// ─────────────────────────────────────────────────────────────────────────────
const PRICE_TO_PLAN: Record<string, { plan_name: string; max_clicks: number; max_domains: number }> = {
  "price_1TLVRnLZEOji6sEJnw9oiVW2": { plan_name: "BASIC PLAN", max_clicks: 20000, max_domains: 3 },
  "price_1TLVSrLZEOji6sEJ8sF00dTT": { plan_name: "PRO PLAN", max_clicks: 100000, max_domains: 10 },
  "price_1TLVTYLZEOji6sEJ0mzIvzme": { plan_name: "FREEDOM PLAN", max_clicks: 300000, max_domains: 20 },
  "price_1TLVULLZEOji6sEJ4VyuhzMF": { plan_name: "ENTERPRISE CONQUEST", max_clicks: 1000000, max_domains: 25 },
};

const FREE_PLAN = { plan_name: "FREE", max_clicks: 0, max_domains: 0 };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    console.error("[stripe-webhook] Missing secrets");
    return new Response("Server misconfigured", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  });

  // ── 1. Validar assinatura ──
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    console.warn("[stripe-webhook] Missing stripe-signature header");
    return new Response("Missing signature", { status: 400 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  // ── 2. Idempotencia: gravar event_id antes de processar ──
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { error: dedupError } = await admin
    .from("stripe_events")
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      payload_summary: { type: event.type, created: event.created },
    });

  if (dedupError) {
    if (dedupError.code === "23505") {
      // UNIQUE violation — evento ja processado
      console.log(`[stripe-webhook] Event ${event.id} already processed, skipping`);
      return new Response("Already processed", { status: 200 });
    }
    console.error("[stripe-webhook] Failed to record event:", dedupError);
    return new Response("Internal error", { status: 500 });
  }

  // ── 3. Roteador de eventos ──
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(stripe, admin, event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(admin, event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(admin, event.data.object as Stripe.Subscription);
        break;
      case "invoice.paid":
        await handleInvoicePaid(admin, event.id, event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await handleInvoiceFailed(admin, event.id, event.data.object as Stripe.Invoice);
        break;
      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }
  } catch (handlerError) {
    console.error(`[stripe-webhook] Handler failed for ${event.type}:`, handlerError);
    // Apaga o registro de idempotencia pra permitir retry do Stripe
    await admin.from("stripe_events").delete().eq("stripe_event_id", event.id);
    return new Response("Handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

async function findUserId(
  admin: ReturnType<typeof createClient>,
  customerId: string,
  metadataUserId?: string
): Promise<string | null> {
  // Prioridade 1: metadata (set pela create-checkout-session)
  if (metadataUserId) return metadataUserId;

  // Prioridade 2: lookup por stripe_customer_id no profiles
  const { data, error } = await admin
    .from("profiles")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .single();

  if (error || !data) {
    console.error(`[findUserId] No user found for customer ${customerId}`);
    return null;
  }
  return data.user_id;
}

async function handleCheckoutCompleted(
  stripe: Stripe,
  admin: ReturnType<typeof createClient>,
  session: Stripe.Checkout.Session
) {
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;
  const userId = await findUserId(admin, customerId, session.metadata?.supabase_user_id);
  if (!userId) throw new Error(`No user for customer ${customerId}`);

  // Buscar a subscription completa pra pegar o price_id real
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price.id;
  const planConfig = priceId ? PRICE_TO_PLAN[priceId] : null;

  if (!planConfig) {
    throw new Error(`Unknown price_id: ${priceId}`);
  }

  await admin
    .from("profiles")
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      stripe_price_id: priceId,
      plan_name: planConfig.plan_name,
      max_clicks: planConfig.max_clicks,
      max_domains: planConfig.max_domains,
      current_clicks: 0,
      subscription_status: subscription.status,
      is_suspended: false,
      billing_cycle_start: new Date(subscription.current_period_start * 1000).toISOString(),
      billing_cycle_end: new Date(subscription.current_period_end * 1000).toISOString(),
    })
    .eq("user_id", userId);

  console.log(`[checkout.completed] User ${userId} -> ${planConfig.plan_name}`);
}

async function handleSubscriptionUpdated(
  admin: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;
  const userId = await findUserId(admin, customerId, subscription.metadata?.supabase_user_id);
  if (!userId) throw new Error(`No user for customer ${customerId}`);

  const priceId = subscription.items.data[0]?.price.id;
  const planConfig = priceId ? PRICE_TO_PLAN[priceId] : null;
  if (!planConfig) throw new Error(`Unknown price_id: ${priceId}`);

  // Detecta se status mudou pra suspended
  const isSuspended = ["past_due", "unpaid", "canceled", "incomplete_expired"].includes(subscription.status);

  await admin
    .from("profiles")
    .update({
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      plan_name: planConfig.plan_name,
      max_clicks: planConfig.max_clicks,
      max_domains: planConfig.max_domains,
      subscription_status: subscription.status,
      is_suspended: isSuspended,
      billing_cycle_start: new Date(subscription.current_period_start * 1000).toISOString(),
      billing_cycle_end: new Date(subscription.current_period_end * 1000).toISOString(),
    })
    .eq("user_id", userId);

  console.log(`[subscription.updated] User ${userId} -> status ${subscription.status}`);
}

async function handleSubscriptionDeleted(
  admin: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;
  const userId = await findUserId(admin, customerId, subscription.metadata?.supabase_user_id);
  if (!userId) throw new Error(`No user for customer ${customerId}`);

  // Downgrade para FREE — preserva stripe_customer_id pra futuras compras
  await admin
    .from("profiles")
    .update({
      stripe_subscription_id: null,
      stripe_price_id: null,
      plan_name: FREE_PLAN.plan_name,
      max_clicks: FREE_PLAN.max_clicks,
      max_domains: FREE_PLAN.max_domains,
      subscription_status: "canceled",
      is_suspended: true,
      billing_cycle_end: new Date().toISOString(),
    })
    .eq("user_id", userId);

  console.log(`[subscription.deleted] User ${userId} downgraded to FREE`);
}

async function handleInvoicePaid(
  admin: ReturnType<typeof createClient>,
  eventId: string,
  invoice: Stripe.Invoice
) {
  const customerId = invoice.customer as string;
  const userId = await findUserId(admin, customerId);
  if (!userId) throw new Error(`No user for customer ${customerId}`);

  // Snapshot historico (idempotente via stripe_invoice_id UNIQUE)
  await admin.from("invoices").upsert({
    user_id: userId,
    stripe_invoice_id: invoice.id,
    stripe_event_id: eventId,
    billing_period_start: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
    billing_period_end: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
    plan_name: invoice.lines.data[0]?.description || "unknown",
    base_amount_cents: invoice.subtotal,
    total_amount_cents: invoice.total,
    currency: invoice.currency,
    status: "paid",
    paid_at: new Date().toISOString(),
    hosted_invoice_url: invoice.hosted_invoice_url,
  }, { onConflict: "stripe_invoice_id" });

  console.log(`[invoice.paid] User ${userId} -> ${invoice.id}`);
}

async function handleInvoiceFailed(
  admin: ReturnType<typeof createClient>,
  eventId: string,
  invoice: Stripe.Invoice
) {
  const customerId = invoice.customer as string;
  const userId = await findUserId(admin, customerId);
  if (!userId) throw new Error(`No user for customer ${customerId}`);

  await admin.from("invoices").upsert({
    user_id: userId,
    stripe_invoice_id: invoice.id,
    stripe_event_id: eventId,
    plan_name: invoice.lines.data[0]?.description || "unknown",
    base_amount_cents: invoice.subtotal,
    total_amount_cents: invoice.total,
    currency: invoice.currency,
    status: "failed",
    hosted_invoice_url: invoice.hosted_invoice_url,
  }, { onConflict: "stripe_invoice_id" });

  console.warn(`[invoice.failed] User ${userId} -> ${invoice.id}`);
}