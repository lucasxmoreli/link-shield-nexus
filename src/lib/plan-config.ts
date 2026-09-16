import { Youtube, Search, Smartphone, Facebook } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Marketing / UI + Stripe plan price IDs.
 *  Runtime limits: get_billing_state() / useBillingState (not these numbers alone).
 *  Spec 2 included quotas. Packs replace metered overage.
 *
 *  stripePriceId below = TEST mode (acct test). Swap to live IDs before go-live.
 *  Catalog: supabase/functions/_shared/stripe-catalog.test.json
 */

export interface TrafficSourceDef {
  key: string;
  name: string;
  icon: LucideIcon;
  color: string;
}

export const TRAFFIC_SOURCES: TrafficSourceDef[] = [
  { key: "tiktok", name: "TikTok Ads", icon: Smartphone, color: "hsl(0 0% 90%)" },
  { key: "meta", name: "Meta Ads", icon: Facebook, color: "hsl(221 44% 48%)" },
  { key: "google", name: "Google Ads", icon: Search, color: "hsl(45 100% 51%)" },
  { key: "youtube", name: "YouTube Ads", icon: Youtube, color: "hsl(0 100% 50%)" },
];

export interface PlanData {
  name: string;
  price: string;
  priceNum: string;
  description: string;
  features: { text: string; available: boolean }[];
  visibleSources: number;
  buttonText: string;
  highlighted: boolean;
  badge?: string;
  isFree: boolean;
  maxClicksLimit: number;
  maxDomains: number;
  maxCampaigns: number; // -1 = unlimited
  /** @deprecated Metered overage removed — use packs. Kept 0 for UI. */
  extraClickPrice: number;
  stripePriceId: string | null;
  /** @deprecated Always null — no metered line item. */
  stripeMeteredPriceId: string | null;
}

export const PLANS: PlanData[] = [
  {
    name: "FREE",
    price: "$0",
    priceNum: "0",
    description: "Explore the dashboard. Read-only access for new registrations.",
    features: [
      { text: "0 clicks", available: false },
      { text: "0 domains", available: false },
      { text: "0 campaigns", available: false },
      { text: "View-only mode", available: false },
    ],
    visibleSources: 0,
    buttonText: "Current Plan",
    highlighted: false,
    isFree: true,
    maxClicksLimit: 0,
    maxDomains: 0,
    maxCampaigns: 0,
    extraClickPrice: 0,
    stripePriceId: null,
    stripeMeteredPriceId: null,
  },
  {
    name: "BASIC PLAN",
    price: "$57.99",
    priceNum: "57.99",
    description: "Starter kit for US ads traffic. Grow with click/domain/campaign packs up to the hard cap.",
    features: [
      { text: "8,000 clicks / month", available: true },
      { text: "1 domain", available: true },
      { text: "3 campaigns", available: true },
      { text: "Packs up to 18k clicks / 3 domains / 5 campaigns", available: true },
      { text: "Vip support: Text us in the chat", available: true },
    ],
    visibleSources: 2,
    buttonText: "Select Plan",
    highlighted: false,
    isFree: false,
    maxClicksLimit: 8000,
    maxDomains: 1,
    maxCampaigns: 3,
    extraClickPrice: 0,
    stripePriceId: "price_1UG23HLZEOji6sEJoaUpX4t1",
    stripeMeteredPriceId: null,
  },
  {
    name: "PRO PLAN",
    price: "$96.99",
    priceNum: "96.99",
    description: "For teams scaling Meta/TikTok. Packs extend capacity without overage surprises.",
    features: [
      { text: "20,000 clicks / month", available: true },
      { text: "3 domains", available: true },
      { text: "8 campaigns", available: true },
      { text: "Packs up to 40k clicks / 6 domains / 12 campaigns", available: true },
      { text: "Vip support: Text us in the chat", available: true },
    ],
    visibleSources: 4,
    buttonText: "Upgrade to Pro",
    highlighted: true,
    badge: "BEST OPTION FOR YOU",
    isFree: false,
    maxClicksLimit: 20000,
    maxDomains: 3,
    maxCampaigns: 8,
    extraClickPrice: 0,
    stripePriceId: "price_1UG23OLZEOji6sEJw9z873KX",
    stripeMeteredPriceId: null,
  },
  {
    name: "FREEDOM PLAN",
    price: "$234.99",
    priceNum: "234.99",
    description: "High volume with room to grow via packs.",
    features: [
      { text: "100,000 clicks / month", available: true },
      { text: "10 domains", available: true },
      { text: "20 campaigns", available: true },
      { text: "Packs up to 150k clicks / 15 domains / 30 campaigns", available: true },
      { text: "Vip support: Text us in the chat", available: true },
    ],
    visibleSources: 4,
    buttonText: "Select Plan",
    highlighted: false,
    isFree: false,
    maxClicksLimit: 100000,
    maxDomains: 10,
    maxCampaigns: 20,
    extraClickPrice: 0,
    stripePriceId: "price_1UG23QLZEOji6sEJQQ1Evq5U",
    stripeMeteredPriceId: null,
  },
  {
    name: "ENTERPRISE CONQUEST",
    price: "$389.99",
    priceNum: "389.99",
    description: "Enterprise volume with unlimited campaigns.",
    features: [
      { text: "300,000 clicks / month", available: true },
      { text: "20 domains", available: true },
      { text: "Unlimited campaigns", available: true },
      { text: "Packs up to 400k clicks / 25 domains", available: true },
      { text: "Vip support: Text us in the chat", available: true },
    ],
    visibleSources: 4,
    buttonText: "Select Plan",
    highlighted: false,
    isFree: false,
    maxClicksLimit: 300000,
    maxDomains: 20,
    maxCampaigns: -1,
    extraClickPrice: 0,
    stripePriceId: "price_1UG23PLZEOji6sEJ1kjc8qCg",
    stripeMeteredPriceId: null,
  },
];

export function getPlanByName(planName: string | null | undefined): PlanData {
  const normalized = (planName || "free").toLowerCase();
  return PLANS.find((p) => p.name.toLowerCase() === normalized) || PLANS[0];
}

export function getAllowedSources(plan: PlanData): TrafficSourceDef[] {
  return TRAFFIC_SOURCES.slice(0, plan.visibleSources);
}

export function getSourceByKey(key: string): TrafficSourceDef | undefined {
  return TRAFFIC_SOURCES.find((s) => s.key === key);
}

/** @deprecated Overage removed — packs only. Always returns zeros. */
export function calculateOverageCost(
  _currentClicks: number,
  _maxClicks: number,
  _plan: PlanData,
): { extraClicks: number; cost: number } {
  return { extraClicks: 0, cost: 0 };
}
