import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, CheckCircle, Trash2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { getPlanByName } from "@/lib/plan-config";
import { AddDomainModal } from "@/components/domains/AddDomainModal";
import { DomainSetupCard } from "@/components/domains/DomainSetupCard";
import type { DomainRow } from "@/hooks/useDomains";

export default function Domains() {
  const { user, effectiveUserId } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("user_id", effectiveUserId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: domains = [], isLoading } = useQuery({
    queryKey: ["domains", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("domains")
        .select("*")
        .eq("user_id", effectiveUserId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as DomainRow[];
    },
    enabled: !!user,
  });

  const planConfig = getPlanByName(profile?.plan_name);
  const maxDomains = planConfig.maxDomains;
  const currentDomains = domains.length;
  const isLimitReached = maxDomains <= 0 || currentDomains >= maxDomains;
  const usagePercent = maxDomains > 0 ? Math.round((currentDomains / maxDomains) * 100) : 0;

  const verifiedDomains = domains.filter((d) => d.is_verified);
  const pendingDomains = domains.filter((d) => !d.is_verified);

  // ── Add domain via edge function (creates Cloudflare custom hostname) ──
  const createMutation = useMutation({
    mutationFn: async () => {
      const normalized = url.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
      if (!normalized) throw new Error(t("domains.domainRequired"));

      const { data, error } = await supabase.functions.invoke("add-domain", {
        body: { url: normalized },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domains"] });
      setOpen(false);
      setUrl("");
      toast.success("Domínio adicionado. Configure os registros DNS abaixo.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Delete domain via edge function (removes from DB + Cloudflare) ──
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("delete-domain", {
        body: { domain_id: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domains"] });
      toast.success(t("domains.domainRemoved"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Verify domain — called by DomainSetupCard, returns Promise<void> ──
  // Card manages its own loading state; this function only does the API call,
  // invalidates the cache, and shows toasts. If it throws, the card catches
  // and resets its spinner.
  const handleVerifyDns = async (domainId: string): Promise<void> => {
    const { data, error } = await supabase.functions.invoke("verify-domain", {
      body: { domain_id: domainId },
    });
    if (error) throw error;

    qc.invalidateQueries({ queryKey: ["domains"] });

    if (data?.verified) {
      toast.success("Domínio verificado e SSL ativo");
    } else if (!data?.cname_ok) {
      toast.error("CNAME ainda não está apontando para cname.cloakerx.com");
    } else if (!data?.ssl_active) {
      toast.info(`Aguardando SSL: ${data?.ssl_status || "pending"}`);
    }
  };

  // ── Delete handler — returns Promise<void> for the card to await ──
  const handleDelete = async (id: string): Promise<void> => {
    await deleteMutation.mutateAsync(id);
  };

  const handleAddClick = () => {
    if (isLimitReached) {
      navigate("/billing");
      return;
    }
    setUrl("");
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
          <Button onClick={handleAddClick}>
            <Plus className="h-4 w-4 mr-1" /> {t("domains.addDomain")}
          </Button>
        )}
      </div>

      <AddDomainModal
        open={open}
        onOpenChange={setOpen}
        url={url}
        onUrlChange={setUrl}
        onSubmit={() => createMutation.mutate()}
        isPending={createMutation.isPending}
      />

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

      {/* Pending domains — Setup cards */}
      {pendingDomains.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Aguardando configuração
            </h2>
            <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[10px]">
              {pendingDomains.length}
            </Badge>
          </div>
          {pendingDomains.map((d) => (
            <DomainSetupCard
              key={d.id}
              domain={d}
              onVerify={handleVerifyDns}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Verified domains table */}
      {(verifiedDomains.length > 0 || isLoading) && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            Domínios ativos
          </h2>
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
                        {Array.from({ length: 4 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-5 w-20" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    verifiedDomains.map((d) => (
                      <TableRow key={d.id} className="border-border">
                        <TableCell className="font-mono text-sm">{d.url}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                            <CheckCircle className="h-3 w-3 mr-1" /> SSL Ativo
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(d.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(d.id)}
                            disabled={deleteMutation.isPending}
                          >
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
      )}

      {/* Empty state */}
      {!isLoading && domains.length === 0 && (
        <Card className="border-border bg-card">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">{t("campaigns.noCampaigns")}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}