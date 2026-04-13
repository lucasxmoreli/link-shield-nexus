import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

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

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── Auth via JWT do user ──
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

    // Cliente autenticado como o user (respeita RLS)
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Valida o user via JWT
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Lê o stripe_customer_id do profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ 
          error: "No active subscription. Subscribe to a plan first." 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // ── Parse return_url do body (opcional) ──
    const body = await req.json().catch(() => ({}));
    const returnUrl = body.return_url || "https://www.cloakerx.com/billing?tab=faturas";

    // ── Cria sessão do Stripe Customer Portal ──
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: returnUrl,
    });

    console.log(`[create-portal-session] User ${user.id} -> portal session created`);

    return new Response(
      JSON.stringify({ url: session.url }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  } catch (err: any) {
    console.error("[create-portal-session] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});