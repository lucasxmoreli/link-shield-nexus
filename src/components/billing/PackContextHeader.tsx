import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { BillingState } from "@/hooks/useBillingState";
import { useTranslation } from "react-i18next";

function MiniBar({
  label,
  used,
  effective,
}: {
  label: string;
  used: number;
  effective: number;
}) {
  const unlimited = effective < 0;
  const pct =
    !unlimited && effective > 0 ? Math.min(100, Math.round((used / effective) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-foreground">
          {unlimited ? `${used} / ∞` : `${used} / ${effective}`}
        </span>
      </div>
      {!unlimited && <Progress value={pct} className="h-1.5" />}
    </div>
  );
}

export function PackContextHeader({ billing }: { billing: BillingState }) {
  const { t } = useTranslation();
  const { plan, resources } = billing;

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{t("billing.packs.headerTitle")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("billing.packs.headerSubtitle", { plan: plan.key })}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="border-border">
            {plan.key}
          </Badge>
          <Badge variant="outline" className="border-border">
            {plan.activation_status ?? "—"}
          </Badge>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniBar
          label={t("billing.packs.clicksTitle")}
          used={resources.clicks.used}
          effective={resources.clicks.effective}
        />
        <MiniBar
          label={t("billing.packs.domainsTitle")}
          used={resources.domains.used}
          effective={resources.domains.effective}
        />
        <MiniBar
          label={t("billing.packs.campaignsTitle")}
          used={resources.campaigns.used}
          effective={resources.campaigns.effective}
        />
      </div>
    </div>
  );
}
