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

type AddonType = "extra_clicks" | "extra_domain" | "extra_campaign";
type PlanKey = "BASIC" | "PRO" | "FREEDOM" | "ENTERPRISE";

/** Test catalog — Spec 2 packs (USD). Swap to live IDs before go-live. */
const PACK_PRICES: Record<PlanKey, Partial<Record<AddonType, string>>> = {
  BASIC: {
    extra_clicks: "price_1UG1xZLZEOji6sEJf1szGS77",
    extra_domain: "price_1UG1xZLZEOji6sEJXBR5Lwmk",
    extra_campaign: "price_1UG1xbLZEOji6sEJozZXJhZ0",
  },
  PRO: {
    extra_clicks: "price_1UG1xbLZEOji6sEJbCkXukRD",
    extra_domain: "price_1UG1xdLZEOji6sEJne54x6gr",
    extra_campaign: "price_1UG1xfLZEOji6sEJ0GIFjbLE",
  },
  FREEDOM: {
    extra_clicks: "price_1UG1xfLZEOji6sEJrTF5ANZB",
    extra_domain: "price_1UG1xiLZEOji6sEJIMl4BVvx",
    extra_campaign: "price_1UG1xjLZEOji6sEJY6fldVxi",
  },
  ENTERPRISE: {
    extra_clicks: "price_1UG1xkLZEOji6sEJVppD5P1n",
    extra_domain: "price_1UG1xkLZEOji6sEJ8Su2cqqP",
  },
};

const CLICK_PACK_MAX = 2;

function planKeyFromName(planName: string | null | undefined): PlanKey | null {
  const u = (planName || "").toUpperCase();
  if (u.includes("ENTERPRISE")) return "ENTERPRISE";
  if (u.includes("FREEDOM")) return "FREEDOM";
  if (u.includes("PRO")) return "PRO";
  if (u.includes("BASIC")) return "BASIC";
  return null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (Deno.env.get("STRIPE_CHECKOUT_DISABLED") !== "false") {
    return json(410, {
      error: "stripe_checkout_disabled",
      code: "STRIPE_CHECKOUT_DISABLED",
      message: "Stripe packs are disabled until STRIPE_CHECKOUT_DISABLED=false.",
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

    const { action, addon_type, subscription_item_id } = await req.json();
    if (action !== "add" && action !== "remove") {
      return json(400, { error: "action must be 'add' or 'remove'" });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json(500, { error: "Stripe not configured" });
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_subscription_id, is_suspended, plan_name, activation_status, max_domains, max_campaigns, max_clicks")
      .eq("user_id", user.id)
      .single();

    if (!profile?.stripe_subscription_id) {
      return json(400, { error: "User has no active subscription" });
    }
    if (profile.is_suspended || profile.activation_status !== "ACTIVE") {
      return json(403, { error: "Account not eligible for packs" });
    }

    if (action === "add") {
      const addonType = addon_type as AddonType;
      if (!["extra_clicks", "extra_domain", "extra_campaign"].includes(addonType)) {
        return json(400, { error: "Invalid addon_type" });
      }

      const planKey = planKeyFromName(profile.plan_name);
      if (!planKey) return json(400, { error: "FREE plan cannot buy packs" });

      const priceId = PACK_PRICES[planKey][addonType];
      if (!priceId) {
        return json(400, { error: `Pack not available for ${planKey}` });
      }

      // Soft cap check via current addons (hard enforcement also in billing_state)
      const { data: addons } = await admin
        .from("subscription_addons")
        .select("addon_type, quantity")
        .eq("user_id", user.id)
        .eq("status", "active");

      const qtyOf = (t: string) =>
        (addons || [])
          .filter((a) => a.addon_type === t)
          .reduce((s, a) => s + (a.quantity || 0), 0);

      if (addonType === "extra_clicks" && qtyOf("extra_clicks") >= CLICK_PACK_MAX) {
        return json(400, { error: "Click pack cycle quota reached", code: "cycle_quota" });
      }

      const subscription = await stripe.subscriptions.retrieve(
        profile.stripe_subscription_id,
      );

      const existingItem = subscription.items.data.find(
        (si) => si.price.id === priceId,
      );

      let item;

      if (existingItem) {
        item = await stripe.subscriptionItems.update(existingItem.id, {
          quantity: (existingItem.quantity || 1) + 1,
          proration_behavior: "create_prorations",
        });
        console.log(
          `[addon] Incremented ${addonType} for user ${user.id}: qty ${existingItem.quantity} → ${item.quantity}`,
        );
      } else {
        item = await stripe.subscriptionItems.create({
          subscription: profile.stripe_subscription_id,
          price: priceId,
          quantity: 1,
          proration_behavior: "create_prorations",
        });
        console.log(
          `[addon] Created ${addonType} for user ${user.id}: item ${item.id}`,
        );
      }

      // Optimistic local upsert (webhook also syncs)
      await admin.from("subscription_addons").upsert({
        user_id: user.id,
        stripe_subscription_item_id: item.id,
        stripe_price_id: priceId,
        addon_type: addonType,
        quantity: item.quantity || 1,
        status: "active",
      }, { onConflict: "stripe_subscription_item_id" });

      return json(200, {
        success: true,
        subscription_item_id: item.id,
        quantity: item.quantity,
        addon_type: addonType,
      });
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

      await admin.from("subscription_addons")
        .update({ status: "cancelled" })
        .eq("stripe_subscription_item_id", subscription_item_id)
        .eq("user_id", user.id);

      return json(200, { success: true });
    }

    return json(400, { error: "Unknown action" });
  } catch (err) {
    console.error("[manage-subscription-addon] Error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return json(500, { error: message });
  }
});
