import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/StatCard";
import { BarChart2, MousePointerClick, Users, CheckCircle, Percent, DollarSign, TrendingUp } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { subDays, startOfDay, format } from "date-fns";

type DatePreset = "today" | "7days" | "30days" | "all";

export default function Analytics() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");
  const [datePreset, setDatePreset] = useState<DatePreset>("7days");

  const { data: campaigns, isLoading: loadingCampaigns } = useQuery({
    queryKey: ["campaigns-list", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name, hash")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const dateFilter = useMemo(() => {
    const now = new Date();
    switch (datePreset) {
      case "today": return startOfDay(now);
      case "7days": return subDays(now, 7);
      case "30days": return subDays(now, 30);
      default: return null;
    }
  }, [datePreset]);

  const { data: logs, isLoading: loadingLogs } = useQuery({
    queryKey: ["analytics-logs", selectedCampaign, datePreset],
    queryFn: async () => {
      let query = supabase
        .from("requests_log")
        .select("action_taken, country_code, device_type, created_at, source_platform, cost, is_unique")
        .eq("campaign_id", selectedCampaign)
        .order("created_at", { ascending: true });

      if (dateFilter) {
        query = query.gte("created_at", dateFilter.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Array<{
        action_taken: string;
        country_code: string | null;
        device_type: string | null;
        created_at: string;
        source_platform: string | null;
        cost: number | null;
        is_unique: boolean | null;
      }>;
    },
    enabled: !!selectedCampaign,
  });

  // Metrics
  const metrics = useMemo(() => {
    if (!logs || logs.length === 0) return null;
    const total = logs.length;
    const unique = logs.filter(l => l.is_unique).length;
    const approved = logs.filter(l => l.action_taken === "offer_page").length;
    const approvalRate = total > 0 ? ((approved / total) * 100).toFixed(1) : "0";
    const totalCost = logs.reduce((acc, l) => acc + (Number(l.cost) || 0), 0);
    const cpl = approved > 0 ? (totalCost / approved) : 0;
    return { total, unique, approved, approvalRate, totalCost, cpl };
  }, [logs]);

  // Chart data
  const chartData = useMemo(() => {
    if (!logs || logs.length === 0) return [];
    const dayMap: Record<string, { approved: number; blocked: number }> = {};
    logs.forEach(l => {
      const day = format(new Date(l.created_at), "MM/dd");
      if (!dayMap[day]) dayMap[day] = { approved: 0, blocked: 0 };
      if (l.action_taken === "offer_page") dayMap[day].approved++;
      else dayMap[day].blocked++;
    });
    return Object.entries(dayMap).map(([day, v]) => ({ day, ...v }));
  }, [logs]);

  // Breakdown by platform
  const platformBreakdown = useMemo(() => {
    if (!logs) return [];
    const map: Record<string, { clicks: number; approved: number; blocked: number; cost: number }> = {};
    logs.forEach(l => {
      const p = l.source_platform || "Unknown";
      if (!map[p]) map[p] = { clicks: 0, approved: 0, blocked: 0, cost: 0 };
      map[p].clicks++;
      if (l.action_taken === "offer_page") map[p].approved++;
      else map[p].blocked++;
      map[p].cost += Number(l.cost) || 0;
    });
    return Object.entries(map).map(([platform, v]) => ({
      platform,
      ...v,
      cpc: v.clicks > 0 ? (v.cost / v.clicks) : 0,
    }));
  }, [logs]);

  // Breakdown by country
  const countryBreakdown = useMemo(() => {
    if (!logs) return [];
    const map: Record<string, { clicks: number; approved: number }> = {};
    logs.forEach(l => {
      const c = l.country_code || "??";
      if (!map[c]) map[c] = { clicks: 0, approved: 0 };
      map[c].clicks++;
      if (l.action_taken === "offer_page") map[c].approved++;
    });
    return Object.entries(map)
      .map(([country, v]) => ({ country, ...v, rate: v.clicks > 0 ? ((v.approved / v.clicks) * 100).toFixed(1) : "0" }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10);
  }, [logs]);

  // Breakdown by device
  const deviceBreakdown = useMemo(() => {
    if (!logs) return [];
    const map: Record<string, { clicks: number; approved: number; blocked: number }> = {};
    logs.forEach(l => {
      const d = l.device_type || "Unknown";
      if (!map[d]) map[d] = { clicks: 0, approved: 0, blocked: 0 };
      map[d].clicks++;
      if (l.action_taken === "offer_page") map[d].approved++;
      else map[d].blocked++;
    });
    return Object.entries(map).map(([device, v]) => ({ device, ...v }));
  }, [logs]);

  const chartConfig = {
    approved: { label: t("analytics.approved"), color: "hsl(142 71% 45%)" },
    blocked: { label: t("analytics.blocked"), color: "hsl(var(--destructive))" },
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart2 className="h-6 w-6 text-primary" />
            {t("analytics.title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("analytics.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder={t("analytics.selectCampaign")} />
            </SelectTrigger>
            <SelectContent>
              {campaigns?.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name} ({c.hash})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">{t("analytics.today")}</SelectItem>
              <SelectItem value="7days">{t("analytics.last7days")}</SelectItem>
              <SelectItem value="30days">{t("analytics.last30days")}</SelectItem>
              <SelectItem value="all">{t("analytics.allTime")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Empty state: no campaign selected */}
      {!selectedCampaign && (
        <Card className="flex flex-col items-center justify-center py-16">
          <BarChart2 className="h-16 w-16 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground text-lg font-medium">{t("analytics.emptySelect")}</p>
        </Card>
      )}

      {/* Loading */}
      {selectedCampaign && loadingLogs && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      )}

      {/* Campaign selected but no data */}
      {selectedCampaign && !loadingLogs && (!logs || logs.length === 0) && (
        <Card className="flex flex-col items-center justify-center py-16">
          <MousePointerClick className="h-16 w-16 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground text-lg font-medium">{t("analytics.emptyData")}</p>
          <p className="text-muted-foreground text-sm mt-1 max-w-md text-center">{t("analytics.emptyDataHint")}</p>
        </Card>
      )}

      {/* Data loaded */}
      {selectedCampaign && metrics && (
        <>
          {/* Metrics cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard title={t("analytics.totalClicks")} value={metrics.total.toLocaleString()} icon={MousePointerClick} variant="default" />
            <StatCard title={t("analytics.uniqueClicks")} value={metrics.unique.toLocaleString()} icon={Users} variant="primary" />
            <StatCard title={t("analytics.approvedLeads")} value={metrics.approved.toLocaleString()} icon={CheckCircle} variant="success" />
            <StatCard title={t("analytics.approvalRate")} value={`${metrics.approvalRate}%`} icon={Percent} variant="default" />
            <StatCard title={t("analytics.totalCost")} value={`$${metrics.totalCost.toFixed(2)}`} icon={DollarSign} variant="destructive" />
            <StatCard title={t("analytics.cpl")} value={`$${metrics.cpl.toFixed(2)}`} icon={TrendingUp} variant="primary" />
          </div>

          {/* Chart */}
          {chartData.length >= 2 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("analytics.dailyChart")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px] w-full">
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis dataKey="day" className="text-xs" />
                    <YAxis className="text-xs" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area type="monotone" dataKey="approved" stroke="hsl(142 71% 45%)" fill="hsl(142 71% 45%)" fillOpacity={0.3} strokeWidth={2} dot={false} connectNulls />
                    <Area type="monotone" dataKey="blocked" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.2} strokeWidth={2} dot={false} connectNulls />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          {/* Platform breakdown */}
          {platformBreakdown.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">{t("analytics.platformBreakdown")}</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("analytics.platform")}</TableHead>
                      <TableHead className="text-right">{t("analytics.clicks")}</TableHead>
                      <TableHead className="text-right">{t("analytics.approved")}</TableHead>
                      <TableHead className="text-right">{t("analytics.blocked")}</TableHead>
                      <TableHead className="text-right">{t("analytics.cost")}</TableHead>
                      <TableHead className="text-right">{t("analytics.avgCpc")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {platformBreakdown.map(r => (
                      <TableRow key={r.platform}>
                        <TableCell className="font-medium">{r.platform}</TableCell>
                        <TableCell className="text-right">{r.clicks}</TableCell>
                        <TableCell className="text-right">{r.approved}</TableCell>
                        <TableCell className="text-right">{r.blocked}</TableCell>
                        <TableCell className="text-right">${r.cost.toFixed(2)}</TableCell>
                        <TableCell className="text-right">${r.cpc.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Country + Device breakdowns side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Country */}
            {countryBreakdown.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">{t("analytics.countryBreakdown")}</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("analytics.country")}</TableHead>
                        <TableHead className="text-right">{t("analytics.clicks")}</TableHead>
                        <TableHead className="text-right">{t("analytics.approved")}</TableHead>
                        <TableHead className="text-right">{t("analytics.approvalRate")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {countryBreakdown.map(r => (
                        <TableRow key={r.country}>
                          <TableCell className="font-medium">{r.country}</TableCell>
                          <TableCell className="text-right">{r.clicks}</TableCell>
                          <TableCell className="text-right">{r.approved}</TableCell>
                          <TableCell className="text-right">{r.rate}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Device */}
            {deviceBreakdown.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">{t("analytics.deviceBreakdown")}</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("analytics.device")}</TableHead>
                        <TableHead className="text-right">{t("analytics.clicks")}</TableHead>
                        <TableHead className="text-right">{t("analytics.approved")}</TableHead>
                        <TableHead className="text-right">{t("analytics.blocked")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deviceBreakdown.map(r => (
                        <TableRow key={r.device}>
                          <TableCell className="font-medium capitalize">{r.device}</TableCell>
                          <TableCell className="text-right">{r.clicks}</TableCell>
                          <TableCell className="text-right">{r.approved}</TableCell>
                          <TableCell className="text-right">{r.blocked}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
