import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, CheckCircle, Trash2, Lock, Globe } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
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
import { AddDomainModal } from "@/components/domains/AddDomainModal";
import { DomainSetupCard } from "@/components/domains/DomainSetupCard";
import type { DomainRow } from "@/hooks/useDomains";
import { canCreateResource, useBillingState } from "@/hooks/useBillingState";

export default function Domains() {
  const { user, effectiveUserId } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

  const {
    data: billing,
    isError: billingError,
    isLoading: billingLoading,
  } = useBillingState();

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

  // Teste 11 / R12: erro da RPC (profile missing) = gate fechado, sem crash
  const isViewOnly = !!user?.id && !!effectiveUserId && effectiveUserId !== user.id;
  const activation = billingError ? null : billing?.plan.activation_status;
  const domainsRes = billingError ? undefined : billing?.resources.domains;
  const isActive = activation === "ACTIVE";
  const effective =
    domainsRes?.effective === undefined || domainsRes?.effective === null
      ? 0
      : domainsRes.effective;
  const used = domainsRes?.used ?? domains.length;
  const state = domainsRes?.state;
  const packReason = billing?.packs.domains.reason;
  const unlimited = effective < 0;
  const billingReady = !billingLoading && !isViewOnly;
  const canAdd =
    billingReady && !billingError && canCreateResource(activation, domainsRes);
  // F1: enquanto carrega, não tratar como locked
  const isLimitReached = billingReady && !canAdd;
  const usagePercent =
    !unlimited && effective > 0 ? Math.round((used / effective) * 100) : 0;

  const billingHref = (tab: "plans" | "packs") =>
    `/billing?tab=${tab}&need=domain&from=domains`;

  const gateCopyKey = (): string => {
    if (isViewOnly) return "domains.viewOnlyHint";
    if (billingError || !activation || activation === "INVITED") {
      return "domains.gatePaidPlan";
    }
    if (activation === "PAST_DUE") return "domains.gatePastDue";
    if (activation === "CANCELED") return "domains.gateCanceled";
    if (state === "over_limit") return "domains.gateOverLimit";
    if (state === "at_limit") return "domains.limitReached";
    return "domains.noPlanDomains";
  };

  // F2: FREE/INVITED ≠ "limite"; PAST_DUE/CANCELED têm copy própria
  const badgeLabel = (): string => {
    if (activation === "PAST_DUE") return t("domains.gatePastDueShort");
    if (activation === "CANCELED") return t("domains.gateCanceledShort");
    if (!isActive) return t("domains.gatePaidPlanShort");
    if (state === "over_limit") {
      return t("domains.badgeOverLimit", {
        plan: billing?.plan.key ?? "",
        used,
        effective,
      });
    }
    if (state === "at_limit" && packReason === "at_cap") {
      return t("domains.badgeAtCap", { plan: billing?.plan.key ?? "" });
    }
    if (state === "at_limit") return t("domains.limitReached");
    return t("domains.limitReached");
  };

  // F3: at_cap → plans; senão packs (fôlego ainda disponível)
  const lockedBillingTab = (): "plans" | "packs" => {
    if (!isActive) return "plans";
    if (packReason === "at_cap") return "plans";
    return "packs";
  };

  const verifiedDomains = domains.filter((d) => d.is_verified);
  const pendingDomains = domains.filter((d) => !d.is_verified);

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
      qc.invalidateQueries({ queryKey: ["billing_state"] });
      setOpen(false);
      setUrl("");
      toast.success(t("domains.domainAddedConfigureDns"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
      qc.invalidateQueries({ queryKey: ["billing_state"] });
      toast.success(t("domains.domainRemoved"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleVerifyDns = async (domainId: string): Promise<void> => {
    const { data, error } = await supabase.functions.invoke("verify-domain", {
      body: { domain_id: domainId },
    });
    if (error) throw error;

    qc.invalidateQueries({ queryKey: ["domains"] });
    qc.invalidateQueries({ queryKey: ["billing_state"] });

    if (data?.verified) {
      toast.success(t("domains.verifiedSslActive"));
    } else if (!data?.cname_ok) {
      toast.error(t("domains.cnameNotPointing"));
    } else if (!data?.ssl_active) {
      toast.info(
        `${t("domains.waitingSsl")}: ${data?.ssl_status || t("domains.pending")}`,
      );
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    await deleteMutation.mutateAsync(id);
  };

  const handleAddClick = () => {
    if (isViewOnly) return;
    if (isLimitReached) {
      navigate(billingHref(lockedBillingTab()));
      return;
    }
    setUrl("");
    setOpen(true);
  };

  // F4: impersonação — sem barra de limite (RPC é do admin, não do alvo)
  const showUsageBar =
    !isViewOnly && isActive && !billingError && (unlimited || effective > 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold">{t("domains.title")}</h1>
        {isViewOnly ? (
          <Button variant="outline" disabled title={t("domains.viewOnlyHint")}>
            <Lock className="h-4 w-4 mr-1" /> {t("domains.viewOnlyAdd")}
          </Button>
        ) : billingLoading ? (
          <Button disabled>
            <Plus className="h-4 w-4 mr-1" /> {t("domains.addDomain")}
          </Button>
        ) : isLimitReached ? (
          <Button variant="outline" className="border-destructive/30 text-destructive" onClick={handleAddClick}>
            <Lock className="h-4 w-4 mr-1" /> {badgeLabel()}
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

      <Card className="border-border bg-card">
        <CardContent className="p-4 space-y-3">
          {isViewOnly || billingLoading ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">{t("domains.domainUsage")}</p>
                {billingLoading && !isViewOnly ? (
                  <Skeleton className="h-4 w-24" />
                ) : (
                  <span className="text-sm font-mono text-foreground">—</span>
                )}
              </div>
              {isViewOnly && (
                <p className="text-xs text-muted-foreground">{t("domains.viewOnlyHint")}</p>
              )}
            </>
          ) : !showUsageBar ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">{t("domains.domainUsage")}</p>
                <span className="text-sm font-mono text-foreground">— {t("domains.domainsUsed")}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t(gateCopyKey())}</p>
              <Badge
                variant="outline"
                className="border-primary/30 text-primary cursor-pointer"
                onClick={() => navigate(billingHref("plans"))}
              >
                {t("domains.upgradeToDomains")}
              </Badge>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">{t("domains.domainUsage")}</p>
                <span className="text-sm font-mono text-foreground">
                  {unlimited
                    ? `${used} / ∞`
                    : `${used} / ${effective}`}{" "}
                  <span className="text-muted-foreground">{t("domains.domainsUsed")}</span>
                </span>
              </div>
              {!unlimited && <Progress value={Math.min(usagePercent, 100)} className="h-2" />}
              {state === "over_limit" && (
                <p className="text-xs text-muted-foreground">
                  {t("domains.gateOverLimitDetail", { used, effective })}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {pendingDomains.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              {t("domains.awaitingSetup")}
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

      {(verifiedDomains.length > 0 || isLoading) && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            {t("domains.activeDomains")}
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

      {!isLoading && !billingLoading && domains.length === 0 && (
        <EmptyState
          icon={Globe}
          title={isLimitReached || isViewOnly ? t("domains.emptyTitleLocked") : t("domains.emptyTitle")}
          description={
            isViewOnly
              ? t("domains.viewOnlyHint")
              : isLimitReached
                ? t("domains.emptyDescLocked")
                : t("domains.emptyDesc")
          }
          cta={
            isViewOnly
              ? undefined
              : isLimitReached
                ? {
                    label: t("domains.emptyCtaLocked"),
                    onClick: () => navigate(billingHref(lockedBillingTab())),
                    variant: "outline",
                  }
                : { label: t("domains.emptyCta"), onClick: () => setOpen(true) }
          }
        />
      )}
    </div>
  );
}
