import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Lock, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Tables } from "@/integrations/supabase/types";

interface TrafficSourceDef {
  key: string;
  name: string;
  icon: React.ElementType;
  color: string;
}

interface CampaignGeneralConfigProps {
  name: string;
  onNameChange: (v: string) => void;
  domain: string;
  onDomainChange: (v: string) => void;
  trafficSource: string;
  onTrafficSourceChange: (v: string) => void;
  domains: Tables<"domains">[];
  allowedSources: TrafficSourceDef[];
  hasLockedSources: boolean;
}

export default function CampaignGeneralConfig({
  name,
  onNameChange,
  domain,
  onDomainChange,
  trafficSource,
  onTrafficSourceChange,
  domains,
  allowedSources,
  hasLockedSources,
}: CampaignGeneralConfigProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <section className="rounded-xl bg-[hsl(var(--card))] p-6 space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {t("campaignEdit.campaignSection")}
      </h2>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("campaignEdit.campaignName")}</Label>
          <Input
            placeholder={t("campaignEdit.campaignNamePlaceholder")}
            className="bg-secondary border-border"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("campaignEdit.domainLabel")}</Label>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[280px] text-xs leading-relaxed">
                  <p>{t("campaignEdit.domainTooltip")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {domains.length === 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
              <p className="text-sm text-muted-foreground">
                {t("campaignEdit.noDomainsBlock")}{" "}
                <button
                  type="button"
                  onClick={() => navigate("/domains")}
                  className="underline text-primary hover:text-primary/80 transition-colors"
                >
                  {t("campaignEdit.noDomainsAction")}
                </button>
              </p>
            </div>
          ) : (
            <>
              <Select value={domain} onValueChange={onDomainChange}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder={t("campaignEdit.selectDomain")} />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {domains.map((d) => (
                    <SelectItem key={d.id} value={d.url}>
                      <span className="flex items-center gap-2">
                        {d.url}
                        {d.ssl_status === "active" ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 border-green-500/30 text-green-400"
                          >
                            {t("campaignEdit.domainSslActive")}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 border-blue-500/30 text-blue-400"
                          >
                            {t("campaignEdit.domainSslPending")}
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("campaignEdit.domainHelper")}</p>
              {domain &&
                (() => {
                  const selectedDomainObj = domains.find((d) => d.url === domain);
                  if (selectedDomainObj && selectedDomainObj.ssl_status !== "active") {
                    return (
                      <div className="flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
                        <Info className="h-4 w-4 mt-0.5 text-blue-400 shrink-0" />
                        <p className="text-xs text-blue-200/80">{t("campaignEdit.domainSslWarning")}</p>
                      </div>
                    );
                  }
                  return null;
                })()}
            </>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("campaignEdit.trafficSource")}</Label>
          <Select value={trafficSource} onValueChange={onTrafficSourceChange}>
            <SelectTrigger className="bg-secondary border-border">
              <SelectValue placeholder={t("campaignEdit.selectSource")} />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {allowedSources.map((src) => {
                const Icon = src.icon;
                return (
                  <SelectItem key={src.key} value={src.key}>
                    <span className="flex items-center gap-2">
                      <Icon size={14} style={{ color: src.color }} />
                      {src.name}
                    </span>
                  </SelectItem>
                );
              })}
              {hasLockedSources && (
                <SelectItem value="__locked" disabled>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Lock size={14} />
                    {t("campaignEdit.unlockMore")}
                  </span>
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  );
}
