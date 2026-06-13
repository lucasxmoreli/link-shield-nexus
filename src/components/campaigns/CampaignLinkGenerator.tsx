import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, AlertTriangle, Globe, Shield, Info, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "react-i18next";
import { getSourceByKey, TRAFFIC_SOURCES } from "@/lib/plan-config";

// ── Unified Macro Dictionary (Single Source of Truth) ──────────────────────
export interface TrackingParam {
  key: string;
  label: string;
  macro: string;
  enabled: boolean;
}

export const PLATFORM_PARAMS: Record<string, TrackingParam[]> = {
  tiktok: [
    { key: "click_id", label: "Click ID", macro: "__CALLBACK_PARAM__", enabled: true },
    { key: "campaign", label: "Campaign", macro: "__CID_NAME__", enabled: true },
    { key: "adset", label: "Ad Set", macro: "__AID_NAME__", enabled: true },
    { key: "cost", label: "Cost", macro: "__VALUE__", enabled: true },
    { key: "placement", label: "Placement", macro: "__PLACEMENT__", enabled: false },
    { key: "source_platform", label: "Platform", macro: "tiktok", enabled: false },
  ],
  meta: [
    { key: "click_id", label: "Click ID", macro: "{{fbclid}}", enabled: true },
    { key: "campaign", label: "Campaign", macro: "{{campaign.name}}", enabled: true },
    { key: "adset", label: "Ad Set", macro: "{{adset.name}}", enabled: true },
    { key: "cost", label: "Cost", macro: "{{cost_per_result}}", enabled: true },
    { key: "source_platform", label: "Platform", macro: "meta", enabled: false },
  ],
  google: [
    { key: "click_id", label: "Click ID", macro: "{gclid}", enabled: true },
    { key: "campaign", label: "Campaign", macro: "{campaign}", enabled: true },
    { key: "adset", label: "Ad Group", macro: "{adgroup}", enabled: true },
    { key: "cost", label: "Cost", macro: "{cost_per_conversion}", enabled: true },
    { key: "source_platform", label: "Platform", macro: "google", enabled: false },
  ],
  youtube: [
    { key: "click_id", label: "Click ID", macro: "{gclid}", enabled: true },
    { key: "campaign", label: "Campaign", macro: "{campaign}", enabled: true },
    { key: "cost", label: "Cost", macro: "{cost_per_conversion}", enabled: true },
    { key: "source_platform", label: "Platform", macro: "youtube", enabled: false },
  ],
};

const FALLBACK_PARAMS: TrackingParam[] = [
  { key: "utm_source", label: "UTM Source", macro: "{source}", enabled: true },
  { key: "utm_campaign", label: "UTM Campaign", macro: "{campaign}", enabled: true },
  { key: "utm_medium", label: "UTM Medium", macro: "{medium}", enabled: false },
];

export function getParamsForSource(source: string): TrackingParam[] {
  return PLATFORM_PARAMS[source] ?? FALLBACK_PARAMS;
}

export function buildTrackingUrl(
  domain: string,
  hash: string,
  activeParams: { key: string; macro: string }[]
): string {
  const base = domain.trim().replace(/\/+$/, "");
  const dm = base.startsWith("http") ? base : `https://${base}`;
  const root = `${dm}/c/${hash}`;
  if (activeParams.length === 0) return root;
  const qs = activeParams.map((p) => `${p.key}=${p.macro}`).join("&");
  return `${root}?${qs}`;
}

/** Shorthand: builds URL with ALL default-enabled params for a source */
export function buildDefaultTrackingUrl(domain: string, hash: string, source: string): string {
  const params = getParamsForSource(source).filter((p) => p.enabled);
  return buildTrackingUrl(domain, hash, params);
}

function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    tiktok: "TikTok Ads",
    meta: "Meta Ads",
    google: "Google Ads",
    youtube: "YouTube Ads",
  };
  return labels[source] || "Organic / Other";
}

// ── Component Props ────────────────────────────────────────────────────────
interface CampaignLinkGeneratorProps {
  campaignHash: string;
  initialSource: string;
  initialDomain?: string;
  offerUrl?: string;
  safeUrl?: string;
  /** Called after the link is successfully copied */
  onCopied?: () => void;
}

