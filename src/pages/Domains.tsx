import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, CheckCircle, XCircle, Trash2, Copy, Lock, Shield, Eye, Zap, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { getPlanByName } from "@/lib/plan-config";

const VPS_IP = "187.124.233.229";

export default function Domains() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

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

      const { error } = await supabase.from("domains").insert({
        url: normalized,
        user_id: user!.id,
        is_verified: false,
      });
      if (error) throw error;
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
      const { error } = await supabase.from("domains").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domains"] });
      toast.success(t("domains.domainRemoved"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleVerifyDns = async (domainId: string) => {
    setVerifyingId(domainId);
    try {
      const { data, error } = await supabase.functions.invoke("verify-domain", {
        body: { domain_id: domainId },
      });
      if (error) throw error;
      if (data?.verified) {
        toast.success(t("domains.verified") + " ✓");
        qc.invalidateQueries({ queryKey: ["domains"] });
      } else {
        toast.error(t("domains.dnsNotPointing"));
      }
    } catch (e: any) {
      toast.error(e.message || "Verification failed");
    } finally {
      setVerifyingId(null);
    }
  };

  const handleAddClick = () => {
    if (isLimitReached) {
      navigate("/billing");
      return;
    }
    setUrl("");
    setOpen(true);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(label);
  };

  const cfBenefits = [
    {
      icon: Shield,
      titleKey: "domains.cfBanWaveTitle",
      descKey: "domains.cfBanWaveDesc",
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      icon: Eye,
      titleKey: "domains.cfSecurityTitle",
      descKey: "domains.cfSecurityDesc",
      color: "text-chart-4",
      bg: "bg-chart-4/10",
    },
    {
      icon: Zap,
      titleKey: "domains.cfSslTitle",
      descKey: "domains.cfSslDesc",
      color: "text-chart-2",
      bg: "bg-chart-2/10",
    },
  ];

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
              <Button onClick={handleAddClick}><Plus className="h-4 w-4 mr-1" /> {t("domains.addDomain")}</Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("domains.addDomainTitle")}</DialogTitle>
                <DialogDescription>{t("domains.addDomainDesc")}</DialogDescription>
              </DialogHeader>

              <div className="space-y-5 pt-2">
                {/* Domain input */}
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

                {/* Cloudflare education section */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">{t("domains.cfWhyTitle")}</h3>
                  <div className="space-y-2.5">
                    {cfBenefits.map((b) => (
                      <div key={b.titleKey} className="flex gap-3 rounded-lg border border-border/40 bg-secondary/20 p-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${b.bg}`}>
                          <b.icon className={`h-4.5 w-4.5 ${b.color}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{t(b.titleKey)}</p>
                          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{t(b.descKey)}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Warning */}
                  <Alert className="border-orange-500/30 bg-orange-500/10">
                    <AlertTriangle className="h-4 w-4 text-orange-400" />
                    <AlertDescription className="text-orange-400 text-xs font-medium">
                      {t("domains.cfWarning")}
                    </AlertDescription>
                  </Alert>
                </div>

                {/* DNS Instructions */}
                <div className="flex flex-col space-y-2.5">
                  <h3 className="text-sm font-semibold text-foreground">DNS Setup</h3>

                  <div className="rounded-lg border border-border/30 bg-secondary/10 p-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">1</span>
                      <p className="text-sm font-medium text-foreground">{t("domains.dnsStep1")}</p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/30 bg-secondary/10 p-3 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">2</span>
                      <p className="text-sm font-medium text-foreground">{t("domains.dnsStep2")}</p>
                    </div>
                    <div className="relative">
                      <Input readOnly value={VPS_IP} className="pr-9 bg-background border-border font-mono text-sm h-9" />
                      <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => copyToClipboard(VPS_IP, t("domains.valueCopied"))}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="text-xs text-orange-400 font-medium">{t("domains.dnsStep2Note")}</p>
                  </div>

                  <div className="rounded-lg border border-border/30 bg-secondary/10 p-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">3</span>
                      <p className="text-sm font-medium text-foreground">{t("domains.dnsStep3")}</p>
                    </div>
                  </div>
                </div>

                <Button className="w-full" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !url}>
                  {createMutation.isPending ? t("common.adding") : t("common.add")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Domain usage card */}
      <Card className="border-border bg-card">
        <CardContent className="p-4 space-y-3">
          {maxDomains <= 0 ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">{t("domains.domainUsage")}</p>
                <span className="text-sm font-mono text-foreground">
                  — {t("domains.domainsUsed")}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{t("domains.noPlanDomains")}</p>
              <Badge variant="outline" className="border-primary/30 text-primary cursor-pointer" onClick={() => navigate("/billing")}>
                {t("domains.upgradeToDomains")}
              </Badge>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">{t("domains.domainUsage")}</p>
                <span className="text-sm font-mono text-foreground">
                  {currentDomains} / {maxDomains} <span className="text-muted-foreground">{t("domains.domainsUsed")}</span>
                </span>
              </div>
              <Progress value={usagePercent} className="h-2" />
            </>
          )}
        </CardContent>
      </Card>

      {/* Domains table */}
      <Card className="border-border bg-card">
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[450px]">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">{t("domains.url")}</TableHead>
                <TableHead className="text-muted-foreground">{t("common.status")}</TableHead>
                <TableHead className="text-muted-foreground">{t("domains.created")}</TableHead>
                <TableHead className="text-muted-foreground text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    {Array.from({ length: 4 }).map((_, j) => (<TableCell key={j}><Skeleton className="h-5 w-20" /></TableCell>))}
                  </TableRow>
                ))
              ) : domains.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">{t("campaigns.noCampaigns")}</TableCell>
                </TableRow>
              ) : (
                domains.map((d) => (
                  <TableRow key={d.id} className="border-border">
                    <TableCell className="font-mono text-sm">{d.url}</TableCell>
                    <TableCell>
                      {d.is_verified ? (
                        <Badge variant="outline" className="border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]">
                          <CheckCircle className="h-3 w-3 mr-1" /> {t("domains.verified")}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-yellow-500/30 bg-yellow-500/10 text-yellow-500">
                          <XCircle className="h-3 w-3 mr-1" /> {t("domains.pending")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{new Date(d.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right flex items-center justify-end gap-1">
                      {!d.is_verified && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleVerifyDns(d.id)}
                          disabled={verifyingId === d.id}
                          title="Verify DNS"
                        >
                          <RefreshCw className={`h-4 w-4 text-muted-foreground ${verifyingId === d.id ? "animate-spin" : ""}`} />
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
    </div>
  );
}
