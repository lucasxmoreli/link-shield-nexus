import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, X, Zap, Gift, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { PLANS, TRAFFIC_SOURCES, getPlanByName, type PlanData } from "@/lib/plan-config";

const STARTER_PLANS = PLANS.filter((p) => ["FREE", "BASIC PLAN", "PRO PLAN"].includes(p.name));
const SCALE_PLANS = PLANS.filter((p) => ["FREEDOM PLAN", "ENTERPRISE CONQUEST"].includes(p.name));

function PlanCard({ plan, userPlan, userPlanIndex, onSelect, t }: { plan: PlanData; userPlan: PlanData; userPlanIndex: number; onSelect: (plan: PlanData) => void; t: any }) {
  const idx = PLANS.findIndex((p) => p.name === plan.name);
  const getButtonState = () => {
    if (plan.name === userPlan.name) return { text: t("billing.currentPlan"), disabled: true, style: "bg-muted text-muted-foreground cursor-not-allowed hover:bg-muted" };
    if (idx < userPlanIndex) return { text: t("billing.downgrade"), disabled: false, style: "bg-secondary text-secondary-foreground hover:bg-secondary/80" };
    if (plan.highlighted) return { text: t("common.upgrade"), disabled: false, style: "bg-orange-500 hover:bg-orange-600 text-white" };
    return { text: t("common.upgrade"), disabled: false, style: "bg-primary text-primary-foreground hover:bg-primary/90" };
  };
  const btn = getButtonState();

  return (
    <div className={`relative flex flex-col rounded-xl border p-4 sm:p-6 bg-card text-card-foreground hover:-translate-y-3 hover:scale-[1.03] hover:z-50 hover:shadow-[0_0_50px_hsl(271,81%,56%,0.25)] transition-all duration-300 ease-out ${plan.name === userPlan.name ? "border-primary/50 ring-2 ring-primary/40" : plan.highlighted ? "border-primary/50 ring-1 ring-primary/30 shadow-[0_0_30px_hsl(271_81%_56%/0.15)]" : "border-border"}`}>
      {plan.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
          <Badge className="bg-primary text-primary-foreground border-0 text-[10px] tracking-wider px-3 py-1 whitespace-nowrap">{plan.badge}</Badge>
        </div>
      )}
      {plan.name === userPlan.name && (
        <div className="absolute -top-3 right-4 z-10">
          <Badge className="bg-success text-white border-0 text-[10px] tracking-wider px-3 py-1">{t("billing.yourPlan")}</Badge>
        </div>
      )}
      <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-4">{plan.name}</p>
      <div className="mb-4"><span className="text-4xl font-bold font-mono">{plan.price}</span><span className="text-muted-foreground text-sm">/mo</span></div>
      <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{plan.description}</p>
      <ul className="space-y-3 mb-6">
        {plan.features.map((f) => (
          <li key={f.text} className="flex items-start gap-2 text-sm">
            {f.available ? <Check size={16} className="text-success mt-0.5 shrink-0" /> : <X size={16} className="text-destructive mt-0.5 shrink-0" />}
            <span className={f.available ? "text-foreground" : "text-muted-foreground"}>{f.text}</span>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-4 gap-2 mb-6">
        {TRAFFIC_SOURCES.map((src, i) => {
          const visible = i < plan.visibleSources;
          const Icon = src.icon;
          return (
            <div key={src.name} className={`flex flex-col items-center gap-1.5 transition-opacity ${visible ? "opacity-100" : "opacity-15"}`} title={src.name}>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${visible ? "border border-[#004BFF]/20 bg-[#004BFF]/[0.04]" : "border border-border bg-secondary/30"}`}>
                <Icon size={18} style={{ color: visible ? src.color : undefined }} className={!visible ? "text-muted-foreground" : ""} />
              </div>
              <span className="text-[10px] text-muted-foreground truncate w-full text-center font-medium">{src.name}</span>
            </div>
          );
        })}
      </div>
      <Button className={`mt-auto w-full ${btn.style}`} disabled={btn.disabled} onClick={() => onSelect(plan)}>{btn.text}</Button>
    </div>
  );
}

export default function Billing() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [selectedPlan, setSelectedPlan] = useState<PlanData | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);

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
  const isScalePlan = SCALE_PLANS.some((p) => p.name === userPlan.name);
  const defaultTab = isScalePlan ? "scale" : "starter";

  const handlePlanClick = (plan: PlanData) => {
    if (plan.name === userPlan.name) return;
    setSelectedPlan(plan);
  };

  const handleConfirmUpgrade = () => {
    if (!selectedPlan) return;
    toast({ title: t("billing.upgradeComingSoon"), description: t("billing.youSelected", { plan: selectedPlan.name }) });
    setSelectedPlan(null);
  };

  const handleRedeemPromo = async () => {
    if (!promoCode.trim()) return;
    setRedeeming(true);
    try {
      const { data, error } = await supabase.rpc("redeem_promo_code", { p_code: promoCode.trim() });
      if (error) throw error;
      const result = data as { plan_name: string; billing_cycle_end: string };
      const endDate = new Date(result.billing_cycle_end).toLocaleDateString();
      toast({ title: t("billing.planUpgraded"), description: t("billing.validUntil", { plan: result.plan_name, date: endDate }) });
      setPromoCode("");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["domains"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    } catch (err: any) {
      toast({ title: t("billing.redemptionFailed"), description: err.message || t("billing.invalidCode"), variant: "destructive" });
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold">{t("billing.title")}</h1>
        <Badge className="bg-primary/20 text-primary border-0">{userPlan.name}</Badge>
      </div>

      <Tabs defaultValue={defaultTab} className="w-full">
        <div className="flex justify-center mb-8">
          <TabsList className="bg-secondary/60 border border-border p-1 rounded-lg">
            <TabsTrigger value="starter" className="px-6 py-2 text-sm font-semibold tracking-wide data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-md transition-all">
              {t("billing.starterPlans")}
            </TabsTrigger>
            <TabsTrigger value="scale" className="px-6 py-2 text-sm font-semibold tracking-wide data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-md transition-all">
              {t("billing.scaleEnterprise")}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="starter">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {STARTER_PLANS.map((plan) => (<PlanCard key={plan.name} plan={plan} userPlan={userPlan} userPlanIndex={userPlanIndex} onSelect={handlePlanClick} t={t} />))}
          </div>
        </TabsContent>
        <TabsContent value="scale">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {SCALE_PLANS.map((plan) => (<PlanCard key={plan.name} plan={plan} userPlan={userPlan} userPlanIndex={userPlanIndex} onSelect={handlePlanClick} t={t} />))}
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex flex-col items-center gap-3 pt-4 border-t border-border">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Gift size={16} className="text-primary" />
          <span>{t("billing.havePromo")}</span>
        </div>
        <div className="flex gap-2 w-full max-w-sm">
          <Input placeholder={t("billing.enterCode")} value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && handleRedeemPromo()} className="uppercase tracking-widest font-mono text-center" />
          <Button onClick={handleRedeemPromo} disabled={redeeming || !promoCode.trim()} className="shrink-0">
            {redeeming ? <Loader2 size={16} className="animate-spin" /> : t("billing.redeem")}
          </Button>
        </div>
        {profile?.billing_cycle_end && (
          <p className="text-xs text-muted-foreground">
            {t("billing.currentPlanValid")} <span className="font-semibold text-foreground">{new Date(profile.billing_cycle_end).toLocaleDateString()}</span>
          </p>
        )}
      </div>

      <Dialog open={!!selectedPlan} onOpenChange={(open) => !open && setSelectedPlan(null)}>
        <DialogContent className="sm:max-w-md border-primary/20 bg-card">
          {selectedPlan && (
            <>
              <DialogHeader className="text-center sm:text-center space-y-3 pb-2">
                <Badge className="mx-auto w-fit bg-primary/15 text-primary border-0 text-[10px] tracking-widest px-3 py-1">{t("billing.selectedPlan")}</Badge>
                <DialogTitle className="text-2xl sm:text-3xl font-bold tracking-tight">{selectedPlan.name}</DialogTitle>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-4xl sm:text-5xl font-bold font-mono">{selectedPlan.price}</span>
                  <span className="text-muted-foreground text-sm">/mo</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{selectedPlan.description}</p>
              </DialogHeader>
              <div className="space-y-5 py-4">
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">{t("billing.whatsIncluded")}</p>
                  <ul className="space-y-2">
                    {selectedPlan.features.filter(f => f.available).map((f) => (
                      <li key={f.text} className="flex items-center gap-2.5 text-sm">
                        <div className="h-5 w-5 rounded-full bg-success/15 flex items-center justify-center shrink-0"><Check size={12} className="text-success" /></div>
                        <span>{f.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {selectedPlan.visibleSources > 0 && (
                  <div className="space-y-2.5">
                    <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">{t("billing.includedSources")}</p>
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
                <Button variant="outline" onClick={() => setSelectedPlan(null)} className="sm:flex-1">{t("common.cancel")}</Button>
                <Button onClick={handleConfirmUpgrade} className={`sm:flex-1 font-semibold ${selectedPlan.highlighted ? "bg-orange-500 hover:bg-orange-600 text-white" : "bg-primary hover:bg-primary/90 text-primary-foreground"}`}>
                  <Zap size={16} />
                  {t("common.confirm")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
