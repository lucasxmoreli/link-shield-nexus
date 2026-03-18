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
import { Ticket, Plus, Copy, Loader2, Check, X, RefreshCw, Trash2, Users, Settings2, Gift, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = () => { const bytes = crypto.getRandomValues(new Uint8Array(4)); return Array.from(bytes, (b) => chars[b % chars.length]).join(""); };
  return `CLOAK-${seg()}-${seg()}`;
}

const PLAN_LIMITS: Record<string, { max_clicks: number; max_domains: number }> = {
  "Free": { max_clicks: 0, max_domains: 0 },
  "Basic Plan": { max_clicks: 20000, max_domains: 3 },
  "Pro Plan": { max_clicks: 100000, max_domains: 10 },
  "Freedom Plan": { max_clicks: 300000, max_domains: 20 },
  "Enterprise Conquest": { max_clicks: 1000000, max_domains: 25 },
};
const PLAN_OPTIONS = Object.keys(PLAN_LIMITS);

interface ProfileRow { id: string; user_id: string; email: string | null; plan_name: string | null; created_at: string; max_clicks: number | null; current_clicks: number | null; subscription_status: string | null; }
interface PromoCodeRow { id: string; code: string; target_plan: string; duration_days: number; max_uses: number; current_uses: number; is_active: boolean; created_at: string; }

