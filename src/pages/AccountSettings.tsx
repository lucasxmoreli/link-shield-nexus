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
import { Check, X, ArrowRight, Zap } from "lucide-react";
import { PLANS, TRAFFIC_SOURCES, getPlanByName, type PlanData } from "@/lib/plan-config";

export default function AccountSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("account");
  const [selectedPlan, setSelectedPlan] = useState<PlanData | null>(null);

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

  const activePlan = getPlanByName(profile?.plan_name);

  // Prefer the database value if it's set and non-zero, otherwise derive from plan name
  const maxClicks = (profile?.max_clicks && profile.max_clicks > 0) ? profile.max_clicks : activePlan.maxClicksLimit;
  const currentClicks = profile?.current_clicks ?? 0;
  
  const rawUsagePercent = maxClicks > 0 ? (currentClicks / maxClicks) * 100 : 0;
  const usagePercent = Math.round(rawUsagePercent);
  const usageDisplay = currentClicks > 0 && rawUsagePercent < 1 ? "< 1" : `${usagePercent}`;
  const progressValue = currentClicks > 0 && usagePercent < 1 ? 1 : usagePercent;

  const planName = profile?.plan_name ?? "Free";
  const isFreePlan = planName === "Free";

  // Domain usage
  const maxDomains = profile?.max_domains || activePlan.maxDomains;
  const domainsPercent = maxDomains > 0 ? Math.round((domainsCount / maxDomains) * 100) : 0;

  // Campaign usage (unlimited for paid plans)
  const campaignsUnlimited = !isFreePlan;

  const handlePlanClick = (plan: PlanData) => {
    if (plan.isFree) return;
    setSelectedPlan(plan);
  };

  const handleConfirmUpgrade = () => {
    if (!selectedPlan) return;
    toast({ title: "Upgrade feature coming soon", description: `You selected ${selectedPlan.name}.` });
    setSelectedPlan(null);
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

      {/* Plan Confirmation Dialog */}
      <Dialog open={!!selectedPlan} onOpenChange={(open) => !open && setSelectedPlan(null)}>
        <DialogContent className="sm:max-w-md border-primary/20 bg-card">
          {selectedPlan && (
            <>
              <DialogHeader className="text-center sm:text-center space-y-3 pb-2">
                <Badge className="mx-auto w-fit bg-primary/15 text-primary border-0 text-[10px] tracking-widest px-3 py-1">
                  SELECTED PLAN
                </Badge>
                <DialogTitle className="text-2xl sm:text-3xl font-bold tracking-tight">
                  {selectedPlan.name}
                </DialogTitle>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-4xl sm:text-5xl font-bold font-mono">{selectedPlan.price}</span>
                  <span className="text-muted-foreground text-sm">/mo</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                  {selectedPlan.description}
                </p>
              </DialogHeader>

              <div className="space-y-5 py-4">
                {/* Features checklist */}
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">What's included</p>
                  <ul className="space-y-2">
                    {selectedPlan.features.filter(f => f.available).map((f) => (
                      <li key={f.text} className="flex items-center gap-2.5 text-sm">
                        <div className="h-5 w-5 rounded-full bg-success/15 flex items-center justify-center shrink-0">
                          <Check size={12} className="text-success" />
                        </div>
                        <span>{f.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Traffic sources */}
                {selectedPlan.visibleSources > 0 && (
                  <div className="space-y-2.5">
                    <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">Included Traffic Sources</p>
                    <div className="flex flex-wrap gap-2">
                      {TRAFFIC_SOURCES.slice(0, selectedPlan.visibleSources).map((src) => {
                        const Icon = src.icon;
                        return (
                          <div
                            key={src.name}
                            className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-2.5 py-1.5"
                          >
                            <Icon size={14} style={{ color: src.color }} />
                            <span className="text-xs font-medium">{src.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedPlan(null)}
                  className="sm:flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmUpgrade}
                  className={`sm:flex-1 font-semibold ${
                    selectedPlan.highlighted
                      ? "bg-orange-500 hover:bg-orange-600 text-white"
                      : "bg-primary hover:bg-primary/90 text-primary-foreground"
                  }`}
                >
                  <Zap size={16} />
                  Confirm Upgrade
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
