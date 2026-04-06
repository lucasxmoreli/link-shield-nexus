import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Globe, Monitor, Smartphone, Tablet, Filter, ArrowDown } from "lucide-react";
import { TravaBreakdown } from "@/components/dashboard/TravaBreakdown";
import { LiveFeed } from "@/components/dashboard/LiveFeed";
import { OnboardingWizard } from "@/components/dashboard/OnboardingWizard";
import { VolatilityRadar } from "@/components/dashboard/VolatilityRadar";
import { useDopamineToast } from "@/components/dashboard/useDopamineToast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { format, subDays, startOfDay, getHours } from "date-fns";

const DEVICE_COLORS = ["hsl(271, 81%, 56%)", "hsl(142, 71%, 45%)", "hsl(45, 100%, 51%)"];

export default function Dashboard() {
  const { user, effectiveUserId } = useAuth();
  const [dateRange, setDateRange] = useState("all");
  const { t } = useTranslation();
  useDopamineToast();

  // ── DATA FETCH ──
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["dashboard_analytics_view", effectiveUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dashboard_analytics_view" as any)
        .select("action_taken, status_final, motivo_limpo, created_at, device_type, ip_address, country_code, risk_score")
        .eq("user_id", effectiveUserId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Array<{
        action_taken: string;
        status_final: string;
        motivo_limpo: string | null;
        created_at: string;
        device_type: string | null;
        ip_address: string | null;
        country_code: string | null;
        risk_score: number | null;
      }>;
    },
    enabled: !!user,
  });

  // ── Buscar shadow metrics agregadas (campaign_stats) ──
  const { data: shadowStats } = useQuery({
    queryKey: ["campaign_stats_shadow", effectiveUserId, dateRange],
    queryFn: async () => {
      const { data: userCampaigns } = await supabase
        .from("campaigns")
        .select("id")
        .eq("user_id", effectiveUserId!);
      const campaignIds = (userCampaigns || []).map((c: any) => c.id);
      if (campaignIds.length === 0) return { dedup: 0, prefetch: 0, ghost: 0 };

      let query = supabase
        .from("campaign_stats" as any)
        .select("dedup_clicks, prefetch_clicks, ghost_clicks")
        .in("campaign_id", campaignIds);

      if (dateRange !== "all") {
        const now = new Date();
        const days = dateRange === "1" ? 0 : parseInt(dateRange) - 1;
        const startDate = subDays(startOfDay(now), days).toISOString().split("T")[0];
        query = query.gte("date", startDate);
      }

      const { data, error } = await query;
      if (error) return { dedup: 0, prefetch: 0, ghost: 0 };
      const rows = (data || []) as any[];
      return {
        dedup: rows.reduce((acc: number, r: any) => acc + (r.dedup_clicks || 0), 0),
        prefetch: rows.reduce((acc: number, r: any) => acc + (r.prefetch_clicks || 0), 0),
        ghost: rows.reduce((acc: number, r: any) => acc + (r.ghost_clicks || 0), 0),
      };
    },
    enabled: !!effectiveUserId,
  });

  // ── DATE FILTER ──
  const filteredLogs = useMemo(() => {
    if (dateRange === "all") return logs;
    const now = new Date();
    if (dateRange === "1") {
      const todayStart = startOfDay(now);
      return logs.filter((l) => new Date(l.created_at) >= todayStart);
    }
    const days = parseInt(dateRange);
    const startDate = subDays(startOfDay(now), days - 1);
    return logs.filter((l) => new Date(l.created_at) >= startDate);
  }, [logs, dateRange]);

  // ── METRICS ──
  const metrics = useMemo(() => {
    const analyzed = filteredLogs.length;
    const approved = filteredLogs.filter((l) => l.status_final === "Aprovado").length;
    const blocked = filteredLogs.filter((l) => l.status_final !== "Aprovado").length;
    const passRate = analyzed > 0 ? ((approved / analyzed) * 100).toFixed(1) : "0.0";
    return { analyzed, approved, blocked, passRate };
  }, [filteredLogs]);

  // ── FUNNEL NUMBERS ──
  const funnel = useMemo(() => {
    const shadow = shadowStats || { dedup: 0, prefetch: 0, ghost: 0 };
    const discarded = shadow.dedup + shadow.prefetch + shadow.ghost;
    const rawClicks = metrics.analyzed + discarded;
    return { rawClicks, discarded, analyzed: metrics.analyzed, ...shadow };
  }, [metrics, shadowStats]);

  // ── CHART DATA ──
  const isToday = dateRange === "1";

  const chartData = useMemo(() => {
    if (isToday) {
      return Array.from({ length: 24 }, (_, hour) => {
        const hourLogs = filteredLogs.filter((l) => getHours(new Date(l.created_at)) === hour);
        return {
          day: `${String(hour).padStart(2, "0")}:00`,
          approved: hourLogs.filter((l) => l.status_final === "Aprovado").length,
          blocked: hourLogs.filter((l) => l.status_final !== "Aprovado").length,
        };
      });
    }
    const dayMap: Record<string, { approved: number; blocked: number }> = {};
    filteredLogs.forEach((l) => {
      const dayStr = l.created_at.substring(0, 10);
      if (!dayMap[dayStr]) dayMap[dayStr] = { approved: 0, blocked: 0 };
      if (l.status_final === "Aprovado") dayMap[dayStr].approved++;
      else dayMap[dayStr].blocked++;
    });
    return Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dayStr, v]) => ({ day: format(new Date(dayStr + "T00:00:00"), "MMM d"), ...v }));
  }, [filteredLogs, isToday]);

  // ── DEVICE DATA ──
  const deviceData = useMemo(() => {
    const counts = {
      desktop: filteredLogs.filter((l) => l.device_type === "desktop").length,
      mobile: filteredLogs.filter((l) => l.device_type === "mobile").length,
      tablet: 0,
    };
    const total = counts.desktop + counts.mobile;
    if (total === 0) return [
      { name: "Desktop", value: 35, icon: Monitor },
      { name: "Mobile", value: 60, icon: Smartphone },
      { name: "Tablet", value: 5, icon: Tablet },
    ];
    return [
      { name: "Desktop", value: counts.desktop, icon: Monitor },
      { name: "Mobile", value: counts.mobile, icon: Smartphone },
      { name: "Tablet", value: counts.tablet || 1, icon: Tablet },
    ];
  }, [filteredLogs]);

  const deviceTotal = deviceData.reduce((a, b) => a + b.value, 0);

  // ── RENDER ──
  return (
    <div className="space-y-4 sm:space-y-5">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{t("dashboard.title")}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{t("dashboard.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[140px] h-8 text-xs border-border bg-secondary/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">{t("dashboard.today")}</SelectItem>
              <SelectItem value="7">{t("dashboard.last7Days")}</SelectItem>
              <SelectItem value="30">{t("dashboard.last30Days")}</SelectItem>
              <SelectItem value="all">{t("dashboard.allTime")}</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">{t("common.live")}</span>
          </div>
        </div>
      </div>

      <OnboardingWizard />
      <VolatilityRadar />

      {/* FUNIL DE TRÁFEGO */}
      {isLoading ? (
        <Skeleton className="h-[100px] rounded-xl" />
      ) : (
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Funil de Tráfego</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-center">
            {/* Cliques Brutos */}
            <div className="text-center sm:text-left">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Cliques Brutos</p>
              <p className="text-2xl font-bold font-mono mt-0.5">{funnel.rawClicks.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">Total recebido</p>
            </div>

            <div className="hidden sm:flex justify-center">
              <ArrowDown className="h-5 w-5 text-muted-foreground/40 rotate-[-90deg]" />
            </div>

            {/* Lixo Descartado */}
            <div className="text-center sm:text-left">
              <p className="text-[10px] uppercase tracking-widest text-destructive/80">Lixo Descartado</p>
              <p className="text-2xl font-bold font-mono mt-0.5 text-destructive">{funnel.discarded.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">
                {funnel.dedup > 0 && <span>Dedup: {funnel.dedup}</span>}
                {funnel.prefetch > 0 && <span>{funnel.dedup > 0 ? " · " : ""}Prefetch: {funnel.prefetch}</span>}
                {funnel.ghost > 0 && <span>{(funnel.dedup > 0 || funnel.prefetch > 0) ? " · " : ""}Fantasma: {funnel.ghost}</span>}
                {funnel.discarded === 0 && "Nenhum descartado"}
              </p>
            </div>

            <div className="hidden sm:flex justify-center">
              <ArrowDown className="h-5 w-5 text-muted-foreground/40 rotate-[-90deg]" />
            </div>

            {/* Tráfego Analisado */}
            <div className="text-center sm:text-left">
              <p className="text-[10px] uppercase tracking-widest text-primary/80">Tráfego Analisado</p>
              <p className="text-2xl font-bold font-mono mt-0.5 text-primary">{funnel.analyzed.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">Passou pelo motor</p>
            </div>
          </div>
        </div>
      )}

      {/* STAT CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[80px] rounded-lg" />)
        ) : (
          <>
            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("dashboard.totalRequests")}</p>
                <p className="text-2xl font-bold font-mono mt-1">{metrics.analyzed.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card border-l-2 border-l-emerald-500/50">
              <CardContent className="p-4">
                <p className="text-[10px] uppercase tracking-widest text-emerald-400/80">{t("dashboard.offerPage")}</p>
                <p className="text-2xl font-bold font-mono mt-1 text-emerald-400">{metrics.approved.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card border-l-2 border-l-destructive/50">
              <CardContent className="p-4">
                <p className="text-[10px] uppercase tracking-widest text-destructive/80">{t("dashboard.threatsBlocked")}</p>
                <p className="text-2xl font-bold font-mono mt-1 text-destructive">{metrics.blocked.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card border-l-2 border-l-primary/50">
              <CardContent className="p-4">
                <p className="text-[10px] uppercase tracking-widest text-primary/80">{t("dashboard.passRate")}</p>
                <p className="text-2xl font-bold font-mono mt-1 text-primary">{metrics.passRate}%</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* CHART + TRAVA BREAKDOWN */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="border-border bg-card xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t("dashboard.trafficOverview")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {isLoading ? (
                <Skeleton className="h-full w-full rounded-lg" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="gApproved" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gBlocked" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 15%)" vertical={false} />
                    <XAxis dataKey="day" stroke="hsl(0 0% 40%)" fontSize={11} tickLine={false} axisLine={false} interval={isToday ? 3 : "preserveStartEnd"} />
                    <YAxis stroke="hsl(0 0% 40%)" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#f4f4f5', borderRadius: '8px' }} itemStyle={{ color: '#f4f4f5' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Area type="monotone" dataKey="approved" stroke="hsl(142, 71%, 45%)" strokeWidth={2} fill="url(#gApproved)" name={t("dashboard.offerPage")} dot={false} />
                    <Area type="monotone" dataKey="blocked" stroke="hsl(0, 84%, 60%)" strokeWidth={2} fill="url(#gBlocked)" name={t("dashboard.threatsBlocked")} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <TravaBreakdown logs={filteredLogs} />
      </div>

      {/* DEVICE + LIVE FEED */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              {t("dashboard.trafficByDevice")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center">
            <div className="h-[160px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={deviceData} cx="50%" cy="50%" innerRadius={48} outerRadius={68} paddingAngle={4} dataKey="value" strokeWidth={0}>
                    {deviceData.map((_, idx) => (<Cell key={idx} fill={DEVICE_COLORS[idx]} />))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#f4f4f5', borderRadius: '8px' }}
                    itemStyle={{ color: '#f4f4f5' }}
                    formatter={(value: number) => [`${deviceTotal > 0 ? Math.round((value / deviceTotal) * 100) : 0}%`, ""]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 mt-1">
              {deviceData.map((d, idx) => {
                const DeviceIcon = d.icon;
                const pct = deviceTotal > 0 ? Math.round((d.value / deviceTotal) * 100) : 0;
                return (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs">
                    <DeviceIcon className="h-3 w-3" style={{ color: DEVICE_COLORS[idx] }} />
                    <span className="text-muted-foreground">{d.name}</span>
                    <span className="font-mono font-semibold">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="xl:col-span-2">
          <LiveFeed logs={filteredLogs} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
