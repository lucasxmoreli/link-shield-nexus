import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdmin } from "@/hooks/useAdmin";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { supabaseUntyped } from "@/integrations/supabase/untyped";
import { useTranslation } from "react-i18next";
import {
  Users, Megaphone, MousePointerClick, ShieldAlert, Crown, Ban, RotateCcw, Eye,
  CheckCircle2, AlertTriangle, AlertOctagon, XCircle, MoonStar,
  ArrowUpDown, ArrowUp, ArrowDown, FilterX, UserX, SearchX,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { PLANS, getPlanByName, type PlanData } from "@/lib/plan-config";

// =============================================================================
// TYPES
// =============================================================================

export type UsageStatus = "safe" | "warning" | "critical" | "overage" | "inactive";
type ChurnLevel = "none" | "low" | "medium" | "high" | "critical";
type SortColumn = "email" | "plan_name" | "usage_pct" | "churn_risk_score" | "last_login_at" | "created_at";
type SortDirection = "asc" | "desc" | null;

export interface AdminUser {
  user_id: string;
  email: string;
  plan_name: string;
  is_free: boolean;
  current_clicks: number;
  max_clicks: number;
  is_suspended: boolean;
  created_at: string;
  days_since_signup: number;
  billing_cycle_end: string | null;
  last_login_at: string | null;
  last_click_at: string | null;
  days_since_last_click: number | null;
  campaign_count: number;
  domain_count: number;
  usage_pct: number;
  usage_status: UsageStatus;
  churn_risk_score: number;
}

interface AdminStats {
  total_users: number;
  active_campaigns: number;
  monthly_clicks: number;
}

// =============================================================================
// HELPERS
// =============================================================================

const USAGE_STATUS_OPTIONS: ReadonlyArray<UsageStatus> = ["safe", "warning", "critical", "overage", "inactive"];
const CHURN_LEVEL_OPTIONS: ReadonlyArray<Exclude<ChurnLevel, "none">> = ["low", "medium", "high", "critical"];

const churnLevelFromScore = (score: number, isFree: boolean): ChurnLevel => {
  if (isFree) return "none";
  if (score <= 25) return "low";
  if (score <= 50) return "medium";
  if (score <= 75) return "high";
  return "critical";
};

const formatNumber = (n: number): string => n.toLocaleString();

// =============================================================================
// COMPONENT
// =============================================================================

export default function AdminDashboard() {
  const { isAdmin, isLoading: adminLoading } = useAdmin();
  const { startClientView } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();

  const [planDialog, setPlanDialog] = useState<{ open: boolean; user: AdminUser | null }>({ open: false, user: null });
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [planFilter, setPlanFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<UsageStatus | "All">("All");
  const [churnFilter, setChurnFilter] = useState<ChurnLevel | "All">("All");
  const [sortColumn, setSortColumn] = useState<SortColumn | null>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  useEffect(() => {
    if (!adminLoading && !isAdmin) navigate("/dashboard", { replace: true });
  }, [adminLoading, isAdmin, navigate]);

  // ── Queries ──
  const { data: stats } = useQuery({
    queryKey: ["admin_stats"],
    queryFn: async (): Promise<AdminStats> => {
      const { data, error } = await supabase.rpc("admin_get_stats");
      if (error) throw error;
      return (data as unknown) as AdminStats;
    },
    enabled: isAdmin,
  });

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["admin_users"],
    queryFn: async (): Promise<AdminUser[]> => {
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) throw error;
      return (data as AdminUser[]) || [];
    },
    enabled: isAdmin,
  });

  // ── Mutations ──
  const suspendMutation = useMutation({
    mutationFn: async ({ userId, suspend }: { userId: string; suspend: boolean }) => {
      const { error } = await supabase.rpc("admin_toggle_suspend", { p_user_id: userId, p_suspend: suspend });
      if (error) throw error;
    },
    onSuccess: (_, { suspend }) => {
      queryClient.invalidateQueries({ queryKey: ["admin_users"] });
      queryClient.invalidateQueries({ queryKey: ["admin_stats"] });
      toast.success(suspend ? t("admin.userSuspended") : t("admin.userReactivated"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const changePlanMutation = useMutation({
    mutationFn: async ({ userId, plan }: { userId: string; plan: PlanData }) => {
      const { error } = await supabase.rpc("admin_change_plan", {
        p_user_id: userId,
        p_plan_name: plan.name,
        p_max_clicks: plan.maxClicksLimit,
        p_max_domains: plan.maxDomains,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_users"] });
      queryClient.invalidateQueries({ queryKey: ["admin_stats"] });
      setPlanDialog({ open: false, user: null });
      toast.success(t("admin.planUpdatedSuccess"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const resetBillingMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabaseUntyped.rpc("admin_reset_billing", { p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_users"] });
      toast.success(t("admin.billingReset"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Filter + Sort pipeline ──
  const filteredAndSorted = useMemo(() => {
    let result = users;

    if (planFilter !== "All") {
      result = result.filter((u) => getPlanByName(u.plan_name).name === planFilter);
    }
    if (statusFilter !== "All") {
      result = result.filter((u) => u.usage_status === statusFilter);
    }
    if (churnFilter !== "All") {
      result = result.filter((u) => churnLevelFromScore(u.churn_risk_score, u.is_free) === churnFilter);
    }

    if (sortColumn && sortDirection) {
      const dir = sortDirection === "asc" ? 1 : -1;
      result = [...result].sort((a, b) => {
        const av = a[sortColumn];
        const bv = b[sortColumn];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
    }

    return result;
  }, [users, planFilter, statusFilter, churnFilter, sortColumn, sortDirection]);

  const hasActiveFilters = planFilter !== "All" || statusFilter !== "All" || churnFilter !== "All";
  const clearFilters = () => { setPlanFilter("All"); setStatusFilter("All"); setChurnFilter("All"); };

  const cycleSort = (col: SortColumn) => {
    if (sortColumn !== col) { setSortColumn(col); setSortDirection("desc"); return; }
    if (sortDirection === "desc") { setSortDirection("asc"); return; }
    if (sortDirection === "asc") { setSortColumn(null); setSortDirection(null); return; }
    setSortDirection("desc");
  };

  // ── Date formatting helpers ──
  const formatRelativeDays = (iso: string | null): string => {
    if (!iso) return t("admin.noActivity");
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (days <= 0) return t("admin.today");
    if (days === 1) return t("admin.yesterday");
    return t("admin.daysAgo", { count: days });
  };

  const formatDateLocale = (iso: string): string =>
    new Date(iso).toLocaleDateString(i18n.language === "pt" ? "pt-BR" : i18n.language === "es" ? "es-ES" : "en-US");

  // ── Status badge config ──
  const usageStatusBadge = (status: UsageStatus) => {
    const map = {
      safe:     { label: t("admin.statusSafe"),     icon: CheckCircle2,  cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" },
      warning:  { label: t("admin.statusWarning"),  icon: AlertTriangle, cls: "border-amber-500/30 bg-amber-500/10 text-amber-400" },
      critical: { label: t("admin.statusCritical"), icon: AlertOctagon,  cls: "border-orange-500/30 bg-orange-500/10 text-orange-400" },
      overage:  { label: t("admin.statusOverage"),  icon: XCircle,       cls: "border-red-500/30 bg-red-500/10 text-red-400" },
      inactive: { label: t("admin.statusInactive"), icon: MoonStar,      cls: "border-slate-500/30 bg-slate-500/10 text-slate-400" },
    } as const;
    const cfg = map[status];
    const Icon = cfg.icon;
    return (
      <Badge variant="outline" className={`text-[10px] font-medium uppercase tracking-wider ${cfg.cls}`}>
        <Icon className="h-3 w-3 mr-1" aria-hidden="true" />{cfg.label}
      </Badge>
    );
  };

  const churnBadge = (score: number, isFree: boolean) => {
    const level = churnLevelFromScore(score, isFree);
    if (level === "none") return <span className="text-xs text-muted-foreground">{t("admin.churnNone")}</span>;
    const map = {
      low:      { label: t("admin.churnLow"),      cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" },
      medium:   { label: t("admin.churnMedium"),   cls: "border-amber-500/30 bg-amber-500/10 text-amber-400" },
      high:     { label: t("admin.churnHigh"),     cls: "border-orange-500/30 bg-orange-500/10 text-orange-400" },
      critical: { label: t("admin.churnCritical"), cls: "border-red-500/30 bg-red-500/10 text-red-400" },
    } as const;
    const cfg = map[level];
    return (
      <Badge variant="outline" className={`text-[10px] font-medium uppercase tracking-wider ${cfg.cls}`}>
        {cfg.label} · {score}
      </Badge>
    );
  };

  // ── Sortable header cell ──
  const SortableHeader = ({ column, labelKey, align = "left" }: { column: SortColumn; labelKey: string; align?: "left" | "center" | "right" }) => {
    const isActive = sortColumn === column;
    const Icon = !isActive ? ArrowUpDown : sortDirection === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead className={align === "center" ? "text-center" : align === "right" ? "text-right" : ""}>
        <button
          type="button"
          onClick={() => cycleSort(column)}
          className={`inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider hover:text-foreground transition-colors ${isActive ? "text-foreground" : "text-muted-foreground"}`}
        >
          {t(labelKey)}
          <Icon className="h-3 w-3" aria-hidden="true" />
        </button>
      </TableHead>
    );
  };

  // ── Loading guard ──
  if (adminLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!isAdmin) return null;

  // =============================================================================
  // RENDER
  // =============================================================================
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-7 w-7 text-primary" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-foreground">{t("admin.commandCenter")}</h1>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("admin.totalUsers")}</CardTitle>
            <Users className="h-5 w-5 text-primary" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{formatNumber(stats?.total_users ?? 0)}</div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("admin.activeCampaigns")}</CardTitle>
            <Megaphone className="h-5 w-5 text-accent-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{formatNumber(stats?.active_campaigns ?? 0)}</div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("admin.clicksThisCycle")}</CardTitle>
            <MousePointerClick className="h-5 w-5 text-destructive" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{formatNumber(stats?.monthly_clicks ?? 0)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Users Card */}
      <Card className="border-border bg-card">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-foreground">{t("admin.allUsers")}</CardTitle>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
                <FilterX className="h-3 w-3 mr-1.5" aria-hidden="true" />{t("admin.clearFilters")}
              </Button>
            )}
          </div>

          {/* Filters row */}
          <div className="flex flex-wrap gap-2">
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder={t("admin.filterByPlan")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">{t("admin.allPlans")}</SelectItem>
                {PLANS.map((p) => (<SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as UsageStatus | "All")}>
              <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder={t("admin.filterByStatus")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">{t("admin.allStatuses")}</SelectItem>
                {USAGE_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{t(`admin.status${s.charAt(0).toUpperCase()}${s.slice(1)}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={churnFilter} onValueChange={(v) => setChurnFilter(v as ChurnLevel | "All")}>
              <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder={t("admin.filterByChurn")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">{t("admin.allChurnLevels")}</SelectItem>
                {CHURN_LEVEL_OPTIONS.map((l) => (
                  <SelectItem key={l} value={l}>{t(`admin.churn${l.charAt(0).toUpperCase()}${l.slice(1)}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {usersLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : users.length === 0 ? (
            // Empty state #1: nenhum usuário no banco
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <UserX className="h-12 w-12 text-muted-foreground/40 mb-4" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">{t("admin.noUsersAtAll")}</p>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-sm">{t("admin.noUsersAtAllHint")}</p>
            </div>
          ) : filteredAndSorted.length === 0 ? (
            // Empty state #2: filtros zeraram resultados
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <SearchX className="h-12 w-12 text-muted-foreground/40 mb-4" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">{t("admin.noUsersFound")}</p>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-sm">{t("admin.noUsersFoundHint")}</p>
              <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4 h-8 text-xs">
                <FilterX className="h-3 w-3 mr-1.5" aria-hidden="true" />{t("admin.clearFilters")}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHeader column="email" labelKey="admin.email" />
                    <SortableHeader column="plan_name" labelKey="admin.plan" />
                    <SortableHeader column="usage_pct" labelKey="admin.clickUsage" />
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">{t("admin.usageStatus")}</TableHead>
                    <SortableHeader column="churn_risk_score" labelKey="admin.churnRisk" />
                    <TableHead className="text-center text-xs uppercase tracking-wider text-muted-foreground">{t("admin.domains")}</TableHead>
                    <TableHead className="text-center text-xs uppercase tracking-wider text-muted-foreground">{t("admin.campaigns")}</TableHead>
                    <SortableHeader column="last_login_at" labelKey="admin.lastLogin" />
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">{t("admin.lastActivity")}</TableHead>
                    <SortableHeader column="created_at" labelKey="admin.registered" />
                    <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSorted.map((u) => (
                    <TableRow key={u.user_id} className={u.is_suspended ? "opacity-60" : ""}>
                      <TableCell className="font-medium text-foreground">
                        <div className="flex items-center gap-2 min-w-[180px]">
                          <span className="truncate max-w-[220px]">{u.email || "—"}</span>
                          {u.is_suspended && (
                            <Badge variant="destructive" className="text-[9px] px-1.5 py-0">{t("admin.suspended")}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{u.plan_name || "—"}</Badge></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[160px]">
                          <Progress value={u.usage_pct} className="h-2 flex-1" />
                          <span className="text-xs text-muted-foreground whitespace-nowrap font-mono">
                            {u.usage_pct}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{usageStatusBadge(u.usage_status)}</TableCell>
                      <TableCell>{churnBadge(u.churn_risk_score, u.is_free)}</TableCell>
                      <TableCell className="text-center text-sm font-mono">{u.domain_count}</TableCell>
                      <TableCell className="text-center text-sm font-mono">{u.campaign_count}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {u.last_login_at ? formatRelativeDays(u.last_login_at) : t("admin.neverLoggedIn")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatRelativeDays(u.last_click_at)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDateLocale(u.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" aria-label={t("common.actions")}>⋮</Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => suspendMutation.mutate({ userId: u.user_id, suspend: !u.is_suspended })}>
                              <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
                              {u.is_suspended ? t("admin.reactivate") : t("admin.suspendUser")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setPlanDialog({ open: true, user: u }); setSelectedPlan(u.plan_name || PLANS[0].name); }}>
                              <Crown className="mr-2 h-4 w-4" aria-hidden="true" />{t("admin.changePlan")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => resetBillingMutation.mutate(u.user_id)}>
                              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />{t("admin.resetBilling")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { startClientView(u.user_id, u.email || "—"); navigate("/dashboard"); }}>
                              <Eye className="mr-2 h-4 w-4" aria-hidden="true" />{t("admin.viewAsClient", "Ver como cliente")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change Plan Dialog */}
      <Dialog open={planDialog.open} onOpenChange={(o) => !o && setPlanDialog({ open: false, user: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.changePlanTitle", { email: planDialog.user?.email })}</DialogTitle>
          </DialogHeader>
          <Select value={selectedPlan} onValueChange={setSelectedPlan}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PLANS.map((p) => (
                <SelectItem key={p.name} value={p.name}>
                  {p.name} ({formatNumber(p.maxClicksLimit)} clicks / {p.maxDomains} domains)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanDialog({ open: false, user: null })}>{t("common.cancel")}</Button>
            <Button
              onClick={() => {
                const plan = PLANS.find((p) => p.name === selectedPlan);
                if (plan && planDialog.user) changePlanMutation.mutate({ userId: planDialog.user.user_id, plan });
              }}
              disabled={changePlanMutation.isPending}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}