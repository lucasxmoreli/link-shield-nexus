import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { Plus, Copy, Loader2, Check, X, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";

interface InviteCodeRow {
  id: string;
  code: string;
  is_used: boolean;
  used_by: string | null;
  used_at: string | null;
  created_at: string;
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = (): string => {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    return Array.from(bytes, (b) => chars[b % chars.length]).join("");
  };
  return `CLOAK-${seg()}-${seg()}`;
}

export default function InviteCodesTab() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [customCode, setCustomCode] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: codes = [], isLoading } = useQuery({
    queryKey: ["invite_codes"],
    queryFn: async (): Promise<InviteCodeRow[]> => {
      const { data, error } = await supabase
        .from("invite_codes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as InviteCodeRow[]) || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (code: string) => {
      const { error } = await supabase.from("invite_codes").insert({ code });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invite_codes"] });
      toast.success(t("admin.codeCreated"));
      setCustomCode("");
    },
    onError: (err: Error) => {
      toast.error(err.message?.includes("duplicate") ? t("admin.codeDuplicate") : err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invite_codes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invite_codes"] });
      toast.success(t("admin.codeDeleted"));
    },
  });

  const handleCreateRandom = () => createMutation.mutate(generateCode());

  const handleCreateCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (customCode.trim().length < 4) {
      toast.error(t("admin.codeMinLength"));
      return;
    }
    createMutation.mutate(customCode.trim().toUpperCase());
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

  const usedCount = codes.filter((c) => c.is_used).length;
  const availableCount = codes.filter((c) => !c.is_used).length;

  return (
    <div className="space-y-6">
      {/* Stats + Refresh */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="grid grid-cols-3 gap-2 sm:gap-4 flex-1 min-w-[280px]">
          {[
            { label: t("admin.total"), value: codes.length, color: "text-foreground" },
            { label: t("admin.available"), value: availableCount, color: "text-primary" },
            { label: t("admin.used"), value: usedCount, color: "text-muted-foreground" },
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

      {/* Create form */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold">{t("admin.createNewCode")}</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={handleCreateRandom} disabled={createMutation.isPending} className="shrink-0">
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
            )}
            {t("admin.generateRandom")}
          </Button>
          <form onSubmit={handleCreateCustom} className="flex flex-1 gap-2">
            <Input
              placeholder={t("admin.customCodePlaceholder")}
              value={customCode}
              onChange={(e) => setCustomCode(e.target.value)}
              className="uppercase tracking-wider bg-secondary/50"
            />
            <Button type="submit" variant="secondary" disabled={createMutation.isPending || !customCode.trim()}>
              {t("common.create")}
            </Button>
          </form>
        </div>
      </div>

      {/* Codes table */}
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        ) : codes.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">{t("admin.noCodes")}</div>
        ) : (
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.code")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead>{t("admin.usedBy")}</TableHead>
                <TableHead>{t("admin.usedAt")}</TableHead>
                <TableHead>{t("domains.created")}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.map((code) => (
                <TableRow key={code.id}>
                  <TableCell className="font-mono text-sm tracking-wider">{code.code}</TableCell>
                  <TableCell>
                    {code.is_used ? (
                      <Badge variant="secondary" className="gap-1">
                        <X className="h-3 w-3" aria-hidden="true" /> {t("admin.used")}
                      </Badge>
                    ) : (
                      <Badge className="gap-1 bg-primary/15 text-primary border-primary/30 hover:bg-primary/20">
                        <Check className="h-3 w-3" aria-hidden="true" /> {t("admin.available")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {code.used_by ? <span className="font-mono text-xs">{code.used_by.slice(0, 8)}…</span> : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {code.used_at ? format(new Date(code.used_at), "MM/dd/yyyy HH:mm") : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(code.created_at), "MM/dd/yyyy HH:mm")}
                  </TableCell>
                  <TableCell>
                    {!code.is_used && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyToClipboard(code.code, code.id)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={t("common.copy", "Copiar")}
                        >
                          {copiedId === code.id ? (
                            <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                          ) : (
                            <Copy className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(code.id)}
                          disabled={deleteMutation.isPending}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          aria-label={t("common.delete", "Excluir")}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}