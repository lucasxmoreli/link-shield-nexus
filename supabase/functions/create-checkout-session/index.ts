import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mapa fixed → metered. Deve espelhar o plan-config.ts do frontend.
const PLAN_METERED_MAP: Record<string, string> = {
  "price_1TLVRnLZEOji6sEJnw9oiVW2": "price_1TLaNwLZEOji6sEJrtBFpRnn", // BASIC
  "price_1TLVSrLZEOji6sEJ8sF00dTT": "price_1TLaHlLZEOji6sEJgKRRDuOh", // PRO
  "price_1TLVTYLZEOji6sEJ0mzIvzme": "price_1TLaP0LZEOji6sEJdV7XPaJb", // FREEDOM
  "price_1TLVULLZEOji6sEJ4VyuhzMF": "price_1TLaR3LZEOji6sEJmagidXcF", // ENTERPRISE
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    // Valida que é um price de plano conhecido
    const meteredPriceId = PLAN_METERED_MAP[price_id];
    if (!meteredPriceId) {
      return json(400, { error: "Unknown plan price_id" });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.error("[create-checkout-session] STRIPE_SECRET_KEY not configured");
      return json(500, { error: "Stripe not configured" });
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("user_id, email, stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      console.error("[create-checkout-session] Profile not found:", profileError);
      return json(404, { error: "Profile not found" });
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

    const origin = req.headers.get("origin") || "https://www.cloakerx.com";

    // 2 line_items: mensalidade fixa (com quantity) + overage metered (sem quantity)
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [
        { price: price_id, quantity: 1 },
        { price: meteredPriceId }, // metered: sem quantity
      ],
      success_url: `${origin}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?checkout=cancelled`,
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