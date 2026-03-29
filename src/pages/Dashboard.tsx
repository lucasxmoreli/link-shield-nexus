import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, ShieldCheck, Target, Percent, Globe, Monitor, Smartphone, Tablet, Clock, MapPin, HeartPulse, Eye } from "lucide-react";
import { TopAttackOrigins } from "@/components/dashboard/TopAttackOrigins";
import { VolatilityRadar } from "@/components/dashboard/VolatilityRadar";
import { OnboardingWizard } from "@/components/dashboard/OnboardingWizard";
import { useDopamineToast } from "@/components/dashboard/useDopamineToast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/StatCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { getStatusBadgeConfig } from "@/lib/status-utils";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { format, subDays, startOfMonth, startOfDay, formatDistanceToNow, getHours } from "date-fns";

const DEVICE_COLORS = [
  "hsl(271, 81%, 56%)",
  "hsl(142, 71%, 45%)",
  "hsl(45, 100%, 51%)",
];

export default function Dashboard() {
  const { user } = useAuth();
  const [dateRange, setDateRange] = useState("7");
  const { t } = useTranslation();
  useDopamineToast();

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["dashboard_analytics_view", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dashboard_analytics_view" as any)
        .select("action_taken, status_final, motivo_limpo, created_at, device_type, ip_address, country_code, risk_score")
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

  // Apply date filtering consistently using startOfDay for "today"
  const filteredLogs = (() => {
    const now = new Date();
    if (dateRange === "1") {
      const todayStart = startOfDay(now);
      return logs.filter(l => new Date(l.created_at) >= todayStart);
    }
    if (dateRange === "month") {
      const monthStart = startOfMonth(now);
      return logs.filter(l => new Date(l.created_at) >= monthStart);
    }
    const days = parseInt(dateRange);
    const startDate = subDays(startOfDay(now), days - 1);
    return logs.filter(l => new Date(l.created_at) >= startDate);
  })();

  const stats = {
    total_requests: filteredLogs.length,
    offer_page: filteredLogs.filter((l) => l.status_final === "Aprovado").length,
    rejected: filteredLogs.filter((l) => l.status_final === "Bloqueado" || l.status_final === "Página Segura").length,
    pass_rate: filteredLogs.length > 0
      ? ((filteredLogs.filter((l) => l.status_final === "Aprovado").length / filteredLogs.length) * 100).toFixed(1)
      : "0.0",
  };

  // Health Score — based on approved traffic risk scores
  const approvedWithScore = filteredLogs.filter(l => l.status_final === "Aprovado" && l.risk_score != null);
  const healthScore = approvedWithScore.length > 0
    ? Math.round(approvedWithScore.reduce((a, l) => a + (l.risk_score as number), 0) / approvedWithScore.length)
    : null;
  const healthLabel = healthScore == null
    ? t("dashboard.healthCalculating")
    : healthScore < 10 ? t("dashboard2.healthGood")
    : healthScore <= 30 ? t("dashboard2.healthWarning")
    : t("dashboard2.healthDanger");
  const healthVariant = healthScore == null
    ? "default" as const
    : healthScore < 10 ? "success" as const
    : healthScore <= 30 ? "default" as const
    : "destructive" as const;
  const healthDisplay = healthScore != null ? `${healthScore} — ${healthLabel}` : healthLabel;

  // Chart data logic: hourly for "today", daily otherwise
  const isToday = dateRange === "1";
  const isThisMonth = dateRange === "month";

  const chartData = (() => {
    if (isToday) {
      const todayStart = startOfDay(new Date());
      const todayLogs = filteredLogs;
      return Array.from({ length: 24 }, (_, hour) => {
        const hourLogs = todayLogs.filter((l) => getHours(new Date(l.created_at)) === hour);
          return {
          day: `${String(hour).padStart(2, "0")}:00`,
          offer_page: hourLogs.filter((l) => l.status_final === "Aprovado").length,
          rejected: hourLogs.filter((l) => l.status_final === "Bloqueado" || l.status_final === "Página Segura").length,
        };
      });
    }

    const days = isThisMonth
      ? Math.ceil((new Date().getTime() - startOfMonth(new Date()).getTime()) / (1000 * 60 * 60 * 24)) + 1
      : parseInt(dateRange);
    const startDate = isThisMonth ? startOfMonth(new Date()) : subDays(startOfDay(new Date()), days - 1);

    return Array.from({ length: days }, (_, i) => {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dayStr = format(date, "yyyy-MM-dd");
      const dayLabel = days <= 7 ? format(date, "EEE") : format(date, "MMM d");
      const dayLogs = filteredLogs.filter((l) => l.created_at.startsWith(dayStr));
      return {
        day: dayLabel,
        offer_page: dayLogs.filter((l) => l.status_final === "Aprovado").length,
        rejected: dayLogs.filter((l) => l.status_final === "Bloqueado" || l.status_final === "Página Segura").length,
      };
    });
  })();

  const deviceCounts = {
    desktop: filteredLogs.filter((l) => l.device_type === "desktop").length || 0,
    mobile: filteredLogs.filter((l) => l.device_type === "mobile").length || 0,
    tablet: 0,
  };
  const totalDevices = deviceCounts.desktop + deviceCounts.mobile + deviceCounts.tablet;
  const deviceData = totalDevices > 0
    ? [
        { name: t("dashboard.desktop"), value: deviceCounts.desktop, icon: Monitor },
        { name: t("dashboard.mobile"), value: deviceCounts.mobile, icon: Smartphone },
        { name: t("dashboard.tablet"), value: deviceCounts.tablet || 1, icon: Tablet },
      ]
    : [
        { name: t("dashboard.desktop"), value: 40, icon: Monitor },
        { name: t("dashboard.mobile"), value: 55, icon: Smartphone },
        { name: t("dashboard.tablet"), value: 5, icon: Tablet },
      ];
  const deviceTotal = deviceData.reduce((a, b) => a + b.value, 0);

  const recentLogs = filteredLogs.slice(0, 5).map((l) => ({
    time: formatDistanceToNow(new Date(l.created_at), { addSuffix: true }),
    ip: l.ip_address ?? "—",
    country: l.country_code ?? "—",
    device: l.device_type === "mobile" ? t("dashboard.mobile") : t("dashboard.desktop"),
    status_final: l.status_final,
  }));

  const MOCK_FEED = [
    { time: "2 mins ago", ip: "191.193.70.18", country: "BR", device: t("dashboard.desktop"), status_final: "Aprovado" },
    { time: "5 mins ago", ip: "73.162.214.101", country: "US", device: t("dashboard.mobile"), status_final: "Bloqueado" },
    { time: "8 mins ago", ip: "177.79.99.151", country: "BR", device: t("dashboard.mobile"), status_final: "Aprovado" },
    { time: "12 mins ago", ip: "8.8.8.8", country: "US", device: t("dashboard.desktop"), status_final: "Página Segura" },
    { time: "15 mins ago", ip: "189.29.108.45", country: "DE", device: t("dashboard.desktop"), status_final: "Aprovado" },
  ];

  const feedData = recentLogs.length > 0 ? recentLogs : MOCK_FEED;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{t("dashboard.title")}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 truncate">{t("dashboard.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--success))] opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[hsl(var(--success))]" />
          </span>
          <span className="text-xs text-muted-foreground font-mono">{t("common.live")}</span>
        </div>
      </div>

      <OnboardingWizard />

      <VolatilityRadar />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[88px] rounded-lg" />)
        ) : (
          <>
            <StatCard title={t("dashboard.totalRequests")} value={stats.total_requests} icon={Activity} />
            <StatCard title={t("dashboard.passRate")} value={`${stats.pass_rate}%`} icon={Percent} variant="primary" trend={{ value: t("dashboard.realTrafficRatio"), positive: true }} />
            <StatCard title={t("dashboard.offerPage")} value={stats.offer_page} icon={Target} variant="success" />
            <StatCard title={t("dashboard.threatsBlocked")} value={stats.rejected} icon={ShieldCheck} variant="destructive" trend={{ value: t("dashboard.allRejected"), positive: false }} />
            <StatCard title={t("dashboard2.healthScore")} value={healthDisplay} icon={HeartPulse} variant={healthVariant} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
        <Card className="border-border bg-card xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">{t("dashboard.trafficOverview")}</CardTitle>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[160px] h-8 text-xs border-border bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t("dashboard.today")}</SelectItem>
                <SelectItem value="7">{t("dashboard.last7Days")}</SelectItem>
                <SelectItem value="30">{t("dashboard.last30Days")}</SelectItem>
                <SelectItem value="month">{t("dashboard.thisMonth")}</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              {isLoading ? (
                <Skeleton className="h-full w-full rounded-lg" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="gradientOffer" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradientBot" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 15%)" vertical={false} />
                    <XAxis dataKey="day" stroke="hsl(0 0% 40%)" fontSize={11} tickLine={false} axisLine={false} interval={isToday ? 3 : "preserveStartEnd"} />
                    <YAxis stroke="hsl(0 0% 40%)" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(0 0% 9%)",
                        border: "1px solid hsl(0 0% 18%)",
                        borderRadius: "10px",
                        color: "hsl(0 0% 95%)",
                        fontSize: 12,
                        boxShadow: "0 8px 32px hsl(0 0% 0% / 0.5)",
                      }}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    <Area type="monotone" dataKey="offer_page" stroke="hsl(142, 71%, 45%)" strokeWidth={2.5} fill="url(#gradientOffer)" name={t("dashboard.offerPage")} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(142, 71%, 45%)", fill: "hsl(0 0% 9%)" }} />
                    <Area type="monotone" dataKey="rejected" stroke="hsl(0, 84%, 60%)" strokeWidth={2.5} fill="url(#gradientBot)" name={t("dashboard.threatsBlocked")} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(0, 84%, 60%)", fill: "hsl(0 0% 9%)" }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              {t("dashboard.trafficByDevice")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center">
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={deviceData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={4} dataKey="value" strokeWidth={0}>
                    {deviceData.map((_, idx) => (<Cell key={idx} fill={DEVICE_COLORS[idx]} />))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(0 0% 9%)", border: "1px solid hsl(0 0% 18%)", borderRadius: "10px", color: "hsl(0 0% 95%)", fontSize: 12 }}
                    formatter={(value: number) => { const pct = deviceTotal > 0 ? Math.round((value / deviceTotal) * 100) : 0; return [`${pct}%`, ""]; }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-5 mt-2">
              {deviceData.map((d, idx) => {
                const DeviceIcon = d.icon;
                const pct = deviceTotal > 0 ? Math.round((d.value / deviceTotal) * 100) : 0;
                return (
                  <div key={d.name} className="flex items-center gap-2 text-sm">
                    <DeviceIcon className="h-3.5 w-3.5" style={{ color: DEVICE_COLORS[idx] }} />
                    <span className="text-muted-foreground">{d.name}</span>
                    <span className="font-mono font-semibold text-foreground">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
        <TopAttackOrigins />

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                {t("dashboard.liveTrafficLog")}
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--success))] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[hsl(var(--success))]" />
                </span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">{t("common.realTime")}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground text-xs uppercase tracking-wider">{t("dashboard.time")}</TableHead>
                  <TableHead className="text-muted-foreground text-xs uppercase tracking-wider">{t("dashboard.ipAddress")}</TableHead>
                  <TableHead className="text-muted-foreground text-xs uppercase tracking-wider">{t("dashboard.country")}</TableHead>
                  <TableHead className="text-muted-foreground text-xs uppercase tracking-wider">{t("dashboard.device")}</TableHead>
                  <TableHead className="text-muted-foreground text-xs uppercase tracking-wider text-right">{t("dashboard.action")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feedData.map((row, i) => {
                  const badgeConfig = getStatusBadgeConfig(row.status_final);
                  return (
                    <TableRow key={i} className="border-border">
                      <TableCell className="text-sm text-muted-foreground font-mono">{row.time}</TableCell>
                      <TableCell className="text-sm font-mono">{row.ip}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5 text-sm">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          {row.country}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.device}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className={`${badgeConfig.className} text-[11px] font-mono`}>
                          {badgeConfig.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
