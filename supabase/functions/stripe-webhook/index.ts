import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// Mapa do price fixed → config interno do plano
const PRICE_TO_PLAN: Record<string, { plan_name: string; max_clicks: number; max_domains: number; max_campaigns: number }> = {
  "price_1TLVRnLZEOji6sEJnw9oiVW2": { plan_name: "BASIC PLAN",          max_clicks:    20000, max_domains:  3, max_campaigns:  5 },
  "price_1TLVSrLZEOji6sEJ8sF00dTT": { plan_name: "PRO PLAN",            max_clicks:   100000, max_domains: 10, max_campaigns: 20 },
  "price_1TLVTYLZEOji6sEJ0mzIvzme": { plan_name: "FREEDOM PLAN",        max_clicks:   300000, max_domains: 20, max_campaigns: 50 },
  "price_1TLVULLZEOji6sEJ4VyuhzMF": { plan_name: "ENTERPRISE CONQUEST", max_clicks:  1000000, max_domains: 25, max_campaigns: -1 },
};

// Mapa fixed → metered (auto-healing de subs antigas)
const PLAN_METERED_MAP: Record<string, string> = {
  "price_1TLVRnLZEOji6sEJnw9oiVW2": "price_1TLaNwLZEOji6sEJrtBFpRnn",
  "price_1TLVSrLZEOji6sEJ8sF00dTT": "price_1TLaHlLZEOji6sEJgKRRDuOh",
  "price_1TLVTYLZEOji6sEJ0mzIvzme": "price_1TLaP0LZEOji6sEJdV7XPaJb",
  "price_1TLVULLZEOji6sEJ4VyuhzMF": "price_1TLaR3LZEOji6sEJmagidXcF",
};

// Mapa de addon prices → tipo
const ADDON_PRICE_TO_TYPE: Record<string, "extra_domain" | "extra_campaign"> = {
  "price_1TMwsxLZEOji6sEJZj5yvPct": "extra_domain",
  "price_1TMwudLZEOji6sEJLY129lHV": "extra_campaign",
};

