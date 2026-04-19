import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, Link, Lock, Copy, CopyPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { getSourceByKey } from "@/lib/plan-config";
import CampaignFinalLinkModal, { type CampaignFinalLinkData } from "@/components/campaigns/CampaignFinalLinkModal";

export default function Campaigns() {
  const { user, effectiveUserId } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [linkModal, setLinkModal] = useState<CampaignFinalLinkData | null>(null);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("user_id", effectiveUserId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Ground truth for the paywall: only ACTIVE workspaces (i.e. profiles with
  // a valid Stripe subscription) can create/toggle campaigns. Everything else
  // — INVITED, PAST_DUE, CANCELED — is treated as "free/locked" and routed
  // to /billing through the existing empty-state UI.
  const isFreePlan = profile?.activation_status !== "ACTIVE";

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

  const handleCreateClick = () => {
    if (isFreePlan) {
      navigate("/billing");
      return;
    }
    navigate("/campaigns/new");
  };

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
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(c.id)} title="Excluir">
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

      {/* ── Campaign Final Link Modal ── */}
      <CampaignFinalLinkModal
        campaign={linkModal}
        onClose={() => setLinkModal(null)}
        redirectTo=""
      />
    </div>
  );
}
