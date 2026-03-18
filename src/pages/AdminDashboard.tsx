import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdmin } from "@/hooks/useAdmin";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { Users, Megaphone, MousePointerClick, ShieldAlert, Crown, Ban } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";
import { getPlanByName } from "@/lib/plan-config";

const PLANS = [
  { name: "Free", clicks: 0, domains: 0 },
  { name: "BASIC PLAN", clicks: 20000, domains: 3 },
  { name: "PRO PLAN", clicks: 100000, domains: 10 },
  { name: "FREEDOM PLAN", clicks: 300000, domains: 20 },
  { name: "ENTERPRISE CONQUEST", clicks: 1000000, domains: 25 },
];

interface AdminUser {
  user_id: string;
  email: string;
  plan_name: string;
  current_clicks: number;
  max_clicks: number;
  is_suspended: boolean;
  created_at: string;
  campaign_count: number;
}

export default function AdminDashboard() {
  const { isAdmin, isLoading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [planDialog, setPlanDialog] = useState<{ open: boolean; user: AdminUser | null }>({ open: false, user: null });
  const [selectedPlan, setSelectedPlan] = useState("");

  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      navigate("/dashboard", { replace: true });
    }
  }, [adminLoading, isAdmin, navigate]);

  const { data: stats } = useQuery({
    queryKey: ["admin_stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_stats");
      if (error) throw error;
      return data as { total_users: number; active_campaigns: number; monthly_clicks: number };
    },
    enabled: isAdmin,
  });

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["admin_users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) throw error;
      return (data as AdminUser[]) || [];
    },
    enabled: isAdmin,
  });

  const suspendMutation = useMutation({
    mutationFn: async ({ userId, suspend }: { userId: string; suspend: boolean }) => {
      const { error } = await supabase.rpc("admin_toggle_suspend", {
        p_user_id: userId,
        p_suspend: suspend,
      });
      if (error) throw error;
    },
    onSuccess: (_, { suspend }) => {
      queryClient.invalidateQueries({ queryKey: ["admin_users"] });
      queryClient.invalidateQueries({ queryKey: ["admin_stats"] });
      toast.success(suspend ? "User suspended" : "User reactivated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const changePlanMutation = useMutation({
    mutationFn: async ({ userId, plan }: { userId: string; plan: typeof PLANS[number] }) => {
      const { error } = await supabase.rpc("admin_change_plan", {
        p_user_id: userId,
        p_plan_name: plan.name,
        p_max_clicks: plan.clicks,
        p_max_domains: plan.domains,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_users"] });
      queryClient.invalidateQueries({ queryKey: ["admin_stats"] });
      setPlanDialog({ open: false, user: null });
      toast.success("Plan updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (adminLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const formatNumber = (n: number) => n.toLocaleString();
  const formatDate = (d: string) => new Date(d).toLocaleDateString();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Admin Command Center</h1>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
            <Users className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{formatNumber(stats?.total_users ?? 0)}</div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Campaigns</CardTitle>
            <Megaphone className="h-5 w-5 text-accent-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{formatNumber(stats?.active_campaigns ?? 0)}</div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Clicks This Cycle</CardTitle>
            <MousePointerClick className="h-5 w-5 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{formatNumber(stats?.monthly_clicks ?? 0)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">All Users</CardTitle>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Click Usage</TableHead>
                    <TableHead className="text-center">Campaigns</TableHead>
                    <TableHead>Registered</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const pct = u.max_clicks > 0 ? Math.min((u.current_clicks / u.max_clicks) * 100, 100) : 0;
                    return (
                      <TableRow key={u.user_id} className={u.is_suspended ? "opacity-60" : ""}>
                        <TableCell className="font-medium text-foreground">{u.email || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {u.plan_name || "Free"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-[160px]">
                            <Progress value={pct} className="h-2 flex-1" />
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatNumber(u.current_clicks ?? 0)} / {u.max_clicks > 0 ? formatNumber(u.max_clicks) : "∞"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{u.campaign_count}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{formatDate(u.created_at)}</TableCell>
                        <TableCell>
                          {u.is_suspended ? (
                            <Badge variant="destructive" className="text-xs">Suspended</Badge>
                          ) : (
                            <Badge variant="default" className="text-xs bg-emerald-600">Active</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">⋮</Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => suspendMutation.mutate({ userId: u.user_id, suspend: !u.is_suspended })}
                              >
                                <Ban className="mr-2 h-4 w-4" />
                                {u.is_suspended ? "Reactivate" : "Suspend User"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setPlanDialog({ open: true, user: u });
                                  setSelectedPlan(u.plan_name || "Free");
                                }}
                              >
                                <Crown className="mr-2 h-4 w-4" />
                                Change Plan
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
            <DialogTitle>Change Plan — {planDialog.user?.email}</DialogTitle>
          </DialogHeader>
          <Select value={selectedPlan} onValueChange={setSelectedPlan}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLANS.map((p) => (
                <SelectItem key={p.name} value={p.name}>
                  {p.name} ({formatNumber(p.clicks)} clicks / {p.domains} domains)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanDialog({ open: false, user: null })}>Cancel</Button>
            <Button
              onClick={() => {
                const plan = PLANS.find((p) => p.name === selectedPlan);
                if (plan && planDialog.user) {
                  changePlanMutation.mutate({ userId: planDialog.user.user_id, plan });
                }
              }}
              disabled={changePlanMutation.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
