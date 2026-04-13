import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

// ─── CORS Allowlist ────────────────────────────────────────────────
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

const ADDON_PRICES: Record<string, string> = {
  extra_domain:   "price_1TLZySLZEOji6sEJvsOtZ3sF",
  extra_campaign: "price_1TLZzoLZEOji6sEJ8QA7ggHU",
};

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

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

    const { action, addon_type, subscription_item_id } = await req.json();
    if (action !== "add" && action !== "remove") {
      return json(400, { error: "action must be 'add' or 'remove'" });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json(500, { error: "Stripe not configured" });
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_subscription_id, is_suspended")
      .eq("user_id", user.id)
      .single();

    if (!profile?.stripe_subscription_id) {
      return json(400, { error: "User has no active subscription" });
    }
    if (profile.is_suspended) {
      return json(403, { error: "Account suspended" });
    }

    if (action === "add") {
      const priceId = ADDON_PRICES[addon_type];
      if (!priceId) return json(400, { error: "Invalid addon_type" });

      const item = await stripe.subscriptionItems.create({
        subscription: profile.stripe_subscription_id,
        price: priceId,
        quantity: 1,
        proration_behavior: "create_prorations",
      });

      return json(200, { success: true, subscription_item_id: item.id });
    }

    if (action === "remove") {
      if (!subscription_item_id) return json(400, { error: "subscription_item_id required" });

      const { data: addon } = await admin
        .from("subscription_addons")
        .select("id")
        .eq("stripe_subscription_item_id", subscription_item_id)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      if (!addon) return json(403, { error: "Addon not found or access denied" });

      await stripe.subscriptionItems.del(subscription_item_id, {
        proration_behavior: "create_prorations",
      });

      return json(200, { success: true });
    }

    return json(400, { error: "Unknown action" });
  } catch (err) {
    console.error("[manage-subscription-addon] Error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return json(500, { error: message });
  }
});