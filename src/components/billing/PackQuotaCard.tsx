import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { BillingPack, BillingResource } from "@/hooks/useBillingState";
import { formatPackPriceUsd, resolvePackView } from "@/lib/resolvePackView";
import { cn } from "@/lib/utils";

interface PackQuotaCardProps {
  resource: BillingResource;
  pack: BillingPack;
  activation: string | null | undefined;
  isBypass: boolean;
  checkoutAvailable: boolean;
  planKey: string;
  highlighted?: boolean;
  renewsOn?: string | null;
  onViewPlans: () => void;
  onBuy?: () => Promise<void>;
}

export function PackQuotaCard({
  resource,
  pack,
  activation,
  isBypass,
  checkoutAvailable,
  planKey,
  highlighted,
  renewsOn,
  onViewPlans,
  onBuy,
}: PackQuotaCardProps) {
  const { t } = useTranslation();
  const [buying, setBuying] = useState(false);
  const view = resolvePackView({
    kind: "quota",
    resource,
    pack,
    activation,
    isBypass,
    checkoutAvailable,
    planKey,
  });

  const renewLabel = renewsOn
    ? t("billing.packs.renewsOn", {
        date: new Date(renewsOn).toLocaleDateString(),
      })
    : null;

  const priceLabel = formatPackPriceUsd(pack.unit_price_cents);

  const handleBuy = async () => {
    if (!onBuy || buying) return;
    setBuying(true);
    try {
      await onBuy();
    } finally {
      setBuying(false);
    }
  };

  return (
    <div
      id="pack-card-clicks"
      className={cn(
        "rounded-xl border bg-card p-4 sm:p-5 space-y-3 transition-shadow",
        highlighted ? "border-primary ring-2 ring-primary/40" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{t("billing.packs.clicksTitle")}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t("billing.packs.quotaUsed", {
              bought: pack.bought_this_cycle,
              max: pack.max_per_cycle,
            })}
            {renewLabel ? ` · ${renewLabel}` : ""}
          </p>
          <p className="text-xs text-muted-foreground mt-1 font-mono">
            {resource.used} / {resource.effective < 0 ? "∞" : resource.effective}
          </p>
        </div>
        {resource.state === "at_limit" && (
          <Badge variant="outline" className="border-destructive/40 text-destructive shrink-0">
            {t("billing.packs.badgeAtLimit")}
          </Badge>
        )}
        {resource.state === "over_limit" && (
          <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400 shrink-0">
            {t("billing.packs.badgeOverLimit")}
          </Badge>
        )}
      </div>

      {view.copyKey === "bypass" && (
        <p className="text-xs text-muted-foreground">{t("billing.packs.bypassManaged")}</p>
      )}
      {view.copyKey === "inactive_past_due" && (
        <p className="text-xs text-muted-foreground">{t("billing.packs.inactivePastDue")}</p>
      )}
      {view.copyKey === "inactive_canceled" && (
        <p className="text-xs text-muted-foreground">{t("billing.packs.inactiveCanceled")}</p>
      )}
      {view.copyKey === "at_cap" && (
        <p className="text-xs text-muted-foreground">
          {t("billing.packs.atCapClicks", { plan: planKey, cap: resource.hard_cap })}
        </p>
      )}
      {view.copyKey === "cycle_quota" && (
        <p className="text-xs text-muted-foreground">{t("billing.packs.cycleQuota")}</p>
      )}
      {view.copyKey === "over_limit" && (
        <p className="text-xs text-muted-foreground">
          {t("billing.packs.overLimitRemove", { n: view.removeCount })}
        </p>
      )}
      {(view.copyKey === "ok" || view.copyKey === "at_limit") && pack.unit_size > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("billing.packs.unitClicks", { n: pack.unit_size })}
          {view.showPrice && priceLabel ? ` · ${priceLabel}/mo` : ""}
        </p>
      )}

      {view.cta.type === "coming_soon" && (
        <Button disabled className="w-full" variant="secondary">
          {t("billing.packs.comingSoon")}
        </Button>
      )}
      {view.cta.type === "buy" && (
        <Button className="w-full" onClick={handleBuy} disabled={buying || !onBuy}>
          {buying ? <Loader2 className="h-4 w-4 animate-spin" /> : t("billing.packs.buyCta", { price: priceLabel ?? "" })}
        </Button>
      )}
      {view.cta.type === "view_plans" && (
        <Button
          className="w-full"
          variant={view.copyKey === "cycle_quota" ? "ghost" : "outline"}
          onClick={onViewPlans}
        >
          {t("billing.packs.viewPlans")}
        </Button>
      )}
      {view.cta.type === "inactive" && (
        <Button disabled className="w-full" variant="secondary">
          {view.cta.key === "past_due"
            ? t("billing.packs.inactivePastDueCta")
            : t("billing.packs.inactiveCanceledCta")}
        </Button>
      )}
    </div>
  );
}
