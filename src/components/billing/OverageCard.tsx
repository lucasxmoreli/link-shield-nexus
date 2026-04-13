import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { 
  formatClicks, 
  formatUSD, 
  formatOverageRate,
  calculateOverage 
} from "@/lib/billing-format";
import type { PlanData } from "@/lib/plan-config";

interface OverageCardProps {
  plan: PlanData;
  currentClicks: number;
  maxClicks: number;
}

export function OverageCard({ plan, currentClicks, maxClicks }: OverageCardProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "en" ? "en-US" : i18n.language === "es" ? "es-ES" : "pt-BR";

  const { overageClicks, overageCost } = calculateOverage(
    currentClicks, 
    maxClicks, 
    plan.extraClickPrice
  );

  // Componente só renderiza se tiver overage real
  if (overageClicks === 0) return null;

  const rate = plan.extraClickPrice ?? 0.01;

  return (
    <Alert variant="destructive" className="border-destructive/50 bg-destructive/5">
      <AlertTriangle className="h-5 w-5" />
      <AlertTitle className="text-base font-semibold mb-2">
        {t("billing.overageAlertTitle")}
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <div className="space-y-1">
          <p className="text-2xl font-bold font-mono text-destructive">
            +{formatClicks(overageClicks, locale)}
            <span className="text-sm font-normal ml-2 text-muted-foreground">
              {t("billing.overageClicksLabel", { clicks: "" }).trim()}
            </span>
          </p>
          <p className="text-base">
            {t("billing.overageCostLabel", { cost: formatUSD(overageCost) })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("billing.overageRateLabel", { rate: formatOverageRate(rate) })}
          </p>
        </div>
      </AlertDescription>
    </Alert>
  );
}