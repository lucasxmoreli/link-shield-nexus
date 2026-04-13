import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, X, Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { PLANS, TRAFFIC_SOURCES, getPlanByName, type PlanData } from "@/lib/plan-config";
import { PlanOverviewCard } from "@/components/billing/PlanOverviewCard";
import { OverageCard } from "@/components/billing/OverageCard";
import { LimitsGrid } from "@/components/billing/LimitsGrid";
import { PaymentMethodCard } from "@/components/billing/PaymentMethodCard";
import { InvoicesTable } from "@/components/billing/InvoicesTable";

const STARTER_PLANS = PLANS.filter((p) => ["FREE", "BASIC PLAN", "PRO PLAN"].includes(p.name));
const SCALE_PLANS = PLANS.filter((p) => ["FREEDOM PLAN", "ENTERPRISE CONQUEST"].includes(p.name));

// ─────────────────────────────────────────────────────────────────────────────
// PlanCard (componente interno usado na tab Plans — inalterado)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Billing (componente principal)
// ─────────────────────────────────────────────────────────────────────────────

interface EffectiveLimits {
  base_max_domains: number;
  base_max_campaigns: number;
  extra_domains: number;
  extra_campaigns: number;
  effective_max_domains: number;
  effective_max_campaigns: number;
}

export default function Billing() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedPlan, setSelectedPlan] = useState<PlanData | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [addonLoading, setAddonLoading] = useState<"extra_domain" | "extra_campaign" | null>(null);

  // ── Query: Profile ──
  const { data: profile } = useQuery({
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

  // ── Query: Effective Limits (plano base + addons) ──
  const { data: effectiveLimits } = useQuery({
    queryKey: ["effective_limits", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_effective_limits");
      if (error) throw error;
      return (data as EffectiveLimits[])?.[0] ?? null;
    },
    enabled: !!user && !!profile?.stripe_subscription_id, // só busca se tem sub ativa
    staleTime: 60 * 1000,
  });

  // ── Handler: retorno do Stripe Checkout ──
  useEffect(() => {
    const checkout = searchParams.get("checkout");

    if (checkout === "success") {
      toast({
        title: t("billing.checkoutSuccess"),
        description: t("billing.checkoutSuccessDesc"),
      });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["effective_limits"] });
      // Remove o query param sem disparar navigate
      const params = new URLSearchParams(searchParams);
      params.delete("checkout");
      params.delete("session_id");
      setSearchParams(params, { replace: true });
    } else if (checkout === "cancelled") {
      toast({
        title: t("billing.checkoutCancelled"),
        description: t("billing.checkoutCancelledDesc"),
      });
      const params = new URLSearchParams(searchParams);
      params.delete("checkout");
      setSearchParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handler: reset de loading no bfcache (botão voltar do navegador) ──
  useEffect(() => {
    const resetLoadingOnReturn = (e: PageTransitionEvent) => {
      if (e.persisted) setCheckoutLoading(false);
    };
    const resetOnVisibility = () => {
      if (document.visibilityState === "visible") setCheckoutLoading(false);
    };
    window.addEventListener("pageshow", resetLoadingOnReturn);
    document.addEventListener("visibilitychange", resetOnVisibility);
    return () => {
      window.removeEventListener("pageshow", resetLoadingOnReturn);
      document.removeEventListener("visibilitychange", resetOnVisibility);
    };
  }, []);

  // ── Dados derivados ──
  const userPlan = getPlanByName(profile?.plan_name);
  const userPlanIndex = PLANS.findIndex((p) => p.name === userPlan.name);
  const isScalePlan = SCALE_PLANS.some((p) => p.name === userPlan.name);
  const defaultPlanTab = isScalePlan ? "scale" : "starter";

  // Tab principal (account vs plans) — persistência via query param
  const tabParam = searchParams.get("tab");
  const activeTab = 
    tabParam === "plans" ? "plans" :
    tabParam === "faturas" ? "faturas" :
    "account";
  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === "account") {
      params.delete("tab");
    } else {
      params.set("tab", value);
    }
    setSearchParams(params, { replace: true });
  };

  // ── Handlers: Plan selection e checkout ──
  const handlePlanClick = (plan: PlanData) => {
    if (plan.name === userPlan.name) return;
    setSelectedPlan(plan);
  };

  const handleChangePlan = () => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", "plans");
    setSearchParams(params, { replace: true });
  };

  const handleConfirmUpgrade = async () => {
    if (!selectedPlan) return;

    if (!selectedPlan.stripePriceId) {
      toast({
        title: t("billing.freePlanInfo"),
        description: t("billing.freePlanDescription"),
      });
      setSelectedPlan(null);
      return;
    }

    setCheckoutLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: { price_id: selectedPlan.stripePriceId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error("Checkout URL not returned");

      window.location.href = data.url;
    } catch (err: any) {
      console.error("[checkout] Failed:", err);
      toast({
        title: t("billing.checkoutFailed"),
        description: err.message || t("billing.checkoutFailedDesc"),
        variant: "destructive",
      });
      setCheckoutLoading(false);
    }
  };

  // ── Handlers: Addons (LimitsGrid) ──
  const handleAddAddon = async (addonType: "extra_domain" | "extra_campaign") => {
    if (!profile?.stripe_subscription_id) {
      toast({
        title: t("billing.checkoutFailed"),
        description: t("billing.freePlanDescription"),
        variant: "destructive",
      });
      return;
    }

    setAddonLoading(addonType);

    try {
      const { data, error } = await supabase.functions.invoke("manage-subscription-addon", {
        body: { action: "add", addon_type: addonType },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: t("billing.checkoutSuccess"),
        description: t("billing.checkoutSuccessDesc"),
      });

      // Força refetch dos limites efetivos (webhook vai sincronizar a tabela subscription_addons)
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["effective_limits"] });
        queryClient.invalidateQueries({ queryKey: ["usage_counts"] });
      }, 2000); // aguarda webhook processar
    } catch (err: any) {
      console.error("[addon] Failed:", err);
      toast({
        title: t("billing.checkoutFailed"),
        description: err.message || t("billing.checkoutFailedDesc"),
        variant: "destructive",
      });
    } finally {
      setAddonLoading(null);
    }
  };

  // ── Render ──
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold">{t("billing.title")}</h1>
        <Badge className="bg-primary/20 text-primary border-0">{userPlan.name}</Badge>
      </div>

      {/* Tabs principais: Account / Plans */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="bg-secondary/60 border border-border p-1 rounded-lg w-full sm:w-auto">
          <TabsTrigger
            value="account"
            className="flex-1 sm:flex-initial px-6 py-2 text-sm font-semibold tracking-wide data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-md transition-all"
          >
            {t("billing.tabAccount")}
          </TabsTrigger>
          <TabsTrigger value="faturas" className="flex-1 sm:flex-initial px-6 py-2 text-sm font-semibold tracking-wide data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-md transition-all">
            {t("billing.tabFaturas")}
          </TabsTrigger>
          <TabsTrigger
            value="plans"
            className="flex-1 sm:flex-initial px-6 py-2 text-sm font-semibold tracking-wide data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-md transition-all"
          >
            {t("billing.tabPlans")}
          </TabsTrigger>
        </TabsList>

        {/* ─── TAB: MINHA CONTA ─── */}
        <TabsContent value="account" className="space-y-4 mt-6">
          {profile && (
            <>
              <PlanOverviewCard
                plan={userPlan}
                currentClicks={profile.current_clicks ?? 0}
                maxClicks={profile.max_clicks ?? 0}
                billingCycleStart={profile.billing_cycle_start}
                billingCycleEnd={profile.billing_cycle_end}
                onChangePlan={handleChangePlan}
              />

              <OverageCard
                plan={userPlan}
                currentClicks={profile.current_clicks ?? 0}
                maxClicks={profile.max_clicks ?? 0}
              />

              {profile.stripe_subscription_id && effectiveLimits && (
                <LimitsGrid
                  effectiveMaxDomains={effectiveLimits.effective_max_domains}
                  effectiveMaxCampaigns={effectiveLimits.effective_max_campaigns}
                  extraDomains={effectiveLimits.extra_domains}
                  extraCampaigns={effectiveLimits.extra_campaigns}
                  onAddDomainSlot={() => handleAddAddon("extra_domain")}
                  onAddCampaignSlot={() => handleAddAddon("extra_campaign")}
                />
              )}

              {addonLoading && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" />
                  <span>{t("billing.redirecting")}</span>
                </div>
              )}
            </>
          )}
        </TabsContent>
          
          {/* ─── TAB: FATURAS ─── */}
          <TabsContent value="faturas" className="space-y-4 mt-6">
            <PaymentMethodCard />
            <InvoicesTable />
          </TabsContent>
        
        {/* ─── TAB: PLANOS ─── */}
        <TabsContent value="plans" className="mt-6">
          <Tabs defaultValue={defaultPlanTab} className="w-full">
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
                {STARTER_PLANS.map((plan) => (
                  <PlanCard key={plan.name} plan={plan} userPlan={userPlan} userPlanIndex={userPlanIndex} onSelect={handlePlanClick} t={t} />
                ))}
              </div>
            </TabsContent>
            <TabsContent value="scale">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                {SCALE_PLANS.map((plan) => (
                  <PlanCard key={plan.name} plan={plan} userPlan={userPlan} userPlanIndex={userPlanIndex} onSelect={handlePlanClick} t={t} />
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {/* Dialog de confirmação de upgrade (reaproveitado da versão anterior) */}
      <Dialog
        open={!!selectedPlan}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedPlan(null);
            setCheckoutLoading(false);
          }
        }}
      >
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
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedPlan(null);
                    setCheckoutLoading(false);
                  }}
                  className="sm:flex-1"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={handleConfirmUpgrade}
                  disabled={checkoutLoading}
                  className={`sm:flex-1 font-semibold ${selectedPlan.highlighted ? "bg-orange-500 hover:bg-orange-600 text-white" : "bg-primary hover:bg-primary/90 text-primary-foreground"}`}
                >
                  {checkoutLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin mr-2" />
                      {t("billing.redirecting")}
                    </>
                  ) : (
                    <>
                      <Zap size={16} className="mr-2" />
                      {selectedPlan.stripePriceId ? t("billing.proceedToCheckout") : t("common.confirm")}
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}