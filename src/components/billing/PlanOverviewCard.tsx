import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Check, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  formatClicks,
  formatUSD,
  formatShortDate,
  daysUntil,
  calculateOverage,
} from "@/lib/billing-format";
import type { PlanData } from "@/lib/plan-config";

interface PlanOverviewCardProps {
  plan: PlanData;
  currentClicks: number;
  maxClicks: number;
  billingCycleStart: string | null;
  billingCycleEnd: string | null;
  onChangePlan: () => void;
}

export function PlanOverviewCard({
  plan,
  currentClicks,
  maxClicks,
  billingCycleStart,
  billingCycleEnd,
  onChangePlan,
}: PlanOverviewCardProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "en" ? "en-US" : i18n.language === "es" ? "es-ES" : "pt-BR";

  const usagePct = maxClicks > 0 ? Math.min(100, (currentClicks / maxClicks) * 100) : 0;
  const realPct = maxClicks > 0 ? (currentClicks / maxClicks) * 100 : 0;

  const { overageClicks, overageCost } = calculateOverage(
    currentClicks,
    maxClicks,
    plan.extraClickPrice
  );
  const isOverage = overageClicks > 0;

  const daysLeft = billingCycleEnd ? daysUntil(billingCycleEnd) : null;
  const daysText =
    daysLeft === null
      ? ""
      : daysLeft === 0
      ? t("billing.daysRemainingZero")
      : daysLeft === 1
      ? t("billing.daysRemainingOne")
      : t("billing.daysRemaining", { days: daysLeft });

  return (
    <Card className="border-primary/20 bg-card">
      <CardContent className="p-6 sm:p-8">
        {/* Header: plan name + price + change button */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2">
              {t("billing.planCardTitle")}
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-1">
              {plan.name}
            </h2>
            <p className="text-lg text-muted-foreground font-mono">
              {plan.price}
              <span className="text-sm ml-1">{t("billing.perMonth")}</span>
            </p>
          </div>
          <Button variant="outline" onClick={onChangePlan} className="shrink-0">
            {t("billing.changePlanButton")}
          </Button>
        </div>

        <div className="h-px bg-border my-6" />

        {/* Cycle info */}
        {billingCycleStart && billingCycleEnd && (
          <div className="mb-4">
            <div className="flex items-baseline justify-between gap-4 mb-2">
              <p className="text-sm text-muted-foreground">
                {t("billing.billingCycleLabel")}
              </p>
              <p className="text-sm font-mono text-foreground">
                {formatShortDate(billingCycleStart, locale)} → {formatShortDate(billingCycleEnd, locale)}
                {daysText && (
                  <span className="text-muted-foreground ml-2">({daysText})</span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Progress bar — vermelha em overage, padrão caso contrário */}
        <div className="space-y-2">
          <Progress
            value={usagePct}
            className={`h-3 ${isOverage ? "[&>div]:bg-destructive" : ""}`}
          />
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-mono text-foreground">
              {formatClicks(currentClicks, locale)} / {formatClicks(maxClicks, locale)}
              {isOverage && (
                <span className="text-destructive ml-2 text-xs font-semibold">
                  ({realPct.toFixed(0)}%)
                </span>
              )}
            </span>
            {!isOverage && (
              <span className="text-muted-foreground">{usagePct.toFixed(1)}%</span>
            )}
          </div>
        </div>

        {/* Status indicator + detalhe financeiro consolidado */}
        {maxClicks > 0 && (
          <div className="mt-4">
            {isOverage ? (
              <div className="space-y-1.5">
                {/* Alerta principal — sério, não gritante */}
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertTriangle size={16} className="shrink-0" />
                  <span>{t("billing.usageOverPlan")}</span>
                </div>
                {/* Sublinha discreta com o custo estimado */}
                <p className="text-xs text-muted-foreground pl-6">
                  {t("billing.overageEstimatedCost", {
                    clicks: formatClicks(overageClicks, locale),
                  })}
                  <span className="text-foreground font-mono font-semibold ml-1">
                    {formatUSD(overageCost)}
                  </span>
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-success">
                <Check size={16} className="shrink-0" />
                <span>{t("billing.usageWithinPlan")}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}