import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, Link, Lock, Copy, CopyPlus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { getSourceByKey } from "@/lib/plan-config";
import CampaignFinalLinkModal, { type CampaignFinalLinkData } from "@/components/campaigns/CampaignFinalLinkModal";
import { canCreateResource, useBillingState } from "@/hooks/useBillingState";

export default function Campaigns() {
  const { user, effectiveUserId } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [linkModal, setLinkModal] = useState<CampaignFinalLinkData | null>(null);
  const [campaignToDelete, setCampaignToDelete] = useState<{ id: string; name: string } | null>(null);

  const {
    data: billing,
    isError: billingError,
    isLoading: billingLoading,
  } = useBillingState();

  // Gate: ACTIVE + room under effective (R8). Missing profile → locked (teste 11).
  // F1–F4: espelha Domains (load / copy FREE≠limite / at_cap→plans / impersonação).
  const isViewOnly = !!user?.id && !!effectiveUserId && effectiveUserId !== user.id;
  const activation = billingError ? null : billing?.plan.activation_status;
  const campaignsRes = billingError ? undefined : billing?.resources.campaigns;
  const isActive = activation === "ACTIVE";
  const state = campaignsRes?.state;
  const packReason = billing?.packs.campaigns.reason;
  const used = campaignsRes?.used ?? 0;
  const effective = campaignsRes?.effective ?? 0;
  const billingReady = !billingLoading && !isViewOnly;
  const canCreate =
    billingReady && !billingError && canCreateResource(activation, campaignsRes);
  const createBlocked = billingReady && !canCreate;
  const writesLocked = isViewOnly || !isActive;

  const billingHref = (tab: "plans" | "packs") =>
    `/billing?tab=${tab}&need=campaign&from=campaigns`;

  const lockedBillingTab = (): "plans" | "packs" => {
    if (!isActive) return "plans";
    if (packReason === "at_cap") return "plans";
    return "packs";
  };

  const badgeLabel = (): string => {
    if (activation === "PAST_DUE") return t("campaigns.gatePastDueShort");
    if (activation === "CANCELED") return t("campaigns.gateCanceledShort");
    if (!isActive) return t("campaigns.gatePaidPlanShort");
    if (state === "over_limit") {
      return t("campaigns.badgeOverLimit", {
        plan: billing?.plan.key ?? "",
        used,
        effective,
      });
    }
    if (state === "at_limit" && packReason === "at_cap") {
      return t("campaigns.badgeAtCap", { plan: billing?.plan.key ?? "" });
    }
    if (state === "at_limit") return t("campaigns.limitReached");
    return t("campaigns.limitReached");
  };

  const gateAlertKey = (): string => {
    if (isViewOnly) return "campaigns.viewOnlyHint";
    if (activation === "PAST_DUE") return "campaigns.gatePastDue";
    if (activation === "CANCELED") return "campaigns.gateCanceled";
    if (!isActive) return "campaigns.gatePaidPlan";
    return "campaigns.viewOnlyMode";
  };

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("*").eq("user_id", effectiveUserId!).order("created_at", { ascending: false });
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["billing_state"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["billing_state"] });
      toast.success(t("campaigns.campaignRemoved"));
    },
  });

  const handleCreateClick = () => {
    if (isViewOnly) return;
    if (createBlocked) {
      navigate(billingHref(lockedBillingTab()));
      return;
    }
    navigate("/campaigns/new");
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold">{t("campaigns.title")}</h1>
        {isViewOnly ? (
          <Button variant="outline" disabled title={t("campaigns.viewOnlyHint")}>
            <Lock className="h-4 w-4 mr-1" /> {t("campaigns.viewOnlyAdd")}
          </Button>
        ) : billingLoading ? (
          <Button disabled className="neon-glow">
            <Plus className="h-4 w-4 mr-1" /> {t("campaigns.createNew")}
          </Button>
        ) : createBlocked ? (
          <Button variant="outline" className="border-destructive/30 text-destructive" onClick={handleCreateClick}>
            <Lock className="h-4 w-4 mr-1" /> {badgeLabel()}
          </Button>
        ) : (
          <Button className="neon-glow" onClick={handleCreateClick}>
            <Plus className="h-4 w-4 mr-1" /> {t("campaigns.createNew")}
          </Button>
        )}
      </div>

      {(isViewOnly || (billingReady && !isActive)) && (
        <Alert className="border-border bg-muted/30">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <AlertDescription className="text-muted-foreground">{t(gateAlertKey())}</AlertDescription>
        </Alert>
      )}

      {/* [PR-3d.2] Empty state magnético: quando não tem campanha, substitui a
          tabela inteira por uma EmptyState com CTA óbvio. Pra usuários free/locked,
          a copy + CTA mudam pra direcionar pra /billing em vez de /campaigns/new. */}
      {!isLoading && !billingLoading && campaigns.length === 0 ? (
        <EmptyState
          icon={Target}
          title={createBlocked || isViewOnly ? t("campaigns.emptyTitleLocked") : t("campaigns.emptyTitle")}
          description={
            isViewOnly
              ? t("campaigns.viewOnlyHint")
              : createBlocked
                ? t("campaigns.emptyDescLocked")
                : t("campaigns.emptyDesc")
          }
          cta={
            isViewOnly
              ? undefined
              : {
                  label: createBlocked ? t("campaigns.emptyCtaLocked") : t("campaigns.emptyCta"),
                  onClick: handleCreateClick,
                  variant: createBlocked ? "outline" : "default",
                }
          }
        />
      ) : (
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
                        disabled={writesLocked}
                        onCheckedChange={(v) => toggleMutation.mutate({ id: c.id, is_active: v })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setLinkModal({
                              name: c.name,
                              hash: c.hash,
                              domain: c.domain || "",
                              traffic_source: c.traffic_source,
                            })
                          }
                          title="Copiar Link"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => navigate(`/campaigns/${c.id}/clone`)} title="Clonar Campanha">
                          <CopyPlus className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => navigate(`/campaigns/${c.id}/edit`)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setCampaignToDelete({ id: c.id, name: c.name })} title="Excluir">
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
      )}

      {/* ── Campaign Final Link Modal ── */}
      <CampaignFinalLinkModal
        campaign={linkModal}
        onClose={() => setLinkModal(null)}
        redirectTo=""
      />

      {/* ── Delete Confirmation Dialog ── */}
      <AlertDialog open={!!campaignToDelete} onOpenChange={(open) => { if (!open) setCampaignToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("campaigns.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("campaigns.deleteConfirmMessage", { name: campaignToDelete?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("campaigns.deleteConfirmCancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (campaignToDelete) {
                  deleteMutation.mutate(campaignToDelete.id);
                  setCampaignToDelete(null);
                }
              }}
            >
              {t("campaigns.deleteConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
