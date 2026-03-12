import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Ticket, Plus, Copy, Loader2, Check, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `CLOAK-${seg()}-${seg()}`;
}

export default function InviteCodes() {
  const queryClient = useQueryClient();
  const [customCode, setCustomCode] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: codes = [], isLoading } = useQuery({
    queryKey: ["invite_codes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invite_codes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (code: string) => {
      const { error } = await supabase.from("invite_codes").insert({ code });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invite_codes"] });
      toast.success("Código criado com sucesso!");
      setCustomCode("");
    },
    onError: (err: any) => {
      if (err.message?.includes("duplicate")) {
        toast.error("Este código já existe.");
      } else {
        toast.error("Erro ao criar código.");
      }
    },
  });

  const handleCreateRandom = () => createMutation.mutate(generateCode());
  const handleCreateCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (customCode.trim().length < 4) {
      toast.error("O código precisa ter pelo menos 4 caracteres.");
      return;
    }
    createMutation.mutate(customCode.trim().toUpperCase());
  };

  const copyToClipboard = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    toast.success("Código copiado!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const usedCount = codes.filter((c) => c.is_used).length;
  const availableCount = codes.filter((c) => !c.is_used).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Ticket className="h-6 w-6 text-primary" />
            Códigos de Convite
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie os códigos de acesso ao sistema invite-only.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["invite_codes"] })}
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          Atualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total", value: codes.length, color: "text-foreground" },
          { label: "Disponíveis", value: availableCount, color: "text-primary" },
          { label: "Utilizados", value: usedCount, color: "text-muted-foreground" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-card p-4 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Create */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold">Criar novo código</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={handleCreateRandom} disabled={createMutation.isPending} className="shrink-0">
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Gerar aleatório
          </Button>
          <form onSubmit={handleCreateCustom} className="flex flex-1 gap-2">
            <Input
              placeholder="Código personalizado (ex: VIP-2024)"
              value={customCode}
              onChange={(e) => setCustomCode(e.target.value)}
              className="uppercase tracking-wider bg-secondary/50"
            />
            <Button type="submit" variant="secondary" disabled={createMutation.isPending || !customCode.trim()}>
              Criar
            </Button>
          </form>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : codes.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Nenhum código criado ainda.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Usado por</TableHead>
                <TableHead>Data de uso</TableHead>
                <TableHead>Criado em</TableHead>
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
                        <X className="h-3 w-3" /> Usado
                      </Badge>
                    ) : (
                      <Badge className="gap-1 bg-primary/15 text-primary border-primary/30 hover:bg-primary/20">
                        <Check className="h-3 w-3" /> Disponível
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {code.used_by ? (
                      <span className="font-mono text-xs">{code.used_by.slice(0, 8)}…</span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {code.used_at ? format(new Date(code.used_at), "dd/MM/yyyy HH:mm") : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(code.created_at), "dd/MM/yyyy HH:mm")}
                  </TableCell>
                  <TableCell>
                    {!code.is_used && (
                      <button
                        onClick={() => copyToClipboard(code.code, code.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title="Copiar código"
                      >
                        {copiedId === code.id ? (
                          <Check className="h-4 w-4 text-primary" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
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
