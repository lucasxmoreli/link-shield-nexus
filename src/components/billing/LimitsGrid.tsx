import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { Plus, Infinity as InfinityIcon } from "lucide-react";

interface LimitsGridProps {
  effectiveMaxDomains: number;
  effectiveMaxCampaigns: number;
  extraDomains: number;
  extraCampaigns: number;
  onAddDomainSlot: () => void;
  onAddCampaignSlot: () => void;
}

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

  const renderLimit = (
    label: string,
    used: number,
    total: number,
    pct: number,
    isUnlimited: boolean,
    extra: number,
    onAdd: () => void
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
        onClick={onAdd}
        className="w-full text-xs"
      >
        <Plus size={14} className="mr-1" />
        {t("billing.addSlotButton")}
      </Button>
    </div>
  );

  return (
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
            onAddDomainSlot
          )}
          {renderLimit(
            t("billing.campaignsLabel"),
            campaignsUsed,
            effectiveMaxCampaigns,
            campaignsPct,
            isCampaignsUnlimited,
            extraCampaigns,
            onAddCampaignSlot
          )}
        </div>
      </CardContent>
    </Card>
  );
}