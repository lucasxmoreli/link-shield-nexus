import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Copy, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
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

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("*").order("created_at", { ascending: false });
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

  const handleCopy = (hash: string) => {
    navigator.clipboard.writeText(hash);
    toast.success("Hash copiado!");
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
                        <Button variant="ghost" size="icon" onClick={() => handleCopy(c.hash)}><Copy className="h-4 w-4" /></Button>
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
    </div>
  );
}
