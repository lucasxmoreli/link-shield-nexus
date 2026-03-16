import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Facebook, Instagram, Youtube, Search, Smartphone, Twitter, Camera, Pin, Linkedin, Flame } from "lucide-react";

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
  },
];

export default function AccountSettings() {
  const { user } = useAuth();
  const { toast } = useToast();

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

  const maxClicks = profile?.max_clicks ?? 0;
  const currentClicks = profile?.current_clicks ?? 0;
  const usagePercent = maxClicks > 0 ? Math.round((currentClicks / maxClicks) * 100) : 0;
  const planName = profile?.plan_name ?? "Free";
  const isFreePlan = planName === "Free";

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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Account Settings</h1>

      <Tabs defaultValue="account" className="w-full">
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
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Clicks used</span>
                  <span className="font-mono">{currentClicks.toLocaleString()} / {maxClicks.toLocaleString()}</span>
                </div>
                <Progress value={usagePercent} className="h-3 bg-secondary" />
                <p className="text-sm text-muted-foreground">{usagePercent}% of limit used</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="subscription">
          <div className="flex overflow-x-auto snap-x snap-mandatory gap-6 pt-6 pb-4 scrollbar-hide xl:grid xl:grid-cols-5">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`
                  relative min-w-[300px] flex-shrink-0 snap-center flex flex-col rounded-xl border p-6
                  bg-card text-card-foreground
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
