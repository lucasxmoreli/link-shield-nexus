
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── Auth: validar JWT do usuário ──
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

    // ── Parse e validar input ──
    const { price_id } = await req.json();
    if (!price_id || typeof price_id !== "string" || !price_id.startsWith("price_")) {
      return json(400, { error: "Invalid price_id" });
    }

    // ── Stripe init ──
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.error("[create-checkout-session] STRIPE_SECRET_KEY not configured");
      return json(500, { error: "Stripe not configured" });
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // ── Buscar profile e stripe_customer_id ──
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

    // ── Criar customer no Stripe se não existir ──
    let customerId = profile.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email || user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      });
      customerId = customer.id;

      // Persistir no profile
      const { error: updateError } = await adminClient
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("user_id", user.id);

      if (updateError) {
        console.error("[create-checkout-session] Failed to save customer_id:", updateError);
        // Não retorna erro — o customer foi criado, podemos continuar e o webhook resolve
      }
    }

    // ── Criar checkout session ──
    const origin = req.headers.get("origin") || "https://app.cloakerx.com";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [
        {
          price: price_id,
          quantity: 1,
        },
      ],
      success_url: `${origin}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?checkout=cancelled`,
      // Dupla redundância: customer_id já amarra, mas metadata é fallback no webhook
      metadata: {
        supabase_user_id: user.id,
      },
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
        },
      },
      // Permite cupons nativos da Stripe (substituindo a tabela promo_codes purgada)
      allow_promotion_codes: true,
    });

    return json(200, {
      session_id: session.id,
      url: session.url,
    });
  } catch (err) {
    console.error("[create-checkout-session] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return json(500, { error: message });
  }
});