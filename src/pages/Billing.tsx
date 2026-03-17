import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Check, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { PLANS, TRAFFIC_SOURCES, getPlanByName, type PlanData } from "@/lib/plan-config";

export default function Billing() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState<PlanData | null>(null);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const userPlan = getPlanByName(profile?.plan_name);
  const userPlanIndex = PLANS.findIndex((p) => p.name === userPlan.name);

  const getButtonState = (plan: PlanData, planIndex: number) => {
    if (plan.name === userPlan.name) return { text: "Current Plan", disabled: true, style: "bg-muted text-muted-foreground cursor-not-allowed hover:bg-muted" };
    if (planIndex < userPlanIndex) return { text: "Downgrade", disabled: false, style: "bg-secondary text-secondary-foreground hover:bg-secondary/80" };
    if (plan.highlighted) return { text: "Upgrade", disabled: false, style: "bg-orange-500 hover:bg-orange-600 text-white" };
    return { text: "Upgrade", disabled: false, style: "bg-primary text-primary-foreground hover:bg-primary/90" };
  };

  const handlePlanClick = (plan: PlanData) => {
    if (plan.name === userPlan.name) return;
    setSelectedPlan(plan);
  };

  const handleConfirmUpgrade = () => {
    if (!selectedPlan) return;
    toast({ title: "Upgrade feature coming soon", description: `You selected ${selectedPlan.name}.` });
    setSelectedPlan(null);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold">Billing & Plans</h1>
        <Badge className="bg-primary/20 text-primary border-0">{userPlan.name}</Badge>
      </div>

      <div className="flex flex-nowrap overflow-x-auto gap-6 pb-12 pt-4 px-2 snap-x snap-mandatory scroll-smooth scrollbar-hide w-full">
        {PLANS.map((plan, idx) => {
          const btn = getButtonState(plan, idx);
          return (
            <div
              key={plan.name}
              className={`
                relative min-w-[260px] sm:min-w-[300px] flex-shrink-0 snap-center flex flex-col rounded-xl border p-4 sm:p-6
                bg-card text-card-foreground
                hover:-translate-y-3 hover:scale-[1.03] hover:shadow-[0_0_50px_hsl(271,81%,56%,0.25)]
                transition-all duration-300 ease-out
                ${plan.name === userPlan.name
                  ? "border-primary/50 ring-2 ring-primary/40"
                  : plan.highlighted
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

              {plan.name === userPlan.name && (
                <div className="absolute -top-3 right-4 z-10">
                  <Badge className="bg-success text-white border-0 text-[10px] tracking-wider px-3 py-1">
                    YOUR PLAN
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
                      <div className="w-8 h-8 rounded-lg border border-border flex items-center justify-center bg-secondary/50">
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
                className={`mt-auto w-full ${btn.style}`}
                disabled={btn.disabled}
                onClick={() => handlePlanClick(plan)}
              >
                {btn.text}
              </Button>
            </div>
          );
        })}
      </div>

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

                {selectedPlan.visibleSources > 0 && (
                  <div className="space-y-2.5">
                    <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">Included Traffic Sources</p>
                    <div className="flex flex-wrap gap-2">
                      {TRAFFIC_SOURCES.slice(0, selectedPlan.visibleSources).map((src) => {
                        const Icon = src.icon;
                        return (
                          <div key={src.name} className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-2.5 py-1.5">
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
                <Button variant="outline" onClick={() => setSelectedPlan(null)} className="sm:flex-1">
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
                  Confirm
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}