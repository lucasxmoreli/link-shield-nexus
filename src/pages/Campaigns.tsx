import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Copy, Pencil, Trash2, Link, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const sourceColors: Record<string, string> = {
  tiktok: "bg-primary/20 text-primary",
  facebook: "bg-blue-500/20 text-blue-400",
  google: "bg-success/20 text-success",
};

export default function Campaigns() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [linkModal, setLinkModal] = useState<{ open: boolean; hash: string; name: string }>({ open: false, hash: "", name: "" });
  const [selectedDomain, setSelectedDomain] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: domains = [] } = useQuery({
    queryKey: ["domains", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("domains").select("*").eq("is_verified", true);
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
      toast.success("Campanha removida");
    },
  });

  const defaultBase = window.location.origin;

  const getFullLink = () => {
    const base = selectedDomain || defaultBase;
    const domain = base.replace(/\/+$/, "");
    return `${domain.startsWith("http") ? domain : `https://${domain}`}/${linkModal.hash}`;
  };

  const openLinkModal = (hash: string, name: string) => {
    setCopied(false);
    setSelectedDomain("");
    setLinkModal({ open: true, hash, name });
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(getFullLink());
    setCopied(true);
    setTimeout(() => {
      setLinkModal({ open: false, hash: "", name: "" });
      setCopied(false);
      toast.success("Link da campanha copiado com sucesso!", {
        style: { background: "hsl(var(--success))", color: "#fff", border: "none" },
      });
    }, 600);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <Button className="neon-glow" onClick={() => navigate("/campaigns/new")}>
          <Plus className="h-4 w-4 mr-1" /> Create +
        </Button>
      </div>

      <Card className="border-border bg-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Hash</TableHead>
                <TableHead className="text-muted-foreground">Name</TableHead>
                <TableHead className="text-muted-foreground">Source</TableHead>
                <TableHead className="text-muted-foreground">Date</TableHead>
                <TableHead className="text-muted-foreground">Active</TableHead>
                <TableHead className="text-muted-foreground text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    {Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-20" /></TableCell>)}
                  </TableRow>
                ))
              ) : campaigns.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma campanha criada ainda.</TableCell></TableRow>
              ) : (
                campaigns.map((c) => (
                  <TableRow key={c.id} className="border-border">
                    <TableCell className="font-mono text-sm text-primary">{c.hash}</TableCell>
                    <TableCell>{c.name}</TableCell>
                    <TableCell><Badge variant="outline" className={`${sourceColors[c.traffic_source]} border-0`}>{c.traffic_source}</Badge></TableCell>
                    <TableCell className="text-muted-foreground text-sm">{new Date(c.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell><Switch checked={c.is_active ?? false} onCheckedChange={(v) => toggleMutation.mutate({ id: c.id, is_active: v })} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openLinkModal(c.hash, c.name)}><Copy className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => navigate(`/campaigns/${c.id}/edit`)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Campaign Link Modal */}
      <Dialog open={linkModal.open} onOpenChange={(open) => setLinkModal((prev) => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Link className="h-5 w-5 text-primary" />
              Link da Campanha
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {linkModal.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {domains.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Domínio</label>
                <Select value={selectedDomain} onValueChange={setSelectedDomain}>
                  <SelectTrigger className="border-border bg-background">
                    <SelectValue placeholder="Domínio padrão" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=" ">Domínio padrão</SelectItem>
                    {domains.map((d) => (
                      <SelectItem key={d.id} value={d.url}>{d.url}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">URL da campanha</label>
              <Input
                readOnly
                value={getFullLink()}
                className="font-mono text-sm border-border bg-muted/30 cursor-default"
              />
            </div>

            <Button
              className="w-full neon-glow"
              onClick={handleCopyLink}
              disabled={copied}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copiado!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copiar Link
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
