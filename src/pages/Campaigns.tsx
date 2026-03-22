import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Copy, Pencil, Trash2, Link, Check, Lock, AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { getSourceByKey, getPlanByName } from "@/lib/plan-config";

// ── Per-platform parameter definitions ────────────────────────────────────────
// Each parameter has a label, the URL key, and the macro value for that platform.
// enabled: true = checked by default when the modal opens
const PLATFORM_PARAMS: Record<string, { key: string; label: string; macro: string; enabled: boolean }[]> = {
  tiktok: [
    { key: "click_id", label: "Click ID", macro: "__CALLBACK_PARAM__", enabled: true },
    { key: "campaign", label: "Campaign", macro: "__CID_NAME__", enabled: true },
    { key: "adset", label: "Ad Set", macro: "__AID_NAME__", enabled: true },
    { key: "cost", label: "Cost", macro: "__VALUE__", enabled: true },
    { key: "placement", label: "Placement", macro: "__PLACEMENT__", enabled: false },
    { key: "source_platform", label: "Platform", macro: "tiktok", enabled: false },
  ],
  facebook: [
    { key: "click_id", label: "Click ID", macro: "{{fbclid}}", enabled: true },
    { key: "campaign", label: "Campaign", macro: "{{campaign.name}}", enabled: true },
    { key: "adset", label: "Ad Set", macro: "{{adset.name}}", enabled: true },
    { key: "cost", label: "Cost", macro: "{{cost_per_result}}", enabled: true },
    { key: "source_platform", label: "Platform", macro: "facebook", enabled: false },
  ],
  instagram: [
    { key: "click_id", label: "Click ID", macro: "{{fbclid}}", enabled: true },
    { key: "campaign", label: "Campaign", macro: "{{campaign.name}}", enabled: true },
    { key: "adset", label: "Ad Set", macro: "{{adset.name}}", enabled: true },
    { key: "cost", label: "Cost", macro: "{{cost_per_result}}", enabled: true },
    { key: "source_platform", label: "Platform", macro: "instagram", enabled: false },
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

const FALLBACK_PARAMS = [
  { key: "utm_source", label: "UTM Source", macro: "{source}", enabled: true },
  { key: "utm_campaign", label: "UTM Campaign", macro: "{campaign}", enabled: true },
  { key: "utm_medium", label: "UTM Medium", macro: "{medium}", enabled: false },
];

function getParamsForSource(source: string) {
  return PLATFORM_PARAMS[source] ?? FALLBACK_PARAMS;
}

function buildUrlFromParams(domain: string, hash: string, activeParams: { key: string; macro: string }[]): string {
  const base = domain.trim().replace(/\/+$/, "");
  const dm = base.startsWith("http") ? base : `https://${base}`;
  const root = `${dm}/c/${hash}`;
  if (activeParams.length === 0) return root;
  const qs = activeParams.map((p) => `${p.key}=${p.macro}`).join("&");
  return `${root}?${qs}`;
}

function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    tiktok: "TikTok Ads",
    facebook: "Facebook Ads",
    instagram: "Instagram Ads",
    google: "Google Ads",
    youtube: "YouTube Ads",
  };
  return labels[source] || "Organic / Other";
}

