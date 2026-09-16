import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { BillingState } from "@/hooks/useBillingState";
import { PackContextHeader } from "@/components/billing/PackContextHeader";
import { PackCapacityCard } from "@/components/billing/PackCapacityCard";
import { PackQuotaCard } from "@/components/billing/PackQuotaCard";
import { normalizePackFrom, normalizePackNeed } from "@/lib/resolvePackView";

interface BillingPacksTabProps {
  billing: BillingState;
  needParam: string | null;
  fromParam: string | null;
  onGoPlans: (need: string | null) => void;
}

type AddonType = "extra_clicks" | "extra_domain" | "extra_campaign";

export function BillingPacksTab({
  billing,
  needParam,
  fromParam,
  onGoPlans,
}: BillingPacksTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const need = normalizePackNeed(needParam);
  const from = normalizePackFrom(fromParam);
  const scrolled = useRef(false);

  const activation = billing.plan.activation_status;
  const isBypass = billing.plan.is_admin_bypass;
  const checkoutAvailable = billing.plan.checkout_available;
  const planKey = billing.plan.key;
  const showCampaignsPack = true;

  useEffect(() => {
    if (!need || scrolled.current) return;
    const el = document.getElementById(`pack-card-${need}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      scrolled.current = true;
    }
  }, [need]);

  const buyPack = async (addon_type: AddonType) => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-subscription-addon", {
        body: { action: "add", addon_type },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await queryClient.invalidateQueries({ queryKey: ["billing_state"] });
      toast({
        title: t("billing.packs.buySuccessTitle"),
        description: t("billing.packs.buySuccessDesc"),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("billing.addonGenericError");
      toast({
        title: t("billing.packs.buyErrorTitle"),
        description: message,
        variant: "destructive",
      });
      throw err;
    }
  };

  const backLabel =
    from === "domains"
      ? t("billing.packs.backToDomains")
      : from === "campaigns"
        ? t("billing.packs.backToCampaigns")
        : from === "dashboard"
          ? t("billing.packs.backToDashboard")
          : null;

  return (
    <div className="space-y-4 sm:space-y-6">
      {from && backLabel && (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 -ml-2 text-muted-foreground"
          onClick={() => {
            if (from === "domains") navigate("/domains");
            else if (from === "campaigns") navigate("/campaigns");
            else navigate("/");
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Button>
      )}

      {activation === "PAST_DUE" && (
        <Alert className="border-border bg-muted/30">
          <AlertDescription>{t("billing.packs.inactivePastDue")}</AlertDescription>
        </Alert>
      )}
      {activation === "CANCELED" && (
        <Alert className="border-border bg-muted/30">
          <AlertDescription>{t("billing.packs.inactiveCanceled")}</AlertDescription>
        </Alert>
      )}
      {isBypass && (
        <Alert className="border-border bg-muted/30">
          <AlertDescription>{t("billing.packs.bypassManaged")}</AlertDescription>
        </Alert>
      )}

      <PackContextHeader billing={billing} />

      <div className="grid gap-4 md:grid-cols-3">
        <PackQuotaCard
          resource={billing.resources.clicks}
          pack={billing.packs.clicks}
          activation={activation}
          isBypass={isBypass}
          checkoutAvailable={checkoutAvailable}
          planKey={planKey}
          highlighted={need === "clicks"}
          renewsOn={billing.plan.billing_cycle_end}
          onViewPlans={() => onGoPlans("clicks")}
          onBuy={() => buyPack("extra_clicks")}
        />
        <PackCapacityCard
          title={t("billing.packs.domainsTitle")}
          resourceKey="domains"
          resource={billing.resources.domains}
          pack={billing.packs.domains}
          activation={activation}
          isBypass={isBypass}
          checkoutAvailable={checkoutAvailable}
          planKey={planKey}
          highlighted={need === "domains"}
          onViewPlans={() => onGoPlans("domains")}
          onBuy={() => buyPack("extra_domain")}
        />
        {showCampaignsPack && (
          <PackCapacityCard
            title={t("billing.packs.campaignsTitle")}
            resourceKey="campaigns"
            resource={billing.resources.campaigns}
            pack={billing.packs.campaigns}
            activation={activation}
            isBypass={isBypass}
            checkoutAvailable={checkoutAvailable}
            planKey={planKey}
            highlighted={need === "campaigns"}
            onViewPlans={() => onGoPlans("campaigns")}
            onBuy={() => buyPack("extra_campaign")}
          />
        )}
      </div>
    </div>
  );
}
