import { useState } from "react";
import { Plus, Copy, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mockCampaigns, mockDomains } from "@/lib/mock-data";
import { toast } from "sonner";

const sourceColors: Record<string, string> = {
  tiktok: "bg-primary/20 text-primary",
  facebook: "bg-blue-500/20 text-blue-400",
  google: "bg-success/20 text-success",
};

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState(mockCampaigns);
  const [open, setOpen] = useState(false);

  const handleToggle = (id: string) => {
    setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, is_active: !c.is_active } : c)));
  };

  const handleCopy = (hash: string, domain: string) => {
    navigator.clipboard.writeText(`https://${domain}/${hash}`);
    toast.success("Link copiado!");
  };

  const handleDelete = (id: string) => {
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
    toast.success("Campanha removida");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="neon-glow">
              <Plus className="h-4 w-4 mr-1" /> Create +
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>Nova Campanha</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Nome</Label>
                <Input placeholder="Ex: TikTok BR - Nutra" className="bg-secondary border-border" />
              </div>
              <div>
                <Label>Fonte de Tráfego</Label>
                <Select>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="google">Google</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Domínio</Label>
                <Select>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder="Selecione um domínio" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {mockDomains.filter((d) => d.is_verified).map((d) => (
                      <SelectItem key={d.id} value={d.url}>{d.url}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>URL da Oferta</Label>
                <Input placeholder="https://offer.example.com/..." className="bg-secondary border-border" />
              </div>
              <div>
                <Label>URL da Safe Page</Label>
                <Input placeholder="https://blog.example.com/..." className="bg-secondary border-border" />
              </div>
              <Button className="w-full neon-glow" onClick={() => { setOpen(false); toast.success("Campanha criada!"); }}>
                Criar Campanha
              </Button>
            </div>
          </DialogContent>
        </Dialog>
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
              {campaigns.map((c) => (
                <TableRow key={c.id} className="border-border">
                  <TableCell className="font-mono text-sm text-primary">{c.hash}</TableCell>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`${sourceColors[c.traffic_source]} border-0`}>
                      {c.traffic_source}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(c.created_at).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell>
                    <Switch checked={c.is_active} onCheckedChange={() => handleToggle(c.id)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleCopy(c.hash, c.domain)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
