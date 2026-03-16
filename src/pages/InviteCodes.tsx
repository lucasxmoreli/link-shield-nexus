import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Ticket, Plus, Copy, Loader2, Check, X, RefreshCw, Trash2, Users, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `CLOAK-${seg()}-${seg()}`;
}

const PLAN_OPTIONS = ["Free", "Basic", "Pro", "Freedom", "Enterprise"];

interface ProfileRow {
  id: string;
  user_id: string;
  email: string | null;
  plan_name: string | null;
  created_at: string;
  max_clicks: number | null;
  current_clicks: number | null;
  subscription_status: string | null;
}

export default function InviteCodes() {
  const queryClient = useQueryClient();
  const [customCode, setCustomCode] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const navigate = useNavigate();

  const [managingUser, setManagingUser] = useState<ProfileRow | null>(null);
  const [selectedPlan, setSelectedPlan] = useState("");

  useEffect(() => {
    if (!isAdminLoading && !isAdmin) {
      toast.error("Access denied. Admin area only.");
      navigate("/dashboard", { replace: true });
    }
  }, [isAdmin, isAdminLoading, navigate]);

  const { data: codes = [], isLoading } = useQuery({
    queryKey: ["invite_codes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invite_codes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: allProfiles = [], isLoading: isLoadingProfiles } = useQuery({
    queryKey: ["admin_all_profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as ProfileRow[];
    },
    enabled: isAdmin,
  });

  const createMutation = useMutation({
    mutationFn: async (code: string) => {
      const { error } = await supabase.from("invite_codes").insert({ code });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invite_codes"] });
      toast.success("Code created successfully!");
      setCustomCode("");
    },
    onError: (err: any) => {
      if (err.message?.includes("duplicate")) {
        toast.error("This code already exists.");
      } else {
        toast.error("Error creating code.");
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invite_codes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invite_codes"] });
      toast.success("Code deleted.");
    },
    onError: () => toast.error("Error deleting code."),
  });

  const handleCreateRandom = () => {
    if (!isAdmin) return;
    createMutation.mutate(generateCode());
  };
  const handleCreateCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (customCode.trim().length < 4) {
      toast.error("Code must be at least 4 characters.");
      return;
    }
    createMutation.mutate(customCode.trim().toUpperCase());
  };

  const handleManageUser = (user: ProfileRow) => {
    setManagingUser(user);
    setSelectedPlan(user.plan_name ?? "Free");
  };

  const updatePlanMutation = useMutation({
    mutationFn: async ({ userId, planName }: { userId: string; planName: string }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ plan_name: planName })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_all_profiles"] });
      toast.success(`Plan updated to ${selectedPlan} for ${managingUser?.email}`);
      setManagingUser(null);
    },
    onError: () => toast.error("Error updating plan."),
  });

  const handleSavePlan = () => {
    if (!managingUser) return;
    updatePlanMutation.mutate({ userId: managingUser.user_id, planName: selectedPlan });
  };

  if (!isAdmin) return null;

  const copyToClipboard = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    toast.success("Code copied!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const usedCount = codes.filter((c) => c.is_used).length;
  const availableCount = codes.filter((c) => !c.is_used).length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Admin & Users
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage invite codes and registered users.
          </p>
        </div>
      </div>

      <Tabs defaultValue="invites" className="w-full">
        <TabsList className="bg-secondary">
          <TabsTrigger value="invites" className="gap-1.5">
            <Ticket className="h-4 w-4" /> Invite Codes
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="h-4 w-4" /> Registered Users
          </TabsTrigger>
        </TabsList>

        {/* ── Invites Tab ── */}
        <TabsContent value="invites" className="space-y-6 mt-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["invite_codes"] })}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total", value: codes.length, color: "text-foreground" },
              { label: "Available", value: availableCount, color: "text-primary" },
              { label: "Used", value: usedCount, color: "text-muted-foreground" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-card p-4 text-center">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <h2 className="text-sm font-semibold">Create new code</h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={handleCreateRandom} disabled={createMutation.isPending} className="shrink-0">
                {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Generate Random
              </Button>
              <form onSubmit={handleCreateCustom} className="flex flex-1 gap-2">
                <Input placeholder="Custom code (e.g. VIP-2024)" value={customCode} onChange={(e) => setCustomCode(e.target.value)} className="uppercase tracking-wider bg-secondary/50" />
                <Button type="submit" variant="secondary" disabled={createMutation.isPending || !customCode.trim()}>Create</Button>
              </form>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : codes.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No codes created yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Used By</TableHead>
                    <TableHead>Used At</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codes.map((code) => (
                    <TableRow key={code.id}>
                      <TableCell className="font-mono text-sm tracking-wider">{code.code}</TableCell>
                      <TableCell>
                        {code.is_used ? (
                          <Badge variant="secondary" className="gap-1"><X className="h-3 w-3" /> Used</Badge>
                        ) : (
                          <Badge className="gap-1 bg-primary/15 text-primary border-primary/30 hover:bg-primary/20"><Check className="h-3 w-3" /> Available</Badge>
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
                            <button onClick={() => copyToClipboard(code.code, code.id)} className="text-muted-foreground hover:text-foreground transition-colors" title="Copy code">
                              {copiedId === code.id ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                            </button>
                            <button onClick={() => { if (isAdmin) deleteMutation.mutate(code.id); }} disabled={deleteMutation.isPending || !isAdmin} className="text-muted-foreground hover:text-destructive transition-colors" title="Delete code">
                              <Trash2 className="h-4 w-4" />
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
        </TabsContent>

        {/* ── Users Tab ── */}
        <TabsContent value="users" className="space-y-6 mt-4">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User Email</TableHead>
                  <TableHead>Registration Date</TableHead>
                  <TableHead>Current Plan</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-mono text-sm">{user.email}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(user.created_at), "MM/dd/yyyy")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          user.plan_name === "Free"
                            ? "bg-muted text-muted-foreground border-0"
                            : user.plan_name === "Pro"
                              ? "bg-primary/20 text-primary border-0"
                              : "bg-accent text-accent-foreground border-0"
                        }
                      >
                        {user.plan_name}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => handleManageUser(user)} className="gap-1.5">
                        <Settings2 className="h-3.5 w-3.5" /> Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Manage User Dialog ── */}
      <Dialog open={!!managingUser} onOpenChange={(open) => !open && setManagingUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage User Plan</DialogTitle>
            <DialogDescription>
              Change the active plan for <span className="font-mono text-foreground">{managingUser?.email}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Select Plan</label>
              <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue placeholder="Choose a plan" />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManagingUser(null)}>Cancel</Button>
            <Button onClick={handleSavePlan}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
