import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { Plus, Copy, Loader2, Check, X, RefreshCw, Trash2, Power, PowerOff, Users, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";

// =============================================================================
// Types — alinhados com as RPCs do backend (B.2.5.1 + B.2.5.3.1)
// =============================================================================

interface InviteCodeRow {
  id: string;
  code: string;
  max_uses: number;
  current_uses: number;
  is_active: boolean;
  created_at: string;
  is_exhausted: boolean;
  last_redeemed_at: string | null;
}

interface RedemptionRow {
  id: string;
  redeemer_email: string | null;
  redeemed_at: string;
  user_still_exists: boolean;
  user_last_sign_in_at: string | null;
  user_email_confirmed: boolean;
}

type CodeStatus = "active" | "exhausted" | "inactive";

// =============================================================================
// Helpers
// =============================================================================

const CODE_REGEX = /^[A-Z0-9-]{4,50}$/;
const MAX_USES_MIN = 1;
const MAX_USES_MAX = 1000;

function generateRandomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = (): string => {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    return Array.from(bytes, (b) => chars[b % chars.length]).join("");
  };
  return `CLOAK-${seg()}-${seg()}`;
}

function getCodeStatus(code: InviteCodeRow): CodeStatus {
  if (!code.is_active) return "inactive";
  if (code.is_exhausted) return "exhausted";
  return "active";
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

// =============================================================================
// Main Component
// =============================================================================

export default function InviteCodesTab() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  // Form state
  const [customCode, setCustomCode] = useState<string>("");
  const [maxUsesInput, setMaxUsesInput] = useState<number>(1);

  // UI state
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [drilldownCodeId, setDrilldownCodeId] = useState<string | null>(null);
  const [drilldownCode, setDrilldownCode] = useState<string>("");
  const [deleteCandidate, setDeleteCandidate] = useState<InviteCodeRow | null>(null);

  // ──────────────────────────────────────────────────────────────────────────
  // Query: list all invite codes (uses admin_list_invite_codes RPC from B.2.5.1)
  // ──────────────────────────────────────────────────────────────────────────
  const { data: codes = [], isLoading } = useQuery({
    queryKey: ["invite_codes"],
    queryFn: async (): Promise<InviteCodeRow[]> => {
      const { data, error } = await supabase.rpc("admin_list_invite_codes");
      if (error) throw error;
      return (data as InviteCodeRow[]) || [];
    },
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Query: drilldown redemptions (only fetched when drilldown dialog opens)
  // ──────────────────────────────────────────────────────────────────────────
  const { data: redemptions = [], isLoading: isLoadingRedemptions } = useQuery({
    queryKey: ["invite_redemptions", drilldownCodeId],
    queryFn: async (): Promise<RedemptionRow[]> => {
      if (!drilldownCodeId) return [];
      const { data, error } = await supabase.rpc("admin_list_invite_redemptions", {
        p_code_id: drilldownCodeId,
      });
      if (error) throw error;
      return (data as RedemptionRow[]) || [];
    },
    enabled: !!drilldownCodeId,
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Mutations — all 4 routes through the new SECURITY DEFINER RPCs
  // ──────────────────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (input: { code: string; max_uses: number }) => {
      const { data, error } = await supabase.rpc("admin_create_invite_code", {
        p_code: input.code,
        p_max_uses: input.max_uses,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invite_codes"] });
      toast.success(t("admin.codeCreated"));
      setCustomCode("");
      setMaxUsesInput(1);
    },
    onError: (err: Error) => {
      const msg = err.message || "";
      if (msg.includes("duplicate_code")) toast.error(t("admin.codeDuplicate"));
      else if (msg.includes("invalid_code_format")) toast.error(t("admin.codeInvalidFormat"));
      else if (msg.includes("invalid_max_uses")) toast.error(t("admin.maxUsesRange"));
      else if (msg.includes("unauthorized")) toast.error(t("admin.unauthorized"));
      else toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("admin_delete_invite_code", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invite_codes"] });
      toast.success(t("admin.codeDeleted"));
      setDeleteCandidate(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async (input: { id: string; active: boolean }) => {
      const { error } = await supabase.rpc("admin_toggle_invite_code", {
        p_id: input.id,
        p_active: input.active,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invite_codes"] });
      toast.success(t("admin.codeUpdated"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Form handlers
  // ──────────────────────────────────────────────────────────────────────────
  const validateInputs = (codeToValidate: string): boolean => {
    if (!CODE_REGEX.test(codeToValidate)) {
      toast.error(t("admin.codeInvalidFormat"));
      return false;
    }
    if (maxUsesInput < MAX_USES_MIN || maxUsesInput > MAX_USES_MAX || !Number.isInteger(maxUsesInput)) {
      toast.error(t("admin.maxUsesRange"));
      return false;
    }
    return true;
  };

  const handleCreateRandom = () => {
    const code = generateRandomCode();
    if (!validateInputs(code)) return;
    createMutation.mutate({ code, max_uses: maxUsesInput });
  };

  const handleCreateCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = customCode.trim().toUpperCase();
    if (!validateInputs(normalized)) return;
    createMutation.mutate({ code: normalized, max_uses: maxUsesInput });
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

  const openDrilldown = (code: InviteCodeRow) => {
    setDrilldownCodeId(code.id);
    setDrilldownCode(code.code);
  };

  const closeDrilldown = () => {
    setDrilldownCodeId(null);
    setDrilldownCode("");
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Computed stats
  // ──────────────────────────────────────────────────────────────────────────
  const totalCodes = codes.length;
  const totalCapacity = codes.reduce((acc, c) => acc + c.max_uses, 0);
  const usedCapacity = codes.reduce((acc, c) => acc + c.current_uses, 0);
  const availableCapacity = totalCapacity - usedCapacity;

  return (
    <div className="space-y-6">
      {/* ─────────── Stats Header ─────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="grid grid-cols-3 gap-2 sm:gap-4 flex-1 min-w-[280px]">
          {[
            { label: t("admin.totalCodes"), value: totalCodes, color: "text-foreground" },
            { label: t("admin.availableCapacity"), value: availableCapacity, color: "text-primary" },
            { label: t("admin.usedCapacity"), value: usedCapacity, color: "text-muted-foreground" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-card p-4 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["invite_codes"] })}
        >
          <RefreshCw className="h-4 w-4 mr-1" aria-hidden="true" />
          {t("common.refresh")}
        </Button>
      </div>

      {/* ─────────── Create Form ─────────── */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold">{t("admin.createNewCode")}</h2>
        <form onSubmit={handleCreateCustom} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              type="button"
              onClick={handleCreateRandom}
              disabled={createMutation.isPending}
              className="shrink-0"
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
              )}
              {t("admin.generateRandom")}
            </Button>
            <Input
              type="text"
              placeholder={t("admin.customCodePlaceholder")}
              value={customCode}
              onChange={(e) => setCustomCode(e.target.value)}
              className="uppercase tracking-wider bg-secondary/50 flex-1"
              maxLength={50}
            />
            <div className="flex items-center gap-2 shrink-0">
              <label htmlFor="max_uses" className="text-xs text-muted-foreground whitespace-nowrap">
                {t("admin.maxUsesLabel")}
              </label>
              <Input
                id="max_uses"
                type="number"
                min={MAX_USES_MIN}
                max={MAX_USES_MAX}
                value={maxUsesInput}
                onChange={(e) => setMaxUsesInput(parseInt(e.target.value, 10) || 1)}
                className="w-20 bg-secondary/50 text-center"
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              disabled={createMutation.isPending || !customCode.trim()}
              className="shrink-0"
            >
              {t("common.create")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("admin.maxUsesHint")}</p>
        </form>
      </div>

      {/* ─────────── Table ─────────── */}
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        ) : codes.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">{t("admin.noCodes")}</div>
        ) : (
          <Table className="min-w-[800px]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.code")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead>{t("admin.usesColumn")}</TableHead>
                <TableHead>{t("admin.lastActivity")}</TableHead>
                <TableHead>{t("domains.created")}</TableHead>
                <TableHead className="w-32 text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.map((code) => {
                const status = getCodeStatus(code);
                const isFull = code.current_uses >= code.max_uses;
                return (
                  <TableRow
                    key={code.id}
                    className="cursor-pointer hover:bg-accent/30 transition-colors"
                    onClick={() => openDrilldown(code)}
                  >
                    <TableCell className="font-mono text-sm tracking-wider">{code.code}</TableCell>
                    <TableCell>
                      {status === "active" && (
                        <Badge className="gap-1 bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">
                          <Check className="h-3 w-3" aria-hidden="true" /> {t("admin.statusActive")}
                        </Badge>
                      )}
                      {status === "exhausted" && (
                        <Badge variant="secondary" className="gap-1">
                          <X className="h-3 w-3" aria-hidden="true" /> {t("admin.statusExhausted")}
                        </Badge>
                      )}
                      {status === "inactive" && (
                        <Badge variant="secondary" className="gap-1 bg-slate-500/15 text-slate-400 border-slate-500/30">
                          <PowerOff className="h-3 w-3" aria-hidden="true" /> {t("admin.statusInactive")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      <span className={isFull ? "text-destructive" : "text-foreground"}>{code.current_uses}</span>
                      <span className="text-muted-foreground"> / {code.max_uses}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatRelative(code.last_redeemed_at)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(code.created_at), "MM/dd/yyyy HH:mm")}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => toggleMutation.mutate({ id: code.id, active: !code.is_active })}
                          disabled={toggleMutation.isPending}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={code.is_active ? t("common.deactivate", "Desativar") : t("common.activate", "Ativar")}
                          title={code.is_active ? t("common.deactivate", "Desativar") : t("common.activate", "Ativar")}
                        >
                          {code.is_active ? <Power className="h-4 w-4" aria-hidden="true" /> : <PowerOff className="h-4 w-4" aria-hidden="true" />}
                        </button>
                        <button
                          onClick={() => copyToClipboard(code.code, code.id)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={t("common.copy", "Copiar")}
                          title={t("common.copy", "Copiar")}
                        >
                          {copiedId === code.id ? (
                            <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                          ) : (
                            <Copy className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                        <button
                          onClick={() => setDeleteCandidate(code)}
                          disabled={deleteMutation.isPending}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          aria-label={t("common.delete", "Excluir")}
                          title={t("common.delete", "Excluir")}
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

      {/* ─────────── Drilldown Dialog ─────────── */}
      <Dialog open={!!drilldownCodeId} onOpenChange={(open) => !open && closeDrilldown()}>
        <DialogContent className="sm:max-w-2xl border-primary/20 bg-card max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" aria-hidden="true" />
              {t("admin.redemptionsTitle", { code: drilldownCode })}
            </DialogTitle>
            <DialogDescription>{t("admin.redemptionsSubtitle")}</DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {isLoadingRedemptions ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
              </div>
            ) : redemptions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">{t("admin.noRedemptions")}</div>
            ) : (
              <div className="space-y-2">
                {redemptions.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary/30 px-4 py-3">
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{r.redeemer_email || t("admin.unknownEmail")}</span>
                        {!r.user_still_exists && (
                          <Badge variant="secondary" className="gap-1 text-xs">
                            <AlertCircle className="h-3 w-3" aria-hidden="true" />
                            {t("admin.userDeleted")}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(r.redeemed_at), "MM/dd/yyyy HH:mm")} · {formatRelative(r.redeemed_at)}
                      </span>
                    </div>
                    {r.user_still_exists && r.user_last_sign_in_at && (
                      <div className="text-right shrink-0">
                        <div className="text-xs text-muted-foreground">{t("admin.lastSignIn")}</div>
                        <div className="text-xs font-medium">{formatRelative(r.user_last_sign_in_at)}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─────────── Delete Confirmation AlertDialog ─────────── */}
      <AlertDialog open={!!deleteCandidate} onOpenChange={(open) => !open && setDeleteCandidate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.deleteCodeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("admin.deleteCodeDescription", { code: deleteCandidate?.code || "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteCandidate && deleteMutation.mutate(deleteCandidate.id)}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}