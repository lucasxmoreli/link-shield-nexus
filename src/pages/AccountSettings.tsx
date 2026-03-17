import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Facebook, Instagram, Youtube, Search, Smartphone, Twitter, Camera, Pin, Linkedin, Flame, ArrowRight, Zap } from "lucide-react";

const TRAFFIC_SOURCES = [
  { name: "Facebook", icon: Facebook, color: "hsl(221 44% 41%)" },
  { name: "Instagram", icon: Instagram, color: "hsl(330 70% 50%)" },
  { name: "TikTok", icon: Smartphone, color: "hsl(0 0% 90%)" },
  { name: "Google Ads", icon: Search, color: "hsl(45 100% 51%)" },
  { name: "YouTube", icon: Youtube, color: "hsl(0 100% 50%)" },
  { name: "Twitter/X", icon: Twitter, color: "hsl(203 89% 53%)" },
  { name: "Snapchat", icon: Camera, color: "hsl(56 100% 50%)" },
  { name: "Pinterest", icon: Pin, color: "hsl(0 78% 43%)" },
  { name: "LinkedIn", icon: Linkedin, color: "hsl(210 70% 40%)" },
  { name: "Kwai", icon: Flame, color: "hsl(25 100% 50%)" },
];

interface PlanData {
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
}

const PLANS: PlanData[] = [
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
  },
];

