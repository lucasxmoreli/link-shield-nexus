import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, CheckCircle, XCircle, Trash2, ShieldCheck, Copy, RefreshCw } from "lucide-react";
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

function DnsSteps({ domain }: { domain: { id: string; url: string } }) {
  const hostname = domain.url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const txtName = `_cloakguard.${hostname}`;
  const txtValue = `cloakguard-verify=${domain.id}`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  };

  return (
    <div className="flex flex-col space-y-4">
      {/* Step 1 */}
      <div className="rounded-lg border border-border/30 bg-secondary/10 p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Step 1</p>
        <p className="text-sm text-foreground">Access your domain's DNS provider panel.</p>
      </div>

      {/* Step 2 */}
      <div className="rounded-lg border border-border/30 bg-secondary/10 p-4 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Step 2</p>
        <p className="text-sm text-foreground">Create a TXT record with the following values:</p>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Type</Label>
          <div className="rounded-md bg-background border border-border px-3 py-2.5 text-sm font-mono text-foreground">
            TXT
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Name / Host</Label>
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
          <Label className="text-xs text-muted-foreground">Value</Label>
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
              onClick={() => copyToClipboard(txtValue, "Value")}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Step 3 */}
      <div className="rounded-lg border border-border/30 bg-secondary/10 p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Step 3</p>
        <p className="text-sm text-foreground">Save changes in your DNS panel and wait for propagation (up to 72h). Return here to verify.</p>
      </div>
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
      const normalized = url.trim().toLowerCase().replace(/\/+$/, "");
      if (!normalized) throw new Error("Domain URL is required.");
      const isDuplicate = domains.some((d) => d.url.toLowerCase().replace(/\/+$/, "") === normalized);
      if (isDuplicate) throw new Error("This domain has already been added.");
      const { error } = await supabase.from("domains").insert({ user_id: user!.id, url: normalized });
      if (error) {
        if (error.message?.includes("duplicate") || error.code === "23505") {
          throw new Error("This domain has already been added.");
        }
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domains"] });
      setOpen(false);
      setUrl("");
      toast.success("Domain added! Configure DNS to verify.");
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
      toast.success("Domain removed");
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
        toast.success("Domain verified successfully!");
        setDnsDialogDomain(null);
      } else {
        toast.error(data.message || "TXT record not found.");
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
              <DialogTitle>Add Domain</DialogTitle>
              <DialogDescription>Enter the domain you want to use with CloakGuard.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Domain URL</Label>
                <Input
                  placeholder="e.g. track.mysite.com"
                  className="bg-secondary/50 border-border"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
              <Button className="w-full" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !url}>
                {createMutation.isPending ? "Adding..." : "Add"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Verify Domain Dialog — Step by Step */}
      <Dialog open={!!dnsDialogDomain} onOpenChange={(v) => !v && setDnsDialogDomain(null)}>
        <DialogContent className="bg-card border-border sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Verify Domain
            </DialogTitle>
            <DialogDescription>
              Configure the DNS record to verify ownership of{" "}
              <span className="font-mono text-foreground">{dnsDialogDomain?.url}</span>
            </DialogDescription>
          </DialogHeader>
          {dnsDialogDomain && <DnsSteps domain={dnsDialogDomain} />}
          <Button
            onClick={() => dnsDialogDomain && verifyMutation.mutate(dnsDialogDomain.id)}
            disabled={verifyMutation.isPending}
            className="w-full mt-4"
          >
            {verifyMutation.isPending ? (
              <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Verifying...</>
            ) : (
              <><ShieldCheck className="h-4 w-4 mr-2" /> Verify & Save Domain</>
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
                <TableHead className="text-muted-foreground">Created</TableHead>
                <TableHead className="text-muted-foreground text-right">Actions</TableHead>
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
                    No domains added yet.
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
                      {new Date(d.created_at).toLocaleDateString("en-US")}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {!d.is_verified && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-primary hover:text-primary"
                          onClick={() => setDnsDialogDomain({ id: d.id, url: d.url })}
                        >
                          <ShieldCheck className="h-4 w-4 mr-1" /> Verify
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
