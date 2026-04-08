import { Youtube, Search, Smartphone, Facebook } from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
  /** Preço em USD por clique excedente (overage / pay-as-you-go). 0 = nao cobra. */
  extraClickPrice: number;
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
  },
  {
    name: "BASIC PLAN",
    price: "$97",
    priceNum: "97",
    description: "The most competitive and popular plan with restrictions on clicks and registered domains.",
    features: [
      { text: "20,000 clicks", available: true },
      { text: "3 domains", available: true },
      { text: "5 campaigns", available: true },
      { text: "$0.01 per extra click", available: true },
      { text: "Vip support: Text us in the chat", available: true },
    ],
    visibleSources: 2,
    buttonText: "Select Plan",
    highlighted: false,
    isFree: false,
    maxClicksLimit: 20000,
    maxDomains: 3,
    maxCampaigns: 5,
    extraClickPrice: 0.01,
  },
  {
    name: "PRO PLAN",
    price: "$297",
    priceNum: "297",
    description: "The PRO plan was designed to serve companies with a large number of services.",
    features: [
      { text: "100,000 clicks", available: true },
      { text: "10 domains", available: true },
      { text: "20 campaigns", available: true },
      { text: "$0.004 per extra click", available: true },
      { text: "Vip support: Text us in the chat", available: true },
    ],
    visibleSources: 4,
    buttonText: "Upgrade to Pro",
    highlighted: true,
    badge: "BEST OPTION FOR YOU",
    isFree: false,
    maxClicksLimit: 100000,
    maxDomains: 10,
    maxCampaigns: 20,
    extraClickPrice: 0.004,
  },
  {
    name: "FREEDOM PLAN",
    price: "$497",
    priceNum: "497",
    description: "Our best plan to serve companies with many accesses and with several domains.",
    features: [
      { text: "300,000 clicks", available: true },
      { text: "20 domains", available: true },
      { text: "50 campaigns", available: true },
      { text: "$0.002 per extra click", available: true },
      { text: "Vip support: Text us in the chat", available: true },
    ],
    visibleSources: 4,
    buttonText: "Select Plan",
    highlighted: false,
    isFree: false,
    maxClicksLimit: 300000,
    maxDomains: 20,
    maxCampaigns: 50,
    extraClickPrice: 0.002,
  },
  {
    name: "ENTERPRISE CONQUEST",
    price: "$997",
    priceNum: "997",
    description: "Enterprise Plan Conquest.",
    features: [
      { text: "1,000,000 clicks", available: true },
      { text: "25 domains", available: true },
      { text: "Unlimited campaigns", available: true },
      { text: "$0.001 per extra click", available: true },
      { text: "Vip support: Text us in the chat", available: true },
    ],
    visibleSources: 4,
    buttonText: "Select Plan",
    highlighted: false,
    isFree: false,
    maxClicksLimit: 1000000,
    maxDomains: 25,
    maxCampaigns: -1,
    extraClickPrice: 0.001,
  },
];

/** Get the user's plan config by plan_name */
export function getPlanByName(planName: string | null | undefined): PlanData {
  const normalized = (planName || "free").toLowerCase();
  return PLANS.find((p) => p.name.toLowerCase() === normalized) || PLANS[0];
}

/** Get allowed traffic sources for a plan */
export function getAllowedSources(plan: PlanData): TrafficSourceDef[] {
  return TRAFFIC_SOURCES.slice(0, plan.visibleSources);
}

/** Find a traffic source definition by key */
export function getSourceByKey(key: string): TrafficSourceDef | undefined {
  return TRAFFIC_SOURCES.find((s) => s.key === key);
}

/**
 * Calcula o custo do excedente (overage / pay-as-you-go).
 * Retorna 0 se o usuario nao estourou o limite ou se o plano nao tem cobranca avulsa.
 */
export function calculateOverageCost(
  currentClicks: number,
  maxClicks: number,
  plan: PlanData
): { extraClicks: number; cost: number } {
  if (!maxClicks || maxClicks <= 0 || currentClicks <= maxClicks || plan.extraClickPrice <= 0) {
    return { extraClicks: 0, cost: 0 };
  }
  const extraClicks = currentClicks - maxClicks;
  const cost = extraClicks * plan.extraClickPrice;
  return { extraClicks, cost };
}
