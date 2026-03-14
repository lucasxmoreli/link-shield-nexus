import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, CheckCircle, XCircle, Trash2, ShieldCheck, Copy, RefreshCw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

function DnsInstructions({ domain }: { domain: { id: string; url: string } }) {
  const hostname = domain.url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const txtName = `_cloakguard.${hostname}`;
  const txtValue = `cloakguard-verify=${domain.id}`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-border bg-secondary/20 p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Info className="h-4 w-4 text-primary" />
          Adicione o seguinte registro TXT no DNS do seu domínio:
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Tipo</Label>
          <div className="rounded-md bg-background border border-border px-3 py-2.5 text-sm font-mono text-foreground">
            TXT
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Nome / Host</Label>
          <div className="relative w-full">
            <Input
              readOnly
              value={txtName}
              className="w-full pr-10 bg-background border-border font-mono text-sm"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => copyToClipboard(txtName, "Host")}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Valor</Label>
          <div className="relative w-full">
            <Input
              readOnly
              value={txtValue}
              className="w-full pr-10 bg-background border-border font-mono text-sm"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => copyToClipboard(txtValue, "Valor")}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Após adicionar o registro, aguarde a propagação do DNS (pode levar até 72h) e clique em <strong className="text-foreground">Verificar</strong>.
      </p>
    </div>
  );
}

export default function Domains() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dnsDialogDomain, setDnsDialogDomain] = useState<{ id: string; url: string } | null>(null);
  const [url, setUrl] = useState("");

  const { data: domains = [], isLoading } = useQuery({
    queryKey: ["domains", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("domains").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("domains").insert({ user_id: user!.id, url });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domains"] });
      setOpen(false);
      setUrl("");
      toast.success("Domínio adicionado! Configure o DNS para verificar.");
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
      toast.success("Domínio removido");
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (domainId: string) => {
      const { data, error } = await supabase.functions.invoke("verify-domain", {
        body: { domain_id: domainId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["domains"] });
      if (data.verified) {
        toast.success("Domínio verificado com sucesso!");
        setDnsDialogDomain(null);
      } else {
        toast.error(data.message || "Registro TXT não encontrado.");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Domains</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Add Domain</Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>Adicionar Domínio</DialogTitle>
              <DialogDescription>Insira o domínio que deseja usar com o CloakGuard.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>URL do Domínio</Label>
                <Input
                  placeholder="Ex: track.mysite.com"
                  className="bg-secondary/50 border-border"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
              <Button className="w-full" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !url}>
                {createMutation.isPending ? "Adicionando..." : "Adicionar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* DNS Instructions Dialog */}
      <Dialog open={!!dnsDialogDomain} onOpenChange={(v) => !v && setDnsDialogDomain(null)}>
        <DialogContent className="bg-card border-border sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Verificar Domínio
            </DialogTitle>
            <DialogDescription>
              Configure o registro DNS para verificar a propriedade de{" "}
              <span className="font-mono text-foreground">{dnsDialogDomain?.url}</span>
            </DialogDescription>
          </DialogHeader>
          {dnsDialogDomain && <DnsInstructions domain={dnsDialogDomain} />}
          <Button
            onClick={() => dnsDialogDomain && verifyMutation.mutate(dnsDialogDomain.id)}
            disabled={verifyMutation.isPending}
            className="w-full mt-2"
          >
            {verifyMutation.isPending ? (
              <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Verificando...</>
            ) : (
              <><ShieldCheck className="h-4 w-4 mr-2" /> Verificar Agora</>
            )}
          </Button>
        </DialogContent>
      </Dialog>

      <Card className="border-border bg-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">URL</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground">Criado em</TableHead>
                <TableHead className="text-muted-foreground text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-20" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : domains.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Nenhum domínio adicionado ainda.
                  </TableCell>
                </TableRow>
              ) : (
                domains.map((d) => (
                  <TableRow key={d.id} className="border-border">
                    <TableCell className="font-mono text-sm">{d.url}</TableCell>
                    <TableCell>
                      {d.is_verified ? (
                        <Badge variant="outline" className="border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]">
                          <CheckCircle className="h-3 w-3 mr-1" /> Verified
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-destructive/30 bg-destructive/10 text-destructive cursor-pointer hover:bg-destructive/20 transition-colors"
                          onClick={() => setDnsDialogDomain({ id: d.id, url: d.url })}
                        >
                          <XCircle className="h-3 w-3 mr-1" /> Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(d.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {!d.is_verified && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-primary hover:text-primary"
                          onClick={() => setDnsDialogDomain({ id: d.id, url: d.url })}
                        >
                          <ShieldCheck className="h-4 w-4 mr-1" /> Verificar
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
