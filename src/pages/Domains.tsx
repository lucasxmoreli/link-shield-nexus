import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, CheckCircle, XCircle, Trash2, ShieldCheck, Copy, RefreshCw, Lock, Bug, Zap, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { getPlanByName } from "@/lib/plan-config";

const CNAME_TARGET = "proxy.cloakerguard.shop";

function CnameSetupSteps({ domain, t }: { domain: string; t: any }) {
  const hostname = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const parts = hostname.split(".");
  const cnameName = parts.length > 2 ? parts[0] : "@";

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(label);
  };

  return (
    <div className="flex flex-col space-y-3">
      <div className="rounded-lg border border-border/30 bg-secondary/10 p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">1</span>
          <p className="text-sm font-medium text-foreground">{t("domains.cnameStep1")}</p>
        </div>
      </div>

      <div className="rounded-lg border border-border/30 bg-secondary/10 p-3 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">2</span>
          <p className="text-sm font-medium text-foreground">{t("domains.cnameStep2")}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("domains.nameHost")}</Label>
            <div className="relative">
              <Input readOnly value={cnameName} className="pr-9 bg-background border-border font-mono text-sm h-9" />
              <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => copyToClipboard(cnameName, t("domains.hostCopied"))}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("domains.target")}</Label>
            <div className="relative">
              <Input readOnly value={CNAME_TARGET} className="pr-9 bg-background border-border font-mono text-sm h-9" />
              <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => copyToClipboard(CNAME_TARGET, t("domains.valueCopied"))}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-xs text-muted-foreground">{t("domains.type")}:</span>
          <Badge variant="secondary" className="text-xs font-mono">CNAME</Badge>
        </div>
      </div>

      <div className="rounded-lg border border-border/30 bg-secondary/10 p-3">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">3</span>
          <p className="text-sm font-medium text-foreground">{t("domains.cnameStep3")}</p>
        </div>
      </div>
    </div>
  );
}

interface TxtValidationData {
  ownership_verification?: { name?: string; value?: string } | null;
  ssl_validation_records?: Array<{ txt_name?: string; txt_value?: string }>;
}