export default function InviteCodes() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [customCode, setCustomCode] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const navigate = useNavigate();
  const [managingUser, setManagingUser] = useState<ProfileRow | null>(null);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [promoDialogOpen, setPromoDialogOpen] = useState(false);
  const [promoForm, setPromoForm] = useState({ code: "", target_plan: "Pro Plan", duration_days: 30, max_uses: 1 });

  useEffect(() => {
    if (!isAdminLoading && !isAdmin) { toast.error("Access denied."); navigate("/dashboard", { replace: true }); }
  }, [isAdmin, isAdminLoading, navigate]);

  const { data: codes = [], isLoading } = useQuery({ queryKey: ["invite_codes"], queryFn: async () => { const { data, error } = await supabase.from("invite_codes").select("*").order("created_at", { ascending: false }); if (error) throw error; return data; } });
  const { data: allProfiles = [], isLoading: isLoadingProfiles } = useQuery({ queryKey: ["admin_all_profiles"], queryFn: async () => { const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false }); if (error) throw error; return data as ProfileRow[]; }, enabled: isAdmin });
  const { data: promoCodes = [], isLoading: isLoadingPromos } = useQuery({ queryKey: ["admin_promo_codes"], queryFn: async () => { const { data, error } = await supabase.from("promo_codes").select("*").order("created_at", { ascending: false }); if (error) throw error; return data as PromoCodeRow[]; }, enabled: isAdmin });

  const createMutation = useMutation({
    mutationFn: async (code: string) => { const { error } = await supabase.from("invite_codes").insert({ code }); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["invite_codes"] }); toast.success(t("admin.codeCreated")); setCustomCode(""); },
    onError: (err: any) => { toast.error(err.message?.includes("duplicate") ? t("admin.codeDuplicate") : "Error"); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("invite_codes").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["invite_codes"] }); toast.success(t("admin.codeDeleted")); },
  });

  const createPromoMutation = useMutation({
    mutationFn: async (form: typeof promoForm) => { const { error } = await supabase.from("promo_codes").insert({ code: form.code.trim().toUpperCase(), target_plan: form.target_plan, duration_days: form.duration_days, max_uses: form.max_uses }); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin_promo_codes"] }); toast.success(t("admin.promoCreated")); setPromoDialogOpen(false); setPromoForm({ code: "", target_plan: "Pro Plan", duration_days: 30, max_uses: 1 }); },
    onError: (err: any) => { toast.error(err.message?.includes("duplicate") || err.message?.includes("unique") ? t("admin.promoDuplicate") : "Error"); },
  });

  const togglePromoMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => { const { error } = await supabase.from("promo_codes").update({ is_active }).eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin_promo_codes"] }); toast.success(t("admin.promoUpdated")); },
  });

  const deletePromoMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("promo_codes").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin_promo_codes"] }); toast.success(t("admin.promoDeleted")); },
  });

  const handleCreateRandom = () => { if (!isAdmin) return; createMutation.mutate(generateCode()); };
  const handleCreateCustom = (e: React.FormEvent) => { e.preventDefault(); if (!isAdmin) return; if (customCode.trim().length < 4) { toast.error(t("admin.codeMinLength")); return; } createMutation.mutate(customCode.trim().toUpperCase()); };
  const handleManageUser = (user: ProfileRow) => { setManagingUser(user); setSelectedPlan(user.plan_name ?? "Free"); };

  const updatePlanMutation = useMutation({
    mutationFn: async ({ userId, planName }: { userId: string; planName: string }) => { const limits = PLAN_LIMITS[planName] || PLAN_LIMITS.Free; const { error } = await supabase.from("profiles").update({ plan_name: planName, max_clicks: limits.max_clicks, max_domains: limits.max_domains }).eq("user_id", userId); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin_all_profiles"] }); toast.success(t("admin.planUpdated", { plan: selectedPlan, email: managingUser?.email })); setManagingUser(null); },
  });

  const handleSavePlan = () => { if (!managingUser) return; updatePlanMutation.mutate({ userId: managingUser.user_id, planName: selectedPlan }); };
  const handleCreatePromo = (e: React.FormEvent) => { e.preventDefault(); if (promoForm.code.trim().length < 3) { toast.error(t("admin.promoMinLength")); return; } createPromoMutation.mutate(promoForm); };

  if (!isAdmin) return null;

  const copyToClipboard = (code: string, id: string) => { navigator.clipboard.writeText(code); setCopiedId(id); toast.success(t("common.copied")); setTimeout(() => setCopiedId(null), 2000); };
  const usedCount = codes.filter((c) => c.is_used).length;
  const availableCount = codes.filter((c) => !c.is_used).length;

  return (
    <div className="space-y-4 sm:space-y-8">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
            {t("admin.title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{t("admin.subtitle")}</p>
        </div>
      </div>

      <Tabs defaultValue="invites" className="w-full">
        <TabsList className="bg-secondary">
          <TabsTrigger value="invites" className="gap-1.5"><Ticket className="h-4 w-4" /> {t("admin.inviteCodes")}</TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5"><Users className="h-4 w-4" /> {t("admin.registeredUsers")}</TabsTrigger>
          <TabsTrigger value="promos" className="gap-1.5"><Gift className="h-4 w-4" /> {t("admin.promoCodes")}</TabsTrigger>
        </TabsList>

        <TabsContent value="invites" className="space-y-6 mt-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["invite_codes"] })}>
              <RefreshCw className="h-4 w-4 mr-1" /> {t("common.refresh")}
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {[{ label: t("admin.total"), value: codes.length, color: "text-foreground" }, { label: t("admin.available"), value: availableCount, color: "text-primary" }, { label: t("admin.used"), value: usedCount, color: "text-muted-foreground" }].map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-card p-4 text-center">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <h2 className="text-sm font-semibold">{t("admin.createNewCode")}</h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={handleCreateRandom} disabled={createMutation.isPending} className="shrink-0">
                {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                {t("admin.generateRandom")}
              </Button>
              <form onSubmit={handleCreateCustom} className="flex flex-1 gap-2">
                <Input placeholder={t("admin.customCodePlaceholder")} value={customCode} onChange={(e) => setCustomCode(e.target.value)} className="uppercase tracking-wider bg-secondary/50" />
                <Button type="submit" variant="secondary" disabled={createMutation.isPending || !customCode.trim()}>{t("common.create")}</Button>
              </form>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
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
                          <Badge variant="secondary" className="gap-1"><X className="h-3 w-3" /> {t("admin.used")}</Badge>
                        ) : (
                          <Badge className="gap-1 bg-primary/15 text-primary border-primary/30 hover:bg-primary/20"><Check className="h-3 w-3" /> {t("admin.available")}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{code.used_by ? <span className="font-mono text-xs">{code.used_by.slice(0, 8)}…</span> : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{code.used_at ? format(new Date(code.used_at), "MM/dd/yyyy HH:mm") : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(code.created_at), "MM/dd/yyyy HH:mm")}</TableCell>
                      <TableCell>
                        {!code.is_used && (
                          <div className="flex items-center gap-2">
                            <button onClick={() => copyToClipboard(code.code, code.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                              {copiedId === code.id ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                            </button>
                            <button onClick={() => { if (isAdmin) deleteMutation.mutate(code.id); }} disabled={deleteMutation.isPending || !isAdmin} className="text-muted-foreground hover:text-destructive transition-colors">
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

        <TabsContent value="users" className="space-y-6 mt-4">
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            {isLoadingProfiles ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : allProfiles.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">{t("admin.noUsers")}</div>
            ) : (
              <Table className="min-w-[650px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.userEmail")}</TableHead>
                    <TableHead>{t("admin.registrationDate")}</TableHead>
                    <TableHead>{t("billing.currentPlan")}</TableHead>
                    <TableHead>{t("admin.totalClicks")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allProfiles.map((user) => {
                    const planName = user.plan_name ?? "Free";
                    const isPro = planName.toLowerCase().includes("pro");
                    const isFree = planName === "Free";
                    return (
                      <TableRow key={user.id}>
                        <TableCell className="font-mono text-sm">{user.email ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{format(new Date(user.created_at), "MM/dd/yyyy")}</TableCell>
                        <TableCell><Badge className={isFree ? "bg-muted text-muted-foreground border-0" : isPro ? "bg-primary/20 text-primary border-0" : "bg-accent text-accent-foreground border-0"}>{planName}</Badge></TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">{(user.current_clicks ?? 0).toLocaleString()} / {(user.max_clicks ?? 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => handleManageUser(user)} className="gap-1.5"><Settings2 className="h-3.5 w-3.5" /> {t("admin.manage")}</Button></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="promos" className="space-y-6 mt-4">
          <div className="flex items-center justify-between">
            <div className="grid grid-cols-3 gap-2 sm:gap-4 flex-1 mr-4">
              {[{ label: t("admin.total"), value: promoCodes.length, color: "text-foreground" }, { label: t("common.active"), value: promoCodes.filter((p) => p.is_active).length, color: "text-primary" }, { label: t("admin.used"), value: promoCodes.filter((p) => p.current_uses >= p.max_uses).length, color: "text-muted-foreground" }].map((s) => (
                <div key={s.label} className="rounded-lg border border-border bg-card p-4 text-center">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                </div>
              ))}
            </div>
            <Button onClick={() => setPromoDialogOpen(true)} className="shrink-0 gap-1.5"><Plus className="h-4 w-4" /> {t("admin.createPromo")}</Button>
          </div>
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            {isLoadingPromos ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : promoCodes.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">{t("admin.noPromos")}</div>
            ) : (
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.code")}</TableHead>
                    <TableHead>{t("admin.targetPlan")}</TableHead>
                    <TableHead>{t("admin.durationDays")}</TableHead>
                    <TableHead>{t("admin.uses")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead>{t("domains.created")}</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {promoCodes.map((promo) => {
                    const exhausted = promo.current_uses >= promo.max_uses;
                    return (
                      <TableRow key={promo.id}>
                        <TableCell className="font-mono text-sm tracking-wider font-semibold">{promo.code}</TableCell>
                        <TableCell><Badge className="bg-primary/15 text-primary border-primary/30">{promo.target_plan}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{promo.duration_days} {t("admin.durationDays").toLowerCase().replace("duração (", "").replace("duration (", "").replace(")", "")}</TableCell>
                        <TableCell className="font-mono text-sm"><span className={exhausted ? "text-destructive" : "text-foreground"}>{promo.current_uses}</span><span className="text-muted-foreground"> / {promo.max_uses}</span></TableCell>
                        <TableCell>
                          {promo.is_active && !exhausted ? (
                            <Badge className="gap-1 bg-success/15 text-success border-success/30"><Power className="h-3 w-3" /> {t("common.active")}</Badge>
                          ) : exhausted ? (
                            <Badge variant="secondary" className="gap-1"><X className="h-3 w-3" /> {t("admin.used")}</Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1"><PowerOff className="h-3 w-3" /> {t("common.inactive")}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{format(new Date(promo.created_at), "MM/dd/yyyy")}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <button onClick={() => togglePromoMutation.mutate({ id: promo.id, is_active: !promo.is_active })} className="text-muted-foreground hover:text-foreground transition-colors">
                              {promo.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                            </button>
                            <button onClick={() => copyToClipboard(promo.code, promo.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                              {copiedId === promo.id ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                            </button>
                            <button onClick={() => deletePromoMutation.mutate(promo.id)} disabled={deletePromoMutation.isPending} className="text-muted-foreground hover:text-destructive transition-colors">
                              <Trash2 className="h-4 w-4" />
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
        </TabsContent>
      </Tabs>

      <Dialog open={!!managingUser} onOpenChange={(open) => !open && setManagingUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.managePlan")}</DialogTitle>
            <DialogDescription>{t("admin.changePlanFor")} <span className="font-mono text-foreground">{managingUser?.email}</span></DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">{t("admin.selectPlan")}</label>
              <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
                <SelectContent>{PLAN_OPTIONS.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManagingUser(null)}>{t("common.cancel")}</Button>
            <Button onClick={handleSavePlan} disabled={updatePlanMutation.isPending}>
              {updatePlanMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {t("admin.savePlan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={promoDialogOpen} onOpenChange={setPromoDialogOpen}>
        <DialogContent className="sm:max-w-md border-primary/20 bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Gift className="h-5 w-5 text-primary" /> {t("admin.createPromo")}</DialogTitle>
            <DialogDescription>{t("admin.subtitle")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreatePromo} className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">{t("admin.promoCode")}</label>
              <Input placeholder="e.g. SOCIOSVIP" value={promoForm.code} onChange={(e) => setPromoForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} className="uppercase tracking-widest font-mono bg-secondary/50" required minLength={3} maxLength={30} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">{t("admin.targetPlan")}</label>
              <Select value={promoForm.target_plan} onValueChange={(v) => setPromoForm((f) => ({ ...f, target_plan: v }))}>
                <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
                <SelectContent>{PLAN_OPTIONS.filter((p) => p !== "Free").map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">{t("admin.durationDays")}</label>
                <Input type="number" min={1} max={365} value={promoForm.duration_days} onChange={(e) => setPromoForm((f) => ({ ...f, duration_days: parseInt(e.target.value) || 30 }))} className="bg-secondary/50" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">{t("admin.maxUses")}</label>
                <Input type="number" min={1} max={10000} value={promoForm.max_uses} onChange={(e) => setPromoForm((f) => ({ ...f, max_uses: parseInt(e.target.value) || 1 }))} className="bg-secondary/50" />
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setPromoDialogOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={createPromoMutation.isPending} className="gap-1.5">
                {createPromoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {t("common.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
