// =============================================================================
// create-checkout-session
// -----------------------------------------------------------------------------
// Receives a Stripe plan `price_id`, validates JWT + activation, ensures a
// Stripe customer, creates Checkout (subscription) for the PLAN ONLY.
// Packs are separate (no metered overage line item).
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17.5.0";

const ALLOWED_ORIGINS = [
  "https://www.cloakerx.com",
  "https://cloakerx.com",
  "http://localhost:5173",
  "http://localhost:8080",
];

const VERCEL_PREVIEW_REGEX = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;

function getCorsHeaders(origin: string | null) {
  const isAllowed = origin && (
    ALLOWED_ORIGINS.includes(origin) ||
    VERCEL_PREVIEW_REGEX.test(origin)
  );
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin! : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

/** Plan prices only (test + live). No metered / pack IDs here. */
const PLAN_PRICE_IDS = new Set([
  // test — USD Spec 2 (57.99 / 96.99 / 234.99 / 389.99)
  "price_1UG23HLZEOji6sEJoaUpX4t1", // BASIC $57.99
  "price_1UG23OLZEOji6sEJw9z873KX", // PRO $96.99
  "price_1UG23QLZEOji6sEJQQ1Evq5U", // FREEDOM $234.99
  "price_1UG23PLZEOji6sEJ1kjc8qCg", // ENTERPRISE $389.99
  // live (legacy catalog — until live mirrored)
  "price_1TLVRnLZEOji6sEJnw9oiVW2",
  "price_1TLVSrLZEOji6sEJ8sF00dTT",
  "price_1TLVTYLZEOji6sEJ0mzIvzme",
  "price_1TLVULLZEOji6sEJ4VyuhzMF",
]);

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Fail-closed: only exact "false" reopens Stripe checkout.
  if (Deno.env.get("STRIPE_CHECKOUT_DISABLED") !== "false") {
    return json(410, {
      error: "stripe_checkout_disabled",
      code: "STRIPE_CHECKOUT_DISABLED",
      message: "Stripe checkout is temporarily disabled.",
    });
  }

  try {
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

    const { price_id } = await req.json();
    if (!price_id || typeof price_id !== "string" || !price_id.startsWith("price_")) {
      return json(400, { error: "Invalid price_id" });
    }

    if (!PLAN_PRICE_IDS.has(price_id)) {
      return json(400, { error: "Unknown plan price_id" });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.error("[create-checkout-session] STRIPE_SECRET_KEY not configured");
      return json(500, { error: "Stripe not configured" });
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("user_id, email, stripe_customer_id, activation_status")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      console.error("[create-checkout-session] Profile not found:", profileError);
      return json(404, { error: "Profile not found" });
    }

    if (profile.activation_status === "ACTIVE") {
      console.warn(`[create-checkout-session] User ${user.id} already ACTIVE`);
      return json(409, {
        error: "Workspace already activated. Use the customer portal to change plans.",
        code: "ALREADY_ACTIVE",
      });
    }

    let customerId = profile.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email || user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      const { error: updateError } = await adminClient
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("user_id", user.id);

      if (updateError) {
        console.error("[create-checkout-session] Failed to save customer_id:", updateError);
      }
    }

    const requestOrigin = req.headers.get("origin") || "https://www.cloakerx.com";

    // Plan only — packs bought separately (no metered overage).
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      client_reference_id: user.id,
      mode: "subscription",
      line_items: [{ price: price_id, quantity: 1 }],
      success_url: `${requestOrigin}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${requestOrigin}/billing?checkout=cancelled`,
      metadata: { supabase_user_id: user.id },
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
      allow_promotion_codes: true,
    });

    return json(200, { session_id: session.id, url: session.url });
  } catch (err) {
    console.error("[create-checkout-session] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return json(500, { error: message });
  }
});
