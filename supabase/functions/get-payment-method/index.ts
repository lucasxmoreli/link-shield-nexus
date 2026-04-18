import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";

// ─── CORS Allowlist ───
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

/**
 * Extrai dados de card de um PaymentMethod object do Stripe.
 * Retorna null se o PM não for válido ou não tiver dados de card.
 */
function extractCardData(pm: Stripe.PaymentMethod | null | undefined) {
  if (!pm || typeof pm === "string" || !pm.card) return null;
  return {
    brand: pm.card.brand,
    last4: pm.card.last4,
    exp_month: pm.card.exp_month,
    exp_year: pm.card.exp_year,
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    // Sem customer = FREE, retorna null sem erro
    if (!profile?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ payment_method: null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // ── ESTRATÉGIA 1: default_payment_method do customer ──
    const customer = await stripe.customers.retrieve(
      profile.stripe_customer_id,
      { expand: ["invoice_settings.default_payment_method"] }
    );

    if (customer.deleted) {
      return new Response(
        JSON.stringify({ payment_method: null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let cardData = extractCardData(
      customer.invoice_settings?.default_payment_method as Stripe.PaymentMethod | null
    );

    // ── ESTRATÉGIA 2: payment_method da subscription ativa ──
    // Stripe Checkout não popula default_payment_method automaticamente,
    // mas a subscription ativa tem o PM que está sendo cobrado.
    if (!cardData) {
      const subs = await stripe.subscriptions.list({
        customer: profile.stripe_customer_id,
        status: "active",
        limit: 1,
        expand: ["data.default_payment_method"],
      });

      const sub = subs.data[0];
      if (sub?.default_payment_method) {
        cardData = extractCardData(sub.default_payment_method as Stripe.PaymentMethod);
      }
    }

    // ── ESTRATÉGIA 3: primeiro payment method anexado ao customer ──
    // Último recurso: pega qualquer card anexado (normalmente só tem 1).
    if (!cardData) {
      const pms = await stripe.paymentMethods.list({
        customer: profile.stripe_customer_id,
        type: "card",
        limit: 1,
      });

      if (pms.data.length > 0) {
        cardData = extractCardData(pms.data[0]);
      }
    }

    // Se nenhuma das 3 estratégias achou, retorna null (user FREE genuíno)
    if (!cardData) {
      console.log(`[get-payment-method] User ${user.id}: no payment method found`);
      return new Response(
        JSON.stringify({ payment_method: null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[get-payment-method] User ${user.id} -> ${cardData.brand} ****${cardData.last4}`);

    return new Response(
      JSON.stringify({ payment_method: cardData }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[get-payment-method] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});