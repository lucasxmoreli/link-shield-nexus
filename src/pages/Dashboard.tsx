import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { subDays, startOfDay, getHours, format } from "date-fns";

import { MetricsSidebar } from "@/components/dashboard/MetricsSidebar";
import { TrafficFlowChart } from "@/components/dashboard/TrafficFlowChart";
import { LiveStreamList } from "@/components/dashboard/LiveStreamList";
import { OnboardingWizard } from "@/components/dashboard/OnboardingWizard";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LogRow {
  action_taken: string;
  status_final: string;
  motivo_limpo: string | null;
  created_at: string;
  device_type: string | null;
  ip_address: string | null;
  country_code: string | null;
  risk_score: number | null;
}

interface ShadowStats {
  dedup: number;
  prefetch: number;
  ghost: number;
}

/**
 * Dashboard V2 — Command Center (Asymmetrical Split)
 *
 * LAYOUT RULE: This component uses w-full only.
 * The parent (AppLayout) manages sidebar space.
 * ZERO fixed left margins (ml-*, margin-left).
 */
export default function Dashboard() {
  const { user, effectiveUserId } = useAuth();
  const [dateRange, setDateRange] = useState("1");
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const { t } = useTranslation();

  const {
    data: logs = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["dashboard_analytics_view", effectiveUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dashboard_analytics_view" as any)
        .select(
          "action_taken, status_final, motivo_limpo, created_at, device_type, ip_address, country_code, risk_score"
        )
        .eq("user_id", effectiveUserId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setLastUpdated(new Date());
      return data as unknown as LogRow[];
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const { data: shadowStats } = useQuery<ShadowStats>({
    queryKey: ["campaign_stats_shadow", effectiveUserId, dateRange],
    queryFn: async () => {
      const { data: userCampaigns } = await supabase
        .from("campaigns")
        .select("id")
        .eq("user_id", effectiveUserId!);
      const campaignIds = (userCampaigns || []).map((c: any) => c.id);
      if (campaignIds.length === 0)
        return { dedup: 0, prefetch: 0, ghost: 0 };

      let query = supabase
        .from("campaign_stats" as any)
        .select("dedup_clicks, prefetch_clicks, ghost_clicks")
        .in("campaign_id", campaignIds);

      if (dateRange !== "all") {
        const now = new Date();
        const days = dateRange === "1" ? 0 : parseInt(dateRange) - 1;
        const startDate = subDays(startOfDay(now), days)
          .toISOString()
          .split("T")[0];
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

  const metrics = useMemo(() => {
    const analyzed = filteredLogs.length;
    const approved = filteredLogs.filter((l) => l.status_final === "Aprovado").length;
    const blocked = filteredLogs.filter((l) => l.status_final !== "Aprovado").length;
    return { analyzed, approved, blocked };
  }, [filteredLogs]);

  const totalRequests = useMemo(() => {
    const shadow = shadowStats || { dedup: 0, prefetch: 0, ghost: 0 };
    return metrics.analyzed + shadow.dedup + shadow.prefetch + shadow.ghost;
  }, [metrics, shadowStats]);

  const isToday = dateRange === "1";

  const chartData = useMemo(() => {
    if (isToday) {
      return Array.from({ length: 24 }, (_, hour) => {
        const hourLogs = filteredLogs.filter(
          (l) => getHours(new Date(l.created_at)) === hour
        );
        return {
          label: `${String(hour).padStart(2, "0")}:00`,
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
      .map(([dayStr, v]) => ({
        label: format(new Date(dayStr + "T00:00:00"), "MMM d"),
        ...v,
      }));
  }, [filteredLogs, isToday]);

  const timeAgoText = useMemo(() => {
    const diffSec = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (diffSec < 10) return t("dashboard.justNow");
    if (diffSec < 60) return `${diffSec}s`;
    return `${Math.floor(diffSec / 60)}m`;
  }, [lastUpdated, t]);

  const handleRefresh = () => {
    refetch();
    setLastUpdated(new Date());
  };

  return (
    <div className="w-full">
      <div className="max-w-[1400px] mx-auto space-y-6 sm:space-y-8">
        <OnboardingWizard />

        {/* ─── HEADER ─── */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              {t("dashboard.title")}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              {t("dashboard.subtitle")}
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <span className="text-[11px] text-muted-foreground/40 hidden md:block tabular-nums">
              {t("dashboard.lastUpdated")}: {timeAgoText}
            </span>

            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[130px] h-8 text-xs bg-[#111111] border-white/[0.06] hover:bg-[#161616] transition-colors">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t("dashboard.today")}</SelectItem>
                <SelectItem value="2">{t("dashboard.yesterday")}</SelectItem>
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
              <span className="text-[11px] text-muted-foreground font-medium tracking-wider uppercase">
                {t("common.live")}
              </span>
            </div>

            <button
              onClick={handleRefresh}
              className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-[#161616] transition-colors"
              aria-label={t("dashboard.refresh")}
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {/* ─── ASYMMETRICAL SPLIT ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 lg:gap-8">
          <MetricsSidebar
            totalRequests={totalRequests}
            botsBlocked={metrics.blocked}
            safePageHits={
              (shadowStats?.ghost || 0) +
              (shadowStats?.prefetch || 0) +
              (shadowStats?.dedup || 0)
            }
            realTraffic={metrics.approved}
            isLoading={isLoading}
          />

          <div className="space-y-5 min-w-0">
            <TrafficFlowChart
              data={chartData}
              isToday={isToday}
              isLoading={isLoading}
            />
            <LiveStreamList logs={filteredLogs} isLoading={isLoading} />
          </div>
        </div>
      </div>
    </div>
  );
}