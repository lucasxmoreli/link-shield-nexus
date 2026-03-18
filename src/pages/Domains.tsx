import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, CheckCircle, XCircle, Trash2, ShieldCheck, Copy, RefreshCw, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { getPlanByName } from "@/lib/plan-config";

function DnsSteps({ domain, t }: { domain: { id: string; url: string }; t: any }) {
  const hostname = domain.url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const txtName = `_cloakguard.${hostname}`;
  const txtValue = `cloakguard-verify=${domain.id}`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(label);
  };

  return (
    <div className="flex flex-col space-y-4">
      <div className="rounded-lg border border-border/30 bg-secondary/10 p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Step 1</p>
        <p className="text-sm text-foreground">{t("domains.dnsStep1")}</p>
      </div>
      <div className="rounded-lg border border-border/30 bg-secondary/10 p-4 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Step 2 — {t("domains.dnsStepATitle")}</p>
        <p className="text-sm text-foreground">{t("domains.dnsStepADesc")}</p>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("domains.type")}</Label>
          <div className="rounded-md bg-background border border-border px-3 py-2.5 text-sm font-mono text-foreground">A</div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("domains.nameHost")}</Label>
          <div className="relative w-full">
            <Input readOnly value="@" className="w-full pr-10 bg-background border-border font-mono text-sm" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("domains.value")}</Label>
          <div className="relative w-full">
            <Input readOnly value="185.158.133.1" className="w-full pr-10 bg-background border-border font-mono text-sm" />
            <Button variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => copyToClipboard("185.158.133.1", t("domains.valueCopied"))}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-border/30 bg-secondary/10 p-4 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Step 3 — TXT {t("domains.verification")}</p>
        <p className="text-sm text-foreground">{t("domains.dnsStep2")}</p>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("domains.type")}</Label>
          <div className="rounded-md bg-background border border-border px-3 py-2.5 text-sm font-mono text-foreground">TXT</div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("domains.nameHost")}</Label>
          <div className="relative w-full">
            <Input readOnly value={txtName} className="w-full pr-10 bg-background border-border font-mono text-sm" />
            <Button variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => copyToClipboard(txtName, t("domains.hostCopied"))}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("domains.value")}</Label>
          <div className="relative w-full">
            <Input readOnly value={txtValue} className="w-full pr-10 bg-background border-border font-mono text-sm" />
            <Button variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => copyToClipboard(txtValue, t("domains.valueCopied"))}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-border/30 bg-secondary/10 p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Step 4</p>
        <p className="text-sm text-foreground">{t("domains.dnsStep3")}</p>
      </div>
    </div>
  );
}

export default function Domains() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [dnsDialogDomain, setDnsDialogDomain] = useState<{ id: string; url: string } | null>(null);
  const [url, setUrl] = useState("");

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
      const normalized = url.trim().toLowerCase().replace(/\/+$/, "");
      if (!normalized) throw new Error(t("domains.domainRequired"));
      const isDuplicate = domains.some((d) => d.url.toLowerCase().replace(/\/+$/, "") === normalized);
      if (isDuplicate) throw new Error(t("domains.domainDuplicate"));
      const { error } = await supabase.from("domains").insert({ user_id: user!.id, url: normalized });
      if (error) {
        if (error.message?.includes("duplicate") || error.code === "23505") throw new Error(t("domains.domainDuplicate"));
        throw error;
      }
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
  });

  const verifyMutation = useMutation({
    mutationFn: async (domainId: string) => {
      const { data, error } = await supabase.functions.invoke("verify-domain", { body: { domain_id: domainId } });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["domains"] });
      if (data.verified) {
        toast.success(t("domains.domainVerified"));
        setDnsDialogDomain(null);
      } else {
        toast.error(data.message || t("domains.txtNotFound"));
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
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>{t("domains.addDomainTitle")}</DialogTitle>
                <DialogDescription>{t("domains.addDomainDesc")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>{t("domains.domainUrl")}</Label>
                  <Input placeholder={t("domains.domainUrlPlaceholder")} className="bg-secondary/50 border-border" value={url} onChange={(e) => setUrl(e.target.value)} />
                </div>
                <Button className="w-full" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !url}>
                  {createMutation.isPending ? t("common.adding") : t("common.add")}
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

      <Dialog open={!!dnsDialogDomain} onOpenChange={(v) => !v && setDnsDialogDomain(null)}>
        <DialogContent className="bg-card border-border sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {t("domains.verifyDomain")}
            </DialogTitle>
            <DialogDescription>
              {t("domains.verifyDomainDesc")}{" "}
              <span className="font-mono text-foreground">{dnsDialogDomain?.url}</span>
            </DialogDescription>
          </DialogHeader>
          {dnsDialogDomain && <DnsSteps domain={dnsDialogDomain} t={t} />}
          <Button onClick={() => dnsDialogDomain && verifyMutation.mutate(dnsDialogDomain.id)} disabled={verifyMutation.isPending} className="w-full mt-4">
            {verifyMutation.isPending ? (
              <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> {t("domains.verifying")}</>
            ) : (
              <><ShieldCheck className="h-4 w-4 mr-2" /> {t("domains.verifyAndSave")}</>
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
                        <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive cursor-pointer hover:bg-destructive/20 transition-colors" onClick={() => setDnsDialogDomain({ id: d.id, url: d.url })}>
                          <XCircle className="h-3 w-3 mr-1" /> {t("domains.pending")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{new Date(d.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right space-x-1">
                      {!d.is_verified && (
                        <Button variant="ghost" size="sm" className="text-primary hover:text-primary" onClick={() => setDnsDialogDomain({ id: d.id, url: d.url })}>
                          <ShieldCheck className="h-4 w-4 mr-1" /> {t("common.verify")}
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(d.id)}>
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