export default function AccountSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("account");

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: domainsCount = 0 } = useQuery({
    queryKey: ["domains-count", user?.id],
    queryFn: async () => {
      const { count, error } = await supabase.from("domains").select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
  });

  const { data: campaignsCount = 0 } = useQuery({
    queryKey: ["campaigns-count", user?.id],
    queryFn: async () => {
      const { count, error } = await supabase.from("campaigns").select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
  });

  // Find the active plan based on the user's profile plan_name (fallback to Free)
  const activePlan = PLANS.find(
    (p) => p.name.toLowerCase() === (profile?.plan_name || 'free').toLowerCase()
  ) || PLANS[0];

  // Prefer the database value if it's set and non-zero, otherwise derive from plan name
  const maxClicks = (profile?.max_clicks && profile.max_clicks > 0) ? profile.max_clicks : activePlan.maxClicksLimit;
  const currentClicks = profile?.current_clicks ?? 0;
  
  // Prevent NaN (divide by zero) error for Free users
  const usagePercent = maxClicks > 0 ? Math.round((currentClicks / maxClicks) * 100) : 0;
  const planName = profile?.plan_name ?? "Free";
  const isFreePlan = planName === "Free";

  // Domain usage
  const PLAN_MAX_DOMAINS: Record<string, number> = { free: 0, "basic plan": 3, "pro plan": 10, "freedom plan": 20, "enterprise conquest": 25 };
  const maxDomains = profile?.max_domains || PLAN_MAX_DOMAINS[activePlan.name.toLowerCase()] || 0;
  const domainsPercent = maxDomains > 0 ? Math.round((domainsCount / maxDomains) * 100) : 0;

  // Campaign usage (unlimited for paid plans, 0 for free)
  const maxCampaigns = isFreePlan ? 0 : Infinity;
  const campaignsLimited = maxCampaigns === 0;

  const handlePlanClick = (plan: PlanData) => {
    if (plan.isFree) return;
    toast({ title: "Upgrade feature coming soon", description: `You selected ${plan.name}.` });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Account Settings</h1>
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold">Account Settings</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-secondary">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
        </TabsList>

        <TabsContent value="account">
          <div className="space-y-6 max-w-2xl">
            <Card className="border-border bg-card">
              <CardHeader><CardTitle className="text-lg">Profile</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-mono text-sm">{profile?.email ?? user?.email ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Plan</span>
                  <Badge className="bg-primary/20 text-primary border-0">{planName}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  {isFreePlan ? (
                    <Badge className="bg-destructive/20 text-destructive border-0">Inactive</Badge>
                  ) : (
                    <Badge className="bg-success/20 text-success border-0">Active</Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader><CardTitle className="text-lg">Plan Usage</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                {/* Clicks */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Clicks used</span>
                    <span className="font-mono">{currentClicks.toLocaleString()} / {maxClicks > 0 ? maxClicks.toLocaleString() : "0"}</span>
                  </div>
                  <Progress value={usagePercent} className="h-3 bg-secondary" />
                  <p className="text-xs text-muted-foreground">{usagePercent}% of limit used</p>
                </div>

                {/* Domains */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Domains used</span>
                    <span className="font-mono">{domainsCount} / {maxDomains}</span>
                  </div>
                  <Progress value={domainsPercent} className="h-3 bg-secondary" />
                  <p className="text-xs text-muted-foreground">
                    {maxDomains > 0 ? `${domainsPercent}% of limit used` : "Upgrade to unlock custom domains"}
                  </p>
                </div>

                {/* Campaigns */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Campaigns created</span>
                    <span className="font-mono">{campaignsCount}{campaignsLimited ? " / 0" : " / ∞"}</span>
                  </div>
                  <Progress value={campaignsLimited ? 0 : Math.min(campaignsCount, 100)} className="h-3 bg-secondary" />
                  <p className="text-xs text-muted-foreground">
                    {campaignsLimited ? "Upgrade to create campaigns" : "Unlimited campaigns on your plan"}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Button
              onClick={() => setActiveTab("subscription")}
              className="w-full h-14 text-base font-semibold bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-500 text-primary-foreground shadow-[0_0_20px_hsl(271_81%_56%/0.3)] hover:shadow-[0_0_30px_hsl(271_81%_56%/0.5)] transition-all duration-300"
            >
              SEE PLANS & UPGRADE
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="subscription">
          <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 sm:gap-6 pt-6 pb-4 scrollbar-hide xl:grid xl:grid-cols-5 -mx-3 px-3 sm:-mx-0 sm:px-0">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`
                  relative min-w-[260px] sm:min-w-[300px] flex-shrink-0 snap-center flex flex-col rounded-xl border p-4 sm:p-6
                  bg-card text-card-foreground cursor-pointer
                  hover:-translate-y-3 hover:scale-[1.03] hover:shadow-[0_0_50px_hsl(271,81%,56%,0.25)]
                  transition-all duration-300 ease-out
                  ${plan.highlighted
                    ? "border-primary/50 ring-1 ring-primary/30 shadow-[0_0_30px_hsl(271_81%_56%/0.15)]"
                    : "border-border"
                  }
                `}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <Badge className="bg-primary text-primary-foreground border-0 text-[10px] tracking-wider px-3 py-1 whitespace-nowrap">
                      {plan.badge}
                    </Badge>
                  </div>
                )}

                <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-4">
                  {plan.name}
                </p>

                <div className="mb-4">
                  <span className="text-4xl font-bold font-mono">{plan.price}</span>
                  <span className="text-muted-foreground text-sm">/mo</span>
                </div>

                <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                  {plan.description}
                </p>

                <ul className="space-y-3 mb-6">
                  {plan.features.map((f) => (
                    <li key={f.text} className="flex items-start gap-2 text-sm">
                      {f.available ? (
                        <Check size={16} className="text-success mt-0.5 shrink-0" />
                      ) : (
                        <X size={16} className="text-destructive mt-0.5 shrink-0" />
                      )}
                      <span className={f.available ? "text-foreground" : "text-muted-foreground"}>
                        {f.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="grid grid-cols-5 gap-2 mb-6">
                  {TRAFFIC_SOURCES.map((src, i) => {
                    const visible = i < plan.visibleSources;
                    const Icon = src.icon;
                    return (
                      <div
                        key={src.name}
                        className={`flex flex-col items-center gap-1 ${visible ? "opacity-100" : "opacity-20"}`}
                        title={src.name}
                      >
                        <div
                          className="w-8 h-8 rounded-lg border border-border flex items-center justify-center bg-secondary/50"
                        >
                          <Icon size={16} style={{ color: visible ? src.color : undefined }} className={!visible ? "text-muted-foreground" : ""} />
                        </div>
                        <span className="text-[9px] text-muted-foreground truncate w-full text-center">
                          {src.name}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <Button
                  className={`mt-auto w-full ${
                    plan.isFree
                      ? "bg-muted text-muted-foreground cursor-not-allowed hover:bg-muted"
                      : plan.highlighted
                        ? "bg-orange-500 hover:bg-orange-600 text-white"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }`}
                  disabled={plan.isFree}
                  onClick={() => handlePlanClick(plan)}
                >
                  {plan.buttonText}
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