const FREE_PLAN = { plan_name: "FREE", max_clicks: 0, max_domains: 0, max_campaigns: 0 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    console.error("[stripe-webhook] Missing secrets");
    return new Response("Server misconfigured", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const rawBody = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Idempotência
  const { error: dedupError } = await admin
    .from("stripe_events")
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      payload_summary: { type: event.type, created: event.created },
    });

  if (dedupError) {
    if (dedupError.code === "23505") {
      console.log(`[stripe-webhook] Event ${event.id} already processed`);
      return new Response("Already processed", { status: 200 });
    }
    console.error("[stripe-webhook] Failed to record event:", dedupError);
    return new Response("Internal error", { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(stripe, admin, event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(stripe, admin, event.data.object as Stripe.Subscription);
        await syncSubscriptionAddons(admin, event.data.object as Stripe.Subscription);
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
    await admin.from("stripe_events").delete().eq("stripe_event_id", event.id);
    return new Response("Handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// ─────────────────────────────────────────────────────────────────────────────

async function findUserId(
  admin: ReturnType<typeof createClient>,
  customerId: string,
  metadataUserId?: string
): Promise<string | null> {
  if (metadataUserId) return metadataUserId;
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

function findPlanItem(subscription: Stripe.Subscription): Stripe.SubscriptionItem | null {
  for (const item of subscription.items.data) {
    const isMetered = item.price.recurring?.usage_type === "metered";
    const isAddon = !!ADDON_PRICE_TO_TYPE[item.price.id];
    if (!isMetered && !isAddon && PRICE_TO_PLAN[item.price.id]) {
      return item;
    }
  }
  return null;
}

function findMeteredItem(subscription: Stripe.Subscription): Stripe.SubscriptionItem | null {
  for (const item of subscription.items.data) {
    if (item.price.recurring?.usage_type === "metered") return item;
  }
  return null;
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

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const planItem = findPlanItem(subscription);
  const priceId = planItem?.price.id;
  const planConfig = priceId ? PRICE_TO_PLAN[priceId] : null;
  if (!planConfig) throw new Error(`Unknown price_id: ${priceId}`);

  const meteredItem = findMeteredItem(subscription);

  await admin
    .from("profiles")
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      stripe_price_id: priceId,
      stripe_overage_item_id: meteredItem?.id ?? null,
      plan_name: planConfig.plan_name,
      max_clicks: planConfig.max_clicks,
      max_domains: planConfig.max_domains,
      max_campaigns: planConfig.max_campaigns,
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
  stripe: Stripe,
  admin: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;
  const userId = await findUserId(admin, customerId, subscription.metadata?.supabase_user_id);
  if (!userId) throw new Error(`No user for customer ${customerId}`);

  const planItem = findPlanItem(subscription);
  const priceId = planItem?.price.id;
  const planConfig = priceId ? PRICE_TO_PLAN[priceId] : null;
  if (!planConfig) {
    console.warn(`[subscription.updated] Subscription sem plano conhecido, ignorando`);
    return;
  }

  // Auto-healing: se a subscription não tem item metered, adiciona
  let meteredItem = findMeteredItem(subscription);
  if (!meteredItem && PLAN_METERED_MAP[priceId]) {
    try {
      console.log(`[auto-heal] Adicionando item metered em sub ${subscription.id}`);
      const created = await stripe.subscriptionItems.create({
        subscription: subscription.id,
        price: PLAN_METERED_MAP[priceId],
        proration_behavior: "none",
      });
      meteredItem = created as unknown as Stripe.SubscriptionItem;
    } catch (err) {
      console.error(`[auto-heal] Falhou ao adicionar metered:`, err);
    }
  }

  // Grace period: past_due não suspende
  const isSuspended = ["unpaid", "canceled", "incomplete_expired"].includes(subscription.status);

  // ── DETECÇÃO DE VIRADA DE CICLO ──
  // Busca o billing_cycle_start atual do profile ANTES do update
  // pra comparar com o novo que veio do Stripe
  const { data: currentProfile, error: fetchError } = await admin
    .from("profiles")
    .select("billing_cycle_start")
    .eq("user_id", userId)
    .single();

  if (fetchError) {
    console.error(`[subscription.updated] Falha ao buscar profile atual:`, fetchError);
    // Não bloqueia — segue o fluxo normal sem reset
  }

  const newCycleStartISO = new Date(subscription.current_period_start * 1000).toISOString();
  const oldCycleStartISO = currentProfile?.billing_cycle_start
    ? new Date(currentProfile.billing_cycle_start).toISOString()
    : null;

  // Reset APENAS se:
  // 1. Havia um billing_cycle_start antigo (conta não é novíssima)
  // 2. E o novo é diferente do antigo (ciclo realmente virou)
  const isCycleRenewal = oldCycleStartISO !== null && oldCycleStartISO !== newCycleStartISO;

  // ── Monta payload do UPDATE ──
  // Tudo num único objeto → um único statement SQL → zero race condition
 const updatePayload: Record<string, unknown> = {
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    stripe_overage_item_id: meteredItem?.id ?? null,
    plan_name: planConfig.plan_name,
    max_clicks: planConfig.max_clicks,
    max_domains: planConfig.max_domains,
    max_campaigns: planConfig.max_campaigns,
    subscription_status: subscription.status,
    is_suspended: isSuspended,
    billing_cycle_start: newCycleStartISO,
    billing_cycle_end: new Date(subscription.current_period_end * 1000).toISOString(),
  };

  if (isCycleRenewal) {
    updatePayload.current_clicks = 0;
    console.log(
      `[subscription.updated] CICLO RENOVADO para user ${userId}. ` +
      `Reset de current_clicks. Antigo: ${oldCycleStartISO}, Novo: ${newCycleStartISO}`
    );
  }

  await admin
    .from("profiles")
    .update(updatePayload)
    .eq("user_id", userId);

  console.log(
    `[subscription.updated] User ${userId} -> ${subscription.status} ` +
    `(suspended: ${isSuspended}, cycle_renewed: ${isCycleRenewal})`
  );
}

async function syncSubscriptionAddons(
  admin: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;
  const userId = await findUserId(admin, customerId, subscription.metadata?.supabase_user_id);
  if (!userId) return;

  const activeItemIds: string[] = [];

  for (const item of subscription.items.data) {
    const addonType = ADDON_PRICE_TO_TYPE[item.price.id];
    if (!addonType) continue;

    activeItemIds.push(item.id);

    await admin.from("subscription_addons").upsert({
      user_id: userId,
      stripe_subscription_item_id: item.id,
      stripe_price_id: item.price.id,
      addon_type: addonType,
      quantity: item.quantity || 1,
      status: "active",
    }, { onConflict: "stripe_subscription_item_id" });
  }

  if (activeItemIds.length > 0) {
    const itemsList = activeItemIds.map((id) => `"${id}"`).join(",");
    await admin.from("subscription_addons")
      .update({ status: "cancelled" })
      .eq("user_id", userId)
      .eq("status", "active")
      .not("stripe_subscription_item_id", "in", `(${itemsList})`);
  } else {
    await admin.from("subscription_addons")
      .update({ status: "cancelled" })
      .eq("user_id", userId)
      .eq("status", "active");
  }

  console.log(`[sync-addons] User ${userId} -> ${activeItemIds.length} active`);
}

async function handleSubscriptionDeleted(
  admin: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;
  const userId = await findUserId(admin, customerId, subscription.metadata?.supabase_user_id);
  if (!userId) throw new Error(`No user for customer ${customerId}`);

  await admin
    .from("profiles")
    .update({
      stripe_subscription_id: null,
      stripe_price_id: null,
      stripe_overage_item_id: null,
      plan_name: FREE_PLAN.plan_name,
      max_clicks: FREE_PLAN.max_clicks,
      max_domains: FREE_PLAN.max_domains,
      max_campaigns: FREE_PLAN.max_campaigns,
      subscription_status: "canceled",
      is_suspended: true,
      billing_cycle_end: new Date().toISOString(),
    })
    .eq("user_id", userId);

  await admin.from("subscription_addons")
    .update({ status: "cancelled" })
    .eq("user_id", userId)
    .eq("status", "active");

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

  console.warn(`[invoice.failed] User ${userId} -> ${invoice.id} (grace period ativo)`);
}