export default function CampaignLinkGenerator({
  campaignHash,
  initialSource,
  initialDomain = "",
  offerUrl,
  safeUrl,
  onCopied,
}: CampaignLinkGeneratorProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // ── Domain fetching ──────────────────────────────────────────────────
  const { data: domains = [], isLoading: domainsLoading } = useQuery({
    queryKey: ["domains-verified", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("domains").select("*").eq("is_verified", true);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // ── State ────────────────────────────────────────────────────────────
  const [selectedDomain, setSelectedDomain] = useState(initialDomain);
  const [trafficSource, setTrafficSource] = useState(initialSource);
  const [enabledParams, setEnabledParams] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // Initialize domain from props or first verified domain
  useEffect(() => {
    if (initialDomain) {
      setSelectedDomain(initialDomain);
    } else if (domains.length > 0 && !selectedDomain) {
      setSelectedDomain(domains[0].url);
    }
  }, [initialDomain, domains]);

  // Reset params when traffic source changes
  useEffect(() => {
    const params = getParamsForSource(trafficSource);
    const defaults: Record<string, boolean> = {};
    params.forEach((p) => {
      defaults[p.key] = p.enabled;
    });
    setEnabledParams(defaults);
  }, [trafficSource]);

  // ── Derived ──────────────────────────────────────────────────────────
  const allParams = useMemo(() => getParamsForSource(trafficSource), [trafficSource]);

  const activeParams = useMemo(
    () => allParams.filter((p) => enabledParams[p.key] ?? p.enabled),
    [allParams, enabledParams]
  );

  const previewLink = useMemo(() => {
    if (!selectedDomain) return "";
    return buildTrackingUrl(selectedDomain, campaignHash, activeParams);
  }, [selectedDomain, campaignHash, activeParams]);

  const webhookUrl = useMemo(() => {
    if (!selectedDomain) return "";
    const base = selectedDomain.trim().replace(/\/+$/, "");
    const dm = base.startsWith("http") ? base : `https://${base}`;
    return `${dm}/webhook/conversion?click_id={click_id}&revenue={commission}`;
  }, [selectedDomain]);

  // ── Handlers ─────────────────────────────────────────────────────────
  const toggleParam = (key: string) => {
    setEnabledParams((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCopy = async () => {
    if (!previewLink) return;
    await navigator.clipboard.writeText(previewLink);
    setCopied(true);
    toast.success(t("campaigns.campaignLinkCopied"), {
      style: { background: "hsl(var(--success))", color: "#fff", border: "none" },
    });
    setTimeout(() => {
      setCopied(false);
      onCopied?.();
    }, 800);
  };

  const handleCopyWebhook = async () => {
    if (!webhookUrl) return;
    await navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    toast.success(t("campaigns.webhookCopied"), {
      style: { background: "hsl(var(--success))", color: "#fff", border: "none" },
    });
    setTimeout(() => setCopiedWebhook(false), 800);
  };

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Platform badge */}
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs">
          {(() => {
            const src = getSourceByKey(trafficSource);
            if (src) {
              const Icon = src.icon;
              return (
                <>
                  <Icon size={12} style={{ color: src.color }} className="mr-1" />
                  {getSourceLabel(trafficSource)}
                </>
              );
            }
            return getSourceLabel(trafficSource);
          })()}
        </Badge>
      </div>

      {/* Domain & Source selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Domain */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">{t("campaigns.domain")}</label>
          {domainsLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : domains.length === 0 ? (
            <Alert className="border-yellow-500/30 bg-yellow-500/5">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <AlertDescription className="text-sm text-muted-foreground">
                {t("campaigns.noDomainsWarning")}{" "}
                <button
                  type="button"
                  onClick={() => navigate("/domains")}
                  className="underline text-primary hover:text-primary/80 transition-colors"
                >
                  {t("campaigns.goToDomains")}
                </button>
              </AlertDescription>
            </Alert>
          ) : (
            <Select value={selectedDomain} onValueChange={setSelectedDomain}>
              <SelectTrigger className="border-border bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {domains.map((d) => (
                  <SelectItem key={d.id} value={d.url}>
                    {d.url}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Traffic Source */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">{t("campaigns.source")}</label>
          <Select value={trafficSource} onValueChange={setTrafficSource}>
            <SelectTrigger className="border-border bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRAFFIC_SOURCES.map((s) => {
                const Icon = s.icon;
                return (
                  <SelectItem key={s.key} value={s.key}>
                    <span className="flex items-center gap-2">
                      <Icon size={14} style={{ color: s.color }} />
                      {s.name}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Visual Parameter Builder */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Tracking Parameters</label>
        <div className="rounded-lg border border-border bg-secondary/30 divide-y divide-border">
          {allParams.map((param) => {
            const isOn = enabledParams[param.key] ?? param.enabled;
            return (
              <div
                key={param.key}
                className={`flex items-center justify-between px-3 py-2.5 cursor-pointer transition-colors hover:bg-secondary/60 ${isOn ? "" : "opacity-40"}`}
                onClick={() => toggleParam(param.key)}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-4 w-4 rounded border flex items-center justify-center transition-colors ${isOn ? "bg-primary border-primary" : "border-border bg-transparent"}`}
                  >
                    {isOn && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">{param.label}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {param.key}={param.macro}
                    </p>
                  </div>
                </div>
                {isOn && (
                  <Badge variant="outline" className="text-[10px] border-primary/30 text-primary px-1.5 py-0">
                    ✓ on
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* DNS reminder */}
      <Alert className="border-primary/30 bg-primary/5">
        <AlertTriangle className="h-4 w-4 text-primary" />
        <AlertDescription className="text-xs text-muted-foreground">
          {t("campaigns.dnsReminder")}
        </AlertDescription>
      </Alert>

      {/* Live Preview */}
      {previewLink && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">{t("campaigns.campaignUrl")}</label>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="font-mono text-xs text-primary break-all leading-relaxed">{previewLink}</p>
          </div>
        </div>
      )}

      {/* Offer / Safe URL cards (shown in success context) */}
      {(offerUrl || safeUrl) && (
        <div className="grid grid-cols-2 gap-3">
          {offerUrl && (
            <div className="rounded-lg border border-border bg-secondary/50 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("campaignEdit.offerPageLabel")}
                </span>
              </div>
              <p className="text-xs font-mono text-foreground truncate" title={offerUrl}>
                {offerUrl}
              </p>
            </div>
          )}
          {safeUrl && (
            <div className="rounded-lg border border-border bg-secondary/50 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("campaignEdit.safePageLabel")}
                </span>
              </div>
              <p className="text-xs font-mono text-foreground truncate" title={safeUrl}>
                {safeUrl}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Pass-through hint */}
      {previewLink && (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-secondary/20 p-3">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t("campaigns.passthroughHint")}
          </p>
        </div>
      )}

      {/* Copy button */}
      <Button className="w-full neon-glow" onClick={handleCopy} disabled={copied || !selectedDomain}>
        {copied ? (
          <>
            <Check className="h-4 w-4 mr-2" /> {t("common.copied")}
          </>
        ) : (
          <>
            <Copy className="h-4 w-4 mr-2" /> {t("campaigns.copyLink")}
          </>
        )}
      </Button>

      {/* Webhook Section */}
      <Separator className="my-2" />

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Webhook className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">{t("campaigns.webhookTitle")}</h4>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t("campaigns.webhookDescription")}
        </p>

        {selectedDomain ? (
          <div className="space-y-2">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="font-mono text-xs text-primary break-all leading-relaxed">{webhookUrl}</p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleCopyWebhook}
              disabled={copiedWebhook}
            >
              {copiedWebhook ? (
                <>
                  <Check className="h-4 w-4 mr-2" /> {t("common.copied")}
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" /> {t("campaigns.copyWebhook")}
                </>
              )}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">{t("campaigns.selectDomainFirst")}</p>
        )}
      </div>
    </div>
  );
}
