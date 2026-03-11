import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Copy, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type TrafficSource = Database["public"]["Enums"]["traffic_source"];
type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];

const sourceColors: Record<string, string> = {
  tiktok: "bg-primary/20 text-primary",
  facebook: "bg-blue-500/20 text-blue-400",
  google: "bg-success/20 text-success",
};

function generateHash(len = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

const emptyForm = { name: "", traffic_source: "" as string, domain: "", offer_url: "", safe_url: "" };

function CampaignFormFields({
  form,
  setForm,
  domains,
}: {
  form: typeof emptyForm;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>;
  domains: { id: string; url: string }[];
}) {
  return (
    <div className="space-y-5 pt-2">
      <div>
        <Label className="text-muted-foreground text-xs uppercase tracking-wider">Campaign</Label>
        <Separator className="my-2 bg-border" />
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input placeholder="Ex: TTK 10 - LIVRE [TRESH-$500]" className="bg-secondary border-border" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label>Domínio</Label>
            <Select value={form.domain} onValueChange={(v) => setForm((f) => ({ ...f, domain: v }))}>
              <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Selecione um domínio" /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                {domains.map((d) => <SelectItem key={d.id} value={d.url}>{d.url}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Fonte de Tráfego</Label>
            <Select value={form.traffic_source} onValueChange={(v) => setForm((f) => ({ ...f, traffic_source: v }))}>
              <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="tiktok">TikTok</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="google">Google</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div>
        <Label className="text-muted-foreground text-xs uppercase tracking-wider">Safe Page</Label>
        <Separator className="my-2 bg-border" />
        <Input placeholder="https://blog.example.com/..." className="bg-secondary border-border" value={form.safe_url} onChange={(e) => setForm((f) => ({ ...f, safe_url: e.target.value }))} />
      </div>

      <div>
        <Label className="text-muted-foreground text-xs uppercase tracking-wider">Offer Page</Label>
        <Separator className="my-2 bg-border" />
        <Input placeholder="https://offer.example.com/..." className="bg-secondary border-border" value={form.offer_url} onChange={(e) => setForm((f) => ({ ...f, offer_url: e.target.value }))} />
      </div>
    </div>
  );
}

export default function Campaigns() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [form, setForm] = useState(emptyForm);

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

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("campaigns").insert({
        user_id: user!.id,
        hash: generateHash(),
        name: form.name,
        traffic_source: form.traffic_source as TrafficSource,
        safe_url: form.safe_url,
        offer_url: form.offer_url,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      setCreateOpen(false);
      setForm(emptyForm);
      toast.success("Campanha criada!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingCampaign) return;
      const { error } = await supabase.from("campaigns").update({
        name: form.name,
        traffic_source: form.traffic_source as TrafficSource,
        safe_url: form.safe_url,
        offer_url: form.offer_url,
      }).eq("id", editingCampaign.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      setEditOpen(false);
      setEditingCampaign(null);
      setForm(emptyForm);
      toast.success("Campanha atualizada!");
    },
    onError: (e: Error) => toast.error(e.message),
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

  const handleCopy = (hash: string) => {
    navigator.clipboard.writeText(hash);
    toast.success("Hash copiado!");
  };

  const handleEdit = (c: Campaign) => {
    setEditingCampaign(c);
    setForm({
      name: c.name,
      traffic_source: c.traffic_source,
      domain: "",
      offer_url: c.offer_url,
      safe_url: c.safe_url,
    });
    setEditOpen(true);
  };

  const isFormValid = form.name && form.traffic_source && form.offer_url && form.safe_url;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) setForm(emptyForm); }}>
          <DialogTrigger asChild>
            <Button className="neon-glow"><Plus className="h-4 w-4 mr-1" /> Create +</Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Nova Campanha</DialogTitle></DialogHeader>
            <CampaignFormFields form={form} setForm={setForm} domains={domains} />
            <Button className="w-full neon-glow mt-2" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !isFormValid}>
              {createMutation.isPending ? "Criando..." : "Criar Campanha"}
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) { setEditingCampaign(null); setForm(emptyForm); } }}>
        <DialogContent className="bg-card border-border max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Campanha</DialogTitle>
            {editingCampaign && (
              <p className="text-sm text-muted-foreground font-mono mt-1">Hash: {editingCampaign.hash}</p>
            )}
          </DialogHeader>
          <CampaignFormFields form={form} setForm={setForm} domains={domains} />
          <Button className="w-full neon-glow mt-2" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending || !isFormValid}>
            {updateMutation.isPending ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </DialogContent>
      </Dialog>

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
                        <Button variant="ghost" size="icon" onClick={() => handleCopy(c.hash)}><Copy className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(c)}><Pencil className="h-4 w-4" /></Button>
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
    </div>
  );
}
