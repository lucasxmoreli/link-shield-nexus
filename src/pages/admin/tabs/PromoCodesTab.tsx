import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { Plus, Copy, Loader2, Check, X, Trash2, Gift, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { PLANS } from "@/lib/plan-config";

interface PromoCodeRow {
  id: string;
  code: string;
  target_plan: string;
  duration_days: number;
  max_uses: number;
  current_uses: number;
  is_active: boolean;
  created_at: string;
}

interface PromoForm {
  code: string;
  target_plan: string;
  duration_days: number;
  max_uses: number;
}

const DEFAULT_FORM: PromoForm = {
  code: "",
  target_plan: PLANS.find((p) => !p.isFree)?.name ?? "PRO PLAN",
  duration_days: 30,
  max_uses: 1,
};

export default function PromoCodesTab() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [form, setForm] = useState<PromoForm>(DEFAULT_FORM);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: promos = [], isLoading } = useQuery({
    queryKey: ["admin_promo_codes"],
    queryFn: async (): Promise<PromoCodeRow[]> => {
      const { data, error } = await supabase
        .from("promo_codes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as PromoCodeRow[]) || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (f: PromoForm) => {
      const { error } = await supabase.from("promo_codes").insert({
        code: f.code.trim().toUpperCase(),
        target_plan: f.target_plan,
        duration_days: f.duration_days,
        max_uses: f.max_uses,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_promo_codes"] });
      toast.success(t("admin.promoCreated"));
      setDialogOpen(false);
      setForm(DEFAULT_FORM);
    },
    onError: (err: Error) => {
      toast.error(
        err.message?.includes("duplicate") || err.message?.includes("unique")
          ? t("admin.promoDuplicate")
          : err.message
      );
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("promo_codes").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_promo_codes"] });
      toast.success(t("admin.promoUpdated"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("promo_codes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_promo_codes"] });
      toast.success(t("admin.promoDeleted"));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.code.trim().length < 3) {
      toast.error(t("admin.promoMinLength"));
      return;
    }
    createMutation.mutate(form);
  };

  const copyToClipboard = async (code: string, id: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      toast.success(t("common.copied"));
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error(t("common.copyFailed", "Falha ao copiar"));
    }
  };

  const paidPlans = PLANS.filter((p) => !p.isFree);
  const activeCount = promos.filter((p) => p.is_active).length;
  const exhaustedCount = promos.filter((p) => p.current_uses >= p.max_uses).length;

  return (
    <div className="space-y-6">
      {/* Stats + Create */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="grid grid-cols-3 gap-2 sm:gap-4 flex-1 min-w-[280px]">
          {[
            { label: t("admin.total"), value: promos.length, color: "text-foreground" },
            { label: t("common.active"), value: activeCount, color: "text-primary" },
            { label: t("admin.used"), value: exhaustedCount, color: "text-muted-foreground" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-card p-4 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </div>
          ))}
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("admin.createPromo")}
        </Button>
      </div>

      {/* Promos table */}
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        ) : promos.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">{t("admin.noPromos")}</div>
        ) : (
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.code")}</TableHead>
                <TableHead>{t("admin.targetPlan")}</TableHead>
                <TableHead>{t("admin.durationDays")}</TableHead>
                <TableHead>{t("admin.uses")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead>{t("domains.created")}</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {promos.map((p) => {
                const exhausted = p.current_uses >= p.max_uses;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-sm tracking-wider font-semibold">{p.code}</TableCell>
                    <TableCell>
                      <Badge className="bg-primary/15 text-primary border-primary/30">{p.target_plan}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.duration_days}d</TableCell>
                    <TableCell className="font-mono text-sm">
                      <span className={exhausted ? "text-destructive" : "text-foreground"}>{p.current_uses}</span>
                      <span className="text-muted-foreground"> / {p.max_uses}</span>
                    </TableCell>
                    <TableCell>
                      {p.is_active && !exhausted ? (
                        <Badge className="gap-1 bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                          <Power className="h-3 w-3" aria-hidden="true" /> {t("common.active")}
                        </Badge>
                      ) : exhausted ? (
                        <Badge variant="secondary" className="gap-1">
                          <X className="h-3 w-3" aria-hidden="true" /> {t("admin.used")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <PowerOff className="h-3 w-3" aria-hidden="true" /> {t("common.inactive")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(p.created_at), "MM/dd/yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleMutation.mutate({ id: p.id, is_active: !p.is_active })}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={p.is_active ? t("common.deactivate", "Desativar") : t("common.activate", "Ativar")}
                        >
                          {p.is_active ? <PowerOff className="h-4 w-4" aria-hidden="true" /> : <Power className="h-4 w-4" aria-hidden="true" />}
                        </button>
                        <button
                          onClick={() => copyToClipboard(p.code, p.id)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={t("common.copy", "Copiar")}
                        >
                          {copiedId === p.id ? (
                            <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                          ) : (
                            <Copy className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(p.id)}
                          disabled={deleteMutation.isPending}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          aria-label={t("common.delete", "Excluir")}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md border-primary/20 bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary" aria-hidden="true" />
              {t("admin.createPromo")}
            </DialogTitle>
            <DialogDescription>{t("admin.subtitle")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">{t("admin.promoCode")}</label>
              <Input
                placeholder="e.g. SOCIOSVIP"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                className="uppercase tracking-widest font-mono bg-secondary/50"
                required
                minLength={3}
                maxLength={30}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">{t("admin.targetPlan")}</label>
              <Select value={form.target_plan} onValueChange={(v) => setForm((f) => ({ ...f, target_plan: v }))}>
                <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {paidPlans.map((p) => (
                    <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">{t("admin.durationDays")}</label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={form.duration_days}
                  onChange={(e) => setForm((f) => ({ ...f, duration_days: parseInt(e.target.value) || 30 }))}
                  className="bg-secondary/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">{t("admin.maxUses")}</label>
                <Input
                  type="number"
                  min={1}
                  max={10000}
                  value={form.max_uses}
                  onChange={(e) => setForm((f) => ({ ...f, max_uses: parseInt(e.target.value) || 1 }))}
                  className="bg-secondary/50"
                />
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={createMutation.isPending} className="gap-1.5">
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Plus className="h-4 w-4" aria-hidden="true" />
                )}
                {t("common.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}