function TxtFallbackSection({ validationData, t }: { validationData: TxtValidationData | null; t: any }) {
  if (!validationData) return null;

  const ownership = validationData.ownership_verification;
  const sslRecord = validationData.ssl_validation_records?.[0];

  if (!ownership?.name && !sslRecord?.txt_name) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t("domains.valueCopied"));
  };

  return (
    <div className="space-y-3 mt-2">
      <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
        <p className="text-xs font-semibold text-yellow-400 mb-1">{t("domains.txtFallbackTitle")}</p>
        <p className="text-xs text-muted-foreground">{t("domains.txtFallbackWarning")}</p>
      </div>

      {ownership?.name && ownership?.value && (
        <div className="rounded-lg border border-border/30 bg-secondary/10 p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("domains.txtOwnership")}</p>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("domains.nameHost")}</Label>
            <div className="relative">
              <Input readOnly value={ownership.name} className="pr-9 bg-background border-border font-mono text-xs h-9" />
              <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => copyToClipboard(ownership.name!)}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("domains.value")}</Label>
            <div className="relative">
              <Input readOnly value={ownership.value} className="pr-9 bg-background border-border font-mono text-xs h-9" />
              <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => copyToClipboard(ownership.value!)}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {sslRecord?.txt_name && sslRecord?.txt_value && (
        <div className="rounded-lg border border-border/30 bg-secondary/10 p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("domains.txtSslCert")}</p>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("domains.nameHost")}</Label>
            <div className="relative">
              <Input readOnly value={sslRecord.txt_name} className="pr-9 bg-background border-border font-mono text-xs h-9" />
              <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => copyToClipboard(sslRecord.txt_name!)}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("domains.value")}</Label>
            <div className="relative">
              <Input readOnly value={sslRecord.txt_value} className="pr-9 bg-background border-border font-mono text-xs h-9" />
              <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => copyToClipboard(sslRecord.txt_value!)}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Domains() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [setupDomain, setSetupDomain] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [debugMode, setDebugMode] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<{ status: string; message: string } | null>(null);
  const [apiTestLoading, setApiTestLoading] = useState(false);
  const [txtValidationData, setTxtValidationData] = useState<TxtValidationData | null>(null);
  const [showTxtFallback, setShowTxtFallback] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("user_id", user!.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: domains = [], isLoading } = useQuery({
    queryKey: ["domains", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("domains").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const planConfig = getPlanByName(profile?.plan_name);
  const maxDomains = planConfig.maxDomains;
  const currentDomains = domains.length;
  const isLimitReached = maxDomains <= 0 || currentDomains >= maxDomains;
  const usagePercent = maxDomains > 0 ? Math.round((currentDomains / maxDomains) * 100) : 0;

  const createMutation = useMutation({
    mutationFn: async () => {
      const normalized = url.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
      if (!normalized) throw new Error(t("domains.domainRequired"));
      const isDuplicate = domains.some((d) => d.url.toLowerCase().replace(/\/+$/, "") === normalized);
      if (isDuplicate) throw new Error(t("domains.domainDuplicate"));

      const { data, error } = await supabase.functions.invoke("add-custom-hostname", {
        body: { hostname: normalized },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domains"] });
      setOpen(false);
      setUrl("");
      toast.success(t("domains.domainAdded"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("delete-custom-hostname", {
        body: { domain_id: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domains"] });
      toast.success(t("domains.domainRemovedCloudflare"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const checkStatusMutation = useMutation({
    mutationFn: async (domainId: string) => {
      const { data, error } = await supabase.functions.invoke("check-hostname-status", {
        body: { domain_id: domainId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["domains"] });
      setTxtValidationData({
        ownership_verification: data.ownership_verification,
        ssl_validation_records: data.ssl_validation_records,
      });
      if (data.active) {
        toast.success("✅ " + t("domains.domainActive"));
        setSetupDomain(null);
        setTxtValidationData(null);
        setShowTxtFallback(false);
      } else {
        toast.info(t("domains.domainPending"), { duration: 6000 });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleAddClick = () => {
    if (isLimitReached) {
      navigate("/billing");
      return;
    }
    setOpen(true);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold">{t("domains.title")}</h1>
        {isLimitReached ? (
          <Button variant="outline" className="border-destructive/30 text-destructive" onClick={handleAddClick}>
            <Lock className="h-4 w-4 mr-1" /> {t("domains.limitReached")}
          </Button>
        ) : (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> {t("domains.addDomain")}</Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t("domains.addDomainTitle")}</DialogTitle>
                <DialogDescription>{t("domains.addDomainDesc")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label className="text-sm">{t("domains.domainUrl")}</Label>
                  <Input
                    placeholder={t("domains.domainUrlPlaceholder")}
                    className="bg-secondary/50 border-border mt-1.5"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && url) createMutation.mutate(); }}
                  />
                </div>

                {/* Inline DNS Instructions */}
                <div className="flex flex-col space-y-2.5">
                  <div className="rounded-lg border border-border/30 bg-secondary/10 p-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">1</span>
                      <p className="text-sm font-medium text-foreground">{t("domains.cnameStep1")}</p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/30 bg-secondary/10 p-3 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">2</span>
                      <p className="text-sm font-medium text-foreground">{t("domains.cnameStep2")}</p>
                    </div>
                    <div className="relative">
                      <Input readOnly value={CNAME_TARGET} className="pr-9 bg-background border-border font-mono text-sm h-9" />
                      <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => { navigator.clipboard.writeText(CNAME_TARGET); toast.success(t("domains.valueCopied")); }}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/30 bg-secondary/10 p-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">3</span>
                      <p className="text-sm font-medium text-foreground">{t("domains.cnameStep3Add")}</p>
                    </div>
                  </div>
                </div>

                {/* TXT fallback link */}
                <button
                  className="text-xs text-primary/70 hover:text-primary underline underline-offset-2 transition-colors text-left"
                  onClick={() => setShowTxtFallback((v) => !v)}
                >
                  {t("domains.txtFallbackLink")}
                </button>
                {showTxtFallback && (
                  <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
                    <p className="text-xs text-muted-foreground">{t("domains.txtFallbackWarning")}</p>
                  </div>
                )}

                <Button className="w-full" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !url}>
                  {createMutation.isPending ? t("domains.checking") : t("common.add")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="border-border bg-card">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">{t("domains.domainUsage")}</p>
            <span className="text-sm font-mono text-foreground">
              {currentDomains} / {maxDomains} <span className="text-muted-foreground">{t("domains.domainsUsed")}</span>
            </span>
          </div>
          <Progress value={usagePercent} className="h-2" />
          {maxDomains <= 0 && <p className="text-xs text-muted-foreground">{t("domains.noPlanDomains")}</p>}
        </CardContent>
      </Card>

      {/* Setup Domain Dialog */}
      <Dialog open={!!setupDomain} onOpenChange={(v) => { if (!v) { setSetupDomain(null); setTxtValidationData(null); setShowTxtFallback(false); } }}>
        <DialogContent className="bg-card border-border sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {t("domains.setupDomain")}
            </DialogTitle>
            <DialogDescription>
              {t("domains.setupDomainDesc")}{" "}
              <span className="font-mono text-foreground">{setupDomain}</span>
            </DialogDescription>
          </DialogHeader>

          {setupDomain && <CnameSetupSteps domain={setupDomain} t={t} />}

          <p className="text-xs text-muted-foreground">{t("domains.cnameNote")}</p>

          {/* Progressive disclosure: TXT fallback link */}
          {setupDomain && !domains.find(d => d.url === setupDomain)?.is_verified && !showTxtFallback && (
            <button
              className="text-xs text-primary/70 hover:text-primary underline underline-offset-2 transition-colors text-left"
              onClick={() => {
                setShowTxtFallback(true);
                // Auto-fetch validation data if not already loaded
                if (!txtValidationData) {
                  const d = domains.find((d) => d.url === setupDomain);
                  if (d) checkStatusMutation.mutate(d.id);
                }
              }}
            >
              {t("domains.txtFallbackLink")}
            </button>
          )}

          {/* TXT Fallback Section - only shown when user clicks the link */}
          {showTxtFallback && (
            <TxtFallbackSection validationData={txtValidationData} t={t} />
          )}

          <Button
            onClick={() => {
              const d = domains.find((d) => d.url === setupDomain);
              if (d) checkStatusMutation.mutate(d.id);
            }}
            disabled={checkStatusMutation.isPending}
            className="w-full mt-2"
          >
            {checkStatusMutation.isPending ? (
              <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> {t("domains.checking")}</>
            ) : (
              <><ShieldCheck className="h-4 w-4 mr-2" /> {t("domains.checkStatus")}</>
            )}
          </Button>
        </DialogContent>
      </Dialog>

      <Card className="border-border bg-card">
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[550px]">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">{t("domains.url")}</TableHead>
                <TableHead className="text-muted-foreground">{t("common.status")}</TableHead>
                <TableHead className="text-muted-foreground">{t("domains.sslStatus")}</TableHead>
                <TableHead className="text-muted-foreground">{t("domains.created")}</TableHead>
                <TableHead className="text-muted-foreground text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    {Array.from({ length: 5 }).map((_, j) => (<TableCell key={j}><Skeleton className="h-5 w-20" /></TableCell>))}
                  </TableRow>
                ))
              ) : domains.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">{t("campaigns.noCampaigns")}</TableCell>
                </TableRow>
              ) : (
                domains.map((d) => (
                  <TableRow key={d.id} className="border-border">
                    <TableCell className="font-mono text-sm">{d.url}</TableCell>
                    <TableCell>
                      {d.ssl_status === "active" && d.is_verified ? (
                        <Badge variant="outline" className="border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]">
                          <CheckCircle className="h-3 w-3 mr-1" /> {t("domains.verified")}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-yellow-500/30 bg-yellow-500/10 text-yellow-500 cursor-pointer hover:bg-yellow-500/20 transition-colors" onClick={() => setSetupDomain(d.url)}>
                          <XCircle className="h-3 w-3 mr-1" /> {t("domains.pending")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {d.ssl_status === "active" ? (
                        <Badge variant="outline" className="border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] text-xs">
                          <Lock className="h-3 w-3 mr-1" /> Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-yellow-500/30 bg-yellow-500/10 text-yellow-500 text-xs capitalize">
                          {d.ssl_status || "pending"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{new Date(d.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right space-x-1">
                      {d.ssl_status !== "active" && (
                        <Button variant="ghost" size="sm" className="text-primary hover:text-primary" onClick={() => setSetupDomain(d.url)}>
                          <ShieldCheck className="h-4 w-4 mr-1" /> {t("domains.checkStatus")}
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(d.id)} disabled={deleteMutation.isPending}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Debug Mode Panel */}
      <Card className="border-border bg-card">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bug className="h-4 w-4 text-yellow-500" />
              <p className="text-sm font-semibold">System Diagnostic — Debug Mode</p>
            </div>
            <Switch checked={debugMode} onCheckedChange={setDebugMode} />
          </div>

          {debugMode && (
            <div className="space-y-4 pt-2 border-t border-border">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">1. Cloudflare API Connection</p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={apiTestLoading}
                  onClick={async () => {
                    setApiTestLoading(true);
                    setApiTestResult(null);
                    try {
                      const { data, error } = await supabase.functions.invoke("cf-api-test");
                      if (error) {
                        setApiTestResult({ status: "error", message: `Edge function error: ${error.message}` });
                      } else {
                        setApiTestResult(data);
                      }
                    } catch (e: any) {
                      setApiTestResult({ status: "error", message: e.message });
                    } finally {
                      setApiTestLoading(false);
                    }
                  }}
                >
                  <Wifi className="h-3.5 w-3.5 mr-1.5" />
                  {apiTestLoading ? "Testing..." : "Ping Cloudflare API"}
                </Button>
                {apiTestResult && (
                  <div className={`rounded-lg border p-3 text-sm font-mono ${
                    apiTestResult.status === "success"
                      ? "border-green-500/30 bg-green-500/5 text-green-400"
                      : apiTestResult.status === "unauthorized"
                      ? "border-yellow-500/30 bg-yellow-500/5 text-yellow-400"
                      : "border-destructive/30 bg-destructive/5 text-destructive"
                  }`}>
                    {apiTestResult.message}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">2. Mock Status Transition</p>
                <p className="text-xs text-muted-foreground">Simulate a domain status change to test if the UI updates correctly.</p>
                <div className="flex flex-wrap gap-2">
                  {domains.map((d) => (
                    <div key={d.id} className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2">
                      <span className="text-xs font-mono">{d.url}</span>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs border-green-500/30 text-green-400 hover:bg-green-500/10"
                          onClick={async () => {
                            const { error } = await supabase.from("domains").update({ is_verified: true, ssl_status: "active" }).eq("id", d.id);
                            if (error) { toast.error(error.message); return; }
                            qc.invalidateQueries({ queryKey: ["domains"] });
                            toast.success(`✅ ${d.url} → Active (mock)`);
                          }}
                        >
                          <Zap className="h-3 w-3 mr-1" /> Set Active
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                          onClick={async () => {
                            const { error } = await supabase.from("domains").update({ is_verified: false, ssl_status: "pending" }).eq("id", d.id);
                            if (error) { toast.error(error.message); return; }
                            qc.invalidateQueries({ queryKey: ["domains"] });
                            toast.success(`⏳ ${d.url} → Pending (mock)`);
                          }}
                        >
                          Set Pending
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">3. Database Column Sync</p>
                <div className="rounded-lg border border-border bg-secondary/10 p-3 overflow-x-auto">
                  <table className="text-xs font-mono w-full">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="text-left pr-4 pb-1">URL</th>
                        <th className="text-left pr-4 pb-1">CF Hostname ID</th>
                        <th className="text-left pr-4 pb-1">SSL Status</th>
                        <th className="text-left pb-1">Verified</th>
                      </tr>
                    </thead>
                    <tbody>
                      {domains.map((d) => (
                        <tr key={d.id}>
                          <td className="pr-4 py-0.5">{d.url}</td>
                          <td className="pr-4 py-0.5">
                            {d.cloudflare_hostname_id ? (
                              <span className="text-green-400">{d.cloudflare_hostname_id.substring(0, 12)}...</span>
                            ) : (
                              <span className="text-yellow-400">NULL ⚠️</span>
                            )}
                          </td>
                          <td className="pr-4 py-0.5">
                            <span className={d.ssl_status === "active" ? "text-green-400" : "text-yellow-400"}>
                              {d.ssl_status || "null"}
                            </span>
                          </td>
                          <td className="py-0.5">
                            {d.is_verified ? <span className="text-green-400">✓</span> : <span className="text-yellow-400">✗</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {domains.some((d) => !d.cloudflare_hostname_id) && (
                  <p className="text-xs text-yellow-400">
                    ⚠️ Some domains have no Cloudflare Hostname ID. These were created before the Cloudflare SaaS integration was deployed.
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
