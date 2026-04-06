import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Circle, Globe, Target, Rocket } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";

export function OnboardingWizard() {
  const { user, effectiveUserId } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { data: domainsCount = 0 } = useQuery({
    queryKey: ["domains-count", effectiveUserId],
    queryFn: async () => {
      const { count, error } = await supabase.from("domains").select("*", { count: "exact", head: true }).eq("user_id", effectiveUserId!);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!effectiveUserId,
  });

  const { data: campaignsCount = 0 } = useQuery({
    queryKey: ["campaigns-count", effectiveUserId],
    queryFn: async () => {
      const { count, error } = await supabase.from("campaigns").select("*", { count: "exact", head: true }).eq("user_id", effectiveUserId!);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!effectiveUserId,
  });

  const { data: hasActiveCampaign = false } = useQuery({
    queryKey: ["active-campaigns", effectiveUserId],
    queryFn: async () => {
      const { count, error } = await supabase.from("campaigns").select("*", { count: "exact", head: true }).eq("is_active", true).eq("user_id", effectiveUserId!);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    enabled: !!effectiveUserId,
  });

  const steps = [
    {
      icon: Globe,
      title: t("onboarding.step1Title"),
      desc: t("onboarding.step1Desc"),
      done: domainsCount > 0,
      action: () => navigate("/domains"),
    },
    {
      icon: Target,
      title: t("onboarding.step2Title"),
      desc: t("onboarding.step2Desc"),
      done: campaignsCount > 0,
      action: () => navigate("/campaigns/new"),
    },
    {
      icon: Rocket,
      title: t("onboarding.step3Title"),
      desc: t("onboarding.step3Desc"),
      done: hasActiveCampaign,
      action: () => navigate("/campaigns"),
    },
  ];

  const allDone = steps.every((s) => s.done);
  if (allDone) return null;

  const completedCount = steps.filter((s) => s.done).length;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Rocket className="h-4 w-4 text-primary" />
          {t("onboarding.welcomeTitle")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t("onboarding.welcomeDesc")}</p>
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${(completedCount / steps.length) * 100}%` }}
            />
          </div>
          <span className="text-xs font-mono text-muted-foreground">{completedCount}/{steps.length}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {steps.map((step, i) => {
          const StepIcon = step.icon;
          return (
            <button
              key={i}
              onClick={step.done ? undefined : step.action}
              className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                step.done
                  ? "border-success/20 bg-success/5 cursor-default"
                  : "border-border/40 bg-secondary/10 hover:bg-secondary/20 cursor-pointer"
              }`}
            >
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${step.done ? "bg-success/10" : "bg-primary/10"}`}>
                <StepIcon className={`h-4 w-4 ${step.done ? "text-success" : "text-primary"}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${step.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                  {step.title}
                </p>
                <p className="text-xs text-muted-foreground">{step.desc}</p>
              </div>
              {step.done ? (
                <CheckCircle className="h-4 w-4 text-success shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground/30 shrink-0" />
              )}
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