export default function Campaigns() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [linkModal, setLinkModal] = useState<{
    open: boolean;
    hash: string;
    name: string;
    source: string;
  }>({ open: false, hash: "", name: "", source: "" });

  const [selectedDomain, setSelectedDomain] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Tracks which param keys are enabled in the visual builder
  const [enabledParams, setEnabledParams] = useState<Record<string, boolean>>({});

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("user_id", user!.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const planConfig = getPlanByName(profile?.plan_name);
  const isFreePlan = planConfig.isFree;

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: domains = [] } = useQuery({
    queryKey: ["domains", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("domains").select("*").eq("is_verified", true);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("campaigns").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success(t("campaigns.campaignRemoved"));
    },
  });

  // Build the active params list from enabledParams state
  const getActiveParams = () => {
    const allParams = getParamsForSource(linkModal.source);
    return allParams.filter((p) => enabledParams[p.key] ?? p.enabled);
  };

  const getFullLink = () => {
    if (!selectedDomain) return "";
    return buildUrlFromParams(selectedDomain, linkModal.hash, getActiveParams());
  };

  const openLinkModal = (hash: string, name: string, source: string) => {
    setCopied(false);
    setSelectedDomain(domains.length > 0 ? domains[0].url : "");
    // Initialize enabled state from defaults for this source
    const params = getParamsForSource(source);
    const defaults: Record<string, boolean> = {};
    params.forEach((p) => {
      defaults[p.key] = p.enabled;
    });
    setEnabledParams(defaults);
    setLinkModal({ open: true, hash, name, source });
  };

  const toggleParam = (key: string) => {
    setEnabledParams((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCopyLink = async () => {
    const link = getFullLink();
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => {
      setLinkModal({ open: false, hash: "", name: "", source: "" });
      setCopied(false);
      toast.success(t("campaigns.campaignLinkCopied"), {
        style: { background: "hsl(var(--success))", color: "#fff", border: "none" },
      });
    }, 600);
  };

  const handleCreateClick = () => {
    if (isFreePlan) {
      navigate("/billing");
      return;
    }
    navigate("/campaigns/new");
  };

  const allParams = getParamsForSource(linkModal.source);
  const previewLink = getFullLink();

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold">{t("campaigns.title")}</h1>
        {isFreePlan ? (
          <Button variant="outline" className="border-destructive/30 text-destructive" onClick={handleCreateClick}>
            <Lock className="h-4 w-4 mr-1" /> {t("campaigns.upgradeToCreate")}
          </Button>
        ) : (
          <Button className="neon-glow" onClick={handleCreateClick}>
            <Plus className="h-4 w-4 mr-1" /> {t("campaigns.createNew")}
          </Button>
        )}
      </div>

      {isFreePlan && (
        <Alert className="border-border bg-muted/30">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <AlertDescription className="text-muted-foreground">{t("campaigns.viewOnlyMode")}</AlertDescription>
        </Alert>
      )}

      <Card className="border-border bg-card">
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[650px]">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">{t("campaigns.hash")}</TableHead>
                <TableHead className="text-muted-foreground">{t("campaigns.name")}</TableHead>
                <TableHead className="text-muted-foreground">{t("campaigns.source")}</TableHead>
                <TableHead className="text-muted-foreground">{t("campaigns.date")}</TableHead>
                <TableHead className="text-muted-foreground">{t("common.active")}</TableHead>
                <TableHead className="text-muted-foreground text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-5 w-20" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : campaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {t("campaigns.noCampaigns")}
                  </TableCell>
                </TableRow>
              ) : (
                campaigns.map((c) => (
                  <TableRow key={c.id} className="border-border">
                    <TableCell className="font-mono text-sm text-primary">{c.hash}</TableCell>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>
                      {(() => {
                        const src = getSourceByKey(c.traffic_source);
                        if (!src)
                          return (
                            <Badge variant="outline" className="border-border">
                              {c.traffic_source}
                            </Badge>
                          );
                        const Icon = src.icon;
                        return (
                          <Badge variant="outline" className="border-border gap-1.5">
                            <Icon size={12} style={{ color: src.color }} />
                            {src.name}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(c.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={c.is_active ?? false}
                        disabled={isFreePlan}
                        onCheckedChange={(v) => toggleMutation.mutate({ id: c.id, is_active: v })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openLinkModal(c.hash, c.name, c.traffic_source)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => navigate(`/campaigns/${c.id}/edit`)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(c.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Campaign Link Modal with Visual Parameter Builder ── */}
      <Dialog open={linkModal.open} onOpenChange={(open) => setLinkModal((prev) => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-lg border-border bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Link className="h-5 w-5 text-primary" />
              {t("campaigns.campaignLink")}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">{linkModal.name}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Platform badge */}
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {(() => {
                  const src = getSourceByKey(linkModal.source);
                  if (src) {
                    const Icon = src.icon;
                    return (
                      <>
                        <Icon size={12} style={{ color: src.color }} className="mr-1" />
                        {getSourceLabel(linkModal.source)}
                      </>
                    );
                  }
                  return getSourceLabel(linkModal.source);
                })()}
              </Badge>
            </div>

            {/* Domain selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">{t("campaigns.domain")}</label>
              {domains.length === 0 ? (
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

            {/* ── Visual Parameter Builder ── */}
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
                        {/* Checkbox visual */}
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

            {/* ── Live Preview ── */}
            {previewLink && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">{t("campaigns.campaignUrl")}</label>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="font-mono text-xs text-primary break-all leading-relaxed">{previewLink}</p>
                </div>
              </div>
            )}

            {/* Copy button */}
            <Button className="w-full neon-glow" onClick={handleCopyLink} disabled={copied || !selectedDomain}>
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
