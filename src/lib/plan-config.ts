import { Youtube, Search, Smartphone, Facebook } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Marketing / UI + Stripe plan price IDs.
 *  Runtime limits: get_billing_state() / useBillingState (not these numbers alone).
 *  Spec 2 included quotas. Packs replace metered overage.
 *
 *  stripePriceId below = live IDs of acct_1TLTvILZEOji6sEJ.
 *  create-checkout-session maps them to the sandbox twin when STRIPE_SECRET_KEY is sk_test.
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
  descriptionKey: string;
  nameKey: string;
  features: { key: string; available: boolean }[];
  visibleSources: number;
  buttonText: string;
  highlighted: boolean;
  badgeKey?: string;
  isFree: boolean;
  maxClicksLimit: number;
  maxDomains: number;
  maxCampaigns: number; // -1 = unlimited
  /** @deprecated Metered overage removed — use packs. Kept 0 for UI. */
  extraClickPrice: number;
  stripePriceId: string | null;
  /** @deprecated Always null — no metered line item. */
  stripeMeteredPriceId: string | null;
  /** Frozen BRL amount shown before checkout. Charge uses the Stripe price. */
  checkoutBrl: string;
}

export const PLANS: PlanData[] = [
  {
    name: "FREE",
    price: "$0",
    priceNum: "0",
    descriptionKey: "billing.kits.free.desc",
    nameKey: "billing.kits.free.name",
    features: [
      { key: "billing.kits.free.clicks", available: false },
      { key: "billing.kits.free.domains", available: false },
      { key: "billing.kits.free.campaigns", available: false },
      { key: "billing.kits.free.viewOnly", available: false },
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
    checkoutBrl: "R$ 0,00",
  },
  {
    name: "STARTER PLAN",
    price: "$34.99",
    priceNum: "34.99",
    descriptionKey: "billing.kits.starter.desc",
    nameKey: "billing.kits.starter.name",
    features: [
      { key: "billing.kits.starter.clicks", available: true },
      { key: "billing.kits.starter.source", available: true },
      { key: "billing.kits.starter.domains", available: true },
      { key: "billing.kits.starter.campaigns", available: true },
      { key: "billing.kits.starter.clickPacks", available: true },
      { key: "billing.kits.starter.domainPacks", available: false },
      { key: "billing.kits.starter.support", available: true },
    ],
    visibleSources: 1,
    buttonText: "Select Plan",
    highlighted: false,
    isFree: false,
    maxClicksLimit: 5000,
    maxDomains: 1,
    maxCampaigns: 1,
    extraClickPrice: 0,
    stripePriceId: "price_1UU0QVLZEOji6sEJd1KOYFZD",
    stripeMeteredPriceId: null,
    checkoutBrl: "R$ 162,12",
  },
  {
    name: "BASIC PLAN",
    price: "$57.99",
    priceNum: "57.99",
    descriptionKey: "billing.kits.basic.desc",
    nameKey: "billing.kits.basic.name",
    features: [
      { key: "billing.kits.basic.clicks", available: true },
      { key: "billing.kits.basic.domains", available: true },
      { key: "billing.kits.basic.campaigns", available: true },
      { key: "billing.kits.basic.clickPacks", available: true },
      { key: "billing.kits.basic.domainPacks", available: true },
      { key: "billing.kits.basic.campaignPacks", available: true },
      { key: "billing.kits.basic.support", available: true },
    ],
    visibleSources: 2,
    buttonText: "Select Plan",
    highlighted: false,
    isFree: false,
    maxClicksLimit: 8000,
    maxDomains: 1,
    maxCampaigns: 3,
    extraClickPrice: 0,
    stripePriceId: "price_1UGOBLLZEOji6sEJmp2Yp15Q",
    stripeMeteredPriceId: null,
    checkoutBrl: "R$ 268,69",
  },
  {
    name: "PRO PLAN",
    price: "$96.99",
    priceNum: "96.99",
    descriptionKey: "billing.kits.pro.desc",
    nameKey: "billing.kits.pro.name",
    features: [
      { key: "billing.kits.pro.clicks", available: true },
      { key: "billing.kits.pro.domains", available: true },
      { key: "billing.kits.pro.campaigns", available: true },
      { key: "billing.kits.pro.clickPacks", available: true },
      { key: "billing.kits.pro.domainPacks", available: true },
      { key: "billing.kits.pro.campaignPacks", available: true },
      { key: "billing.kits.pro.support", available: true },
    ],
    visibleSources: 4,
    buttonText: "Upgrade to Pro",
    highlighted: true,
    badgeKey: "billing.kits.pro.badge",
    isFree: false,
    maxClicksLimit: 20000,
    maxDomains: 3,
    maxCampaigns: 8,
    extraClickPrice: 0,
    stripePriceId: "price_1UGOejLZEOji6sEJWgTR0NyV",
    stripeMeteredPriceId: null,
    checkoutBrl: "R$ 449,40",
  },
  {
    name: "FREEDOM PLAN",
    price: "$234.99",
    priceNum: "234.99",
    descriptionKey: "billing.kits.freedom.desc",
    nameKey: "billing.kits.freedom.name",
    features: [
      { key: "billing.kits.freedom.clicks", available: true },
      { key: "billing.kits.freedom.domains", available: true },
      { key: "billing.kits.freedom.campaigns", available: true },
      { key: "billing.kits.freedom.clickPacks", available: true },
      { key: "billing.kits.freedom.domainPacks", available: true },
      { key: "billing.kits.freedom.campaignPacks", available: true },
      { key: "billing.kits.freedom.support", available: true },
    ],
    visibleSources: 4,
    buttonText: "Select Plan",
    highlighted: false,
    isFree: false,
    maxClicksLimit: 100000,
    maxDomains: 10,
    maxCampaigns: 20,
    extraClickPrice: 0,
    stripePriceId: "price_1UGOeyLZEOji6sEJu8l6ZlWm",
    stripeMeteredPriceId: null,
    checkoutBrl: "R$ 1.088,82",
  },
  {
    name: "ENTERPRISE CONQUEST",
    price: "$389.99",
    priceNum: "389.99",
    descriptionKey: "billing.kits.enterprise.desc",
    nameKey: "billing.kits.enterprise.name",
    features: [
      { key: "billing.kits.enterprise.clicks", available: true },
      { key: "billing.kits.enterprise.domains", available: true },
      { key: "billing.kits.enterprise.campaigns", available: true },
      { key: "billing.kits.enterprise.clickPacks", available: true },
      { key: "billing.kits.enterprise.domainPacks", available: true },
      { key: "billing.kits.enterprise.support", available: true },
    ],
    visibleSources: 4,
    buttonText: "Select Plan",
    highlighted: false,
    isFree: false,
    maxClicksLimit: 300000,
    maxDomains: 20,
    maxCampaigns: -1,
    extraClickPrice: 0,
    stripePriceId: "price_1UGOhiLZEOji6sEJX44FJWmM",
    stripeMeteredPriceId: null,
    checkoutBrl: "R$ 1.807,00",
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
