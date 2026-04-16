import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { Plus, Infinity as InfinityIcon, Loader2, CreditCard, AlertCircle } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Addon pricing (must match Stripe prices)
// ─────────────────────────────────────────────────────────────

const ADDON_PRICING: Record<string, { priceLabel: string; period: string }> = {
  extra_domain:   { priceLabel: "$2.50", period: "/mo" },
  extra_campaign: { priceLabel: "$2.50", period: "/mo" },
};

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type AddonType = "extra_domain" | "extra_campaign";

interface LimitsGridProps {
  effectiveMaxDomains: number;
  effectiveMaxCampaigns: number;
  extraDomains: number;
  extraCampaigns: number;
  onAddDomainSlot: () => Promise<void>;
  onAddCampaignSlot: () => Promise<void>;
}

interface ConfirmDialogState {
  open: boolean;
  addonType: AddonType | null;
  loading: boolean;
  error: string | null;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function LimitsGrid({
  effectiveMaxDomains,
  effectiveMaxCampaigns,
  extraDomains,
  extraCampaigns,
  onAddDomainSlot,
  onAddCampaignSlot,
}: LimitsGridProps) {
  const { user } = useAuth();
  const { t } = useTranslation();

  // ── Dialog state ──
  const [dialog, setDialog] = useState<ConfirmDialogState>({
    open: false,
    addonType: null,
    loading: false,
    error: null,
  });

  // ── Usage counts ──
  const { data: counts } = useQuery({
    queryKey: ["usage_counts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_usage_counts");
      if (error) throw error;
      return (data as Array<{ domains_count: number; campaigns_count: number }>)?.[0]
        ?? { domains_count: 0, campaigns_count: 0 };
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const domainsUsed = counts?.domains_count ?? 0;
  const campaignsUsed = counts?.campaigns_count ?? 0;

  const isDomainsUnlimited = effectiveMaxDomains < 0;
  const isCampaignsUnlimited = effectiveMaxCampaigns < 0;

  const domainsPct = isDomainsUnlimited || effectiveMaxDomains === 0
    ? 0
    : Math.min(100, (domainsUsed / effectiveMaxDomains) * 100);

  const campaignsPct = isCampaignsUnlimited || effectiveMaxCampaigns === 0
    ? 0
    : Math.min(100, (campaignsUsed / effectiveMaxCampaigns) * 100);

  // ── Open confirmation dialog (does NOT call edge function yet) ──
  const openConfirmDialog = (addonType: AddonType) => {
    setDialog({
      open: true,
      addonType,
      loading: false,
      error: null,
    });
  };

  // ── Close dialog ──
  const closeDialog = () => {
    if (dialog.loading) return; // prevent closing during loading
    setDialog({ open: false, addonType: null, loading: false, error: null });
  };

  // ── Confirm and execute ──
  const handleConfirm = async () => {
    if (!dialog.addonType) return;

    setDialog((prev) => ({ ...prev, loading: true, error: null }));

    try {
      if (dialog.addonType === "extra_domain") {
        await onAddDomainSlot();
      } else {
        await onAddCampaignSlot();
      }
      // Success — close dialog
      setDialog({ open: false, addonType: null, loading: false, error: null });
    } catch (err: any) {
      setDialog((prev) => ({
        ...prev,
        loading: false,
        error: err?.message || t("billing.addonGenericError"),
      }));
    }
  };

  // ── Addon hint (shows "+X addons" when extras active) ──
  const renderAddonHint = (extra: number) => {
    if (extra === 0) return null;
    const key = extra === 1
      ? "billing.limitsIncludesAddons"
      : "billing.limitsIncludesAddonsPlural";
    return (
      <span className="text-xs text-primary ml-2 font-normal">
        {t(key, { extra })}
      </span>
    );
  };

  // ── Single limit column ──
  const renderLimit = (
    label: string,
    used: number,
    total: number,
    pct: number,
    isUnlimited: boolean,
    extra: number,
    addonType: AddonType
  ) => (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-foreground">
          {label}
          {renderAddonHint(extra)}
        </h3>
        <span className="text-xs font-mono text-muted-foreground shrink-0">
          {used}
          {isUnlimited ? (
            <>
              {" / "}
              <InfinityIcon size={12} className="inline-block align-middle" />
            </>
          ) : (
            ` / ${total}`
          )}
        </span>
      </div>
      {!isUnlimited && (
        <Progress value={pct} className="h-2" />
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={() => openConfirmDialog(addonType)}
        className="w-full text-xs"
      >
        <Plus size={14} className="mr-1" />
        {t("billing.addSlotButton")}
      </Button>
    </div>
  );

  // ── Dialog content helpers ──
  const dialogAddonLabel = dialog.addonType === "extra_domain"
    ? t("billing.addonDomainLabel")
    : t("billing.addonCampaignLabel");

  const dialogPricing = dialog.addonType
    ? ADDON_PRICING[dialog.addonType]
    : null;

  // ── Render ──
  return (
    <>
      <Card className="border-border bg-card">
        <CardContent className="p-6">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-4">
            {t("billing.limitsGridTitle")}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {renderLimit(
              t("billing.domainsLabel"),
              domainsUsed,
              effectiveMaxDomains,
              domainsPct,
              isDomainsUnlimited,
              extraDomains,
              "extra_domain"
            )}
            {renderLimit(
              t("billing.campaignsLabel"),
              campaignsUsed,
              effectiveMaxCampaigns,
              campaignsPct,
              isCampaignsUnlimited,
              extraCampaigns,
              "extra_campaign"
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── CONFIRMATION DIALOG ─── */}
      <Dialog open={dialog.open} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard size={18} className="text-primary" />
              {t("billing.addonConfirmTitle")}
            </DialogTitle>
            <DialogDescription className="pt-2 space-y-3">
              {/* What they're adding */}
              <span className="block text-foreground text-sm">
                {t("billing.addonConfirmDesc", { addon: dialogAddonLabel })}
              </span>

              {/* Price highlight */}
              {dialogPricing && (
                <span className="flex items-center justify-between rounded-lg bg-muted/30 border border-border px-4 py-3">
                  <span className="text-sm text-muted-foreground">
                    {t("billing.addonRecurringCost")}
                  </span>
                  <span className="text-lg font-bold tabular-nums">
                    {dialogPricing.priceLabel}
                    <span className="text-sm font-normal text-muted-foreground ml-0.5">
                      {dialogPricing.period}
                    </span>
                  </span>
                </span>
              )}

              {/* Proration warning */}
              <span className="block text-xs text-muted-foreground leading-relaxed">
                {t("billing.addonProrationWarning")}
              </span>
            </DialogDescription>
          </DialogHeader>

          {/* Error message */}
          {dialog.error && (
            <div className="flex items-start gap-2 text-destructive text-sm px-1">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{dialog.error}</span>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={closeDialog}
              disabled={dialog.loading}
            >
              {t("billing.addonCancel")}
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={dialog.loading}
            >
              {dialog.loading ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  {t("billing.addonProcessing")}
                </>
              ) : (
                t("billing.addonConfirmButton")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}