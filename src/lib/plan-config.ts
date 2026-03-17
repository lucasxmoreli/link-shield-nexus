import { Facebook, Instagram, Youtube, Search, Smartphone, Twitter, Camera, Pin, Linkedin, Flame } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface TrafficSourceDef {
  key: string;
  name: string;
  icon: LucideIcon;
  color: string;
}

export const TRAFFIC_SOURCES: TrafficSourceDef[] = [
  { key: "facebook", name: "Facebook", icon: Facebook, color: "hsl(221 44% 41%)" },
  { key: "instagram", name: "Instagram", icon: Instagram, color: "hsl(330 70% 50%)" },
  { key: "tiktok", name: "TikTok", icon: Smartphone, color: "hsl(0 0% 90%)" },
  { key: "google", name: "Google Ads", icon: Search, color: "hsl(45 100% 51%)" },
  { key: "youtube", name: "YouTube", icon: Youtube, color: "hsl(0 100% 50%)" },
  { key: "twitter", name: "Twitter/X", icon: Twitter, color: "hsl(203 89% 53%)" },
  { key: "snapchat", name: "Snapchat", icon: Camera, color: "hsl(56 100% 50%)" },
  { key: "pinterest", name: "Pinterest", icon: Pin, color: "hsl(0 78% 43%)" },
  { key: "linkedin", name: "LinkedIn", icon: Linkedin, color: "hsl(210 70% 40%)" },
  { key: "kwai", name: "Kwai", icon: Flame, color: "hsl(25 100% 50%)" },
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
      { text: "No active campaigns permitted", available: false },
      { text: "View-only mode", available: false },
    ],
    visibleSources: 0,
    buttonText: "Current Plan",
    highlighted: false,
    isFree: true,
    maxClicksLimit: 0,
    maxDomains: 0,
  },
  {
    name: "BASIC PLAN",
    price: "$97",
    priceNum: "97",
    description: "The most competitive and popular plan with restrictions on clicks and registered domains.",
    features: [
      { text: "20,000 clicks", available: true },
      { text: "3 domains", available: true },
      { text: "$0.01 per extra click", available: true },
      { text: "Vip support: Text us in the chat", available: true },
    ],
    visibleSources: 2,
    buttonText: "Select Plan",
    highlighted: false,
    isFree: false,
    maxClicksLimit: 20000,
    maxDomains: 3,
  },
  {
    name: "PRO PLAN",
    price: "$297",
    priceNum: "297",
    description: "The PRO plan was designed to serve companies with a large number of services.",
    features: [
      { text: "100,000 clicks", available: true },
      { text: "10 domains", available: true },
      { text: "$0.004 per extra click", available: true },
      { text: "Vip support: Text us in the chat", available: true },
    ],
    visibleSources: 8,
    buttonText: "Upgrade to Pro",
    highlighted: true,
    badge: "BEST OPTION FOR YOU",
    isFree: false,
    maxClicksLimit: 100000,
    maxDomains: 10,
  },
  {
    name: "FREEDOM PLAN",
    price: "$497",
    priceNum: "497",
    description: "Our best plan to serve companies with many accesses and with several domains.",
    features: [
      { text: "300,000 clicks", available: true },
      { text: "20 domains", available: true },
      { text: "$0.002 per extra click", available: true },
      { text: "Vip support: Text us in the chat", available: true },
    ],
    visibleSources: 10,
    buttonText: "Select Plan",
    highlighted: false,
    isFree: false,
    maxClicksLimit: 300000,
    maxDomains: 20,
  },
  {
    name: "ENTERPRISE CONQUEST",
    price: "$997",
    priceNum: "997",
    description: "Enterprise Plan Conquest.",
    features: [
      { text: "1,000,000 clicks", available: true },
      { text: "25 domains", available: true },
      { text: "$0.001 per extra click", available: true },
      { text: "Vip support: Text us in the chat", available: true },
    ],
    visibleSources: 10,
    buttonText: "Select Plan",
    highlighted: false,
    isFree: false,
    maxClicksLimit: 1000000,
    maxDomains: 25,
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
