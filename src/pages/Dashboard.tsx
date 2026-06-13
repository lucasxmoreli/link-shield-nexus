import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { subDays, getHours, format, eachDayOfInterval } from "date-fns";
import { spDateString, spStartOfDay } from "@/lib/timezone";

import { MetricsSidebar } from "@/components/dashboard/MetricsSidebar";
import { TrafficFlowChart, type ChartMode } from "@/components/dashboard/TrafficFlowChart";
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

// Shape de uma row em daily_campaign_stats — não está nos types gerados
// do Supabase ainda (rodar `supabase gen types` resolve), por isso o cast
// manual aqui evita poluir o componente com `as any` espalhado.
interface DailyStatRow {
  date: string;             // [PR-3b.5] "YYYY-MM-DD" agora ancorado em America/Sao_Paulo
  total_clicks: number;
  unique_clicks: number;
  bot_clicks: number;
  approved_clicks: number;  // [PR-3b.5] action_taken='offer_page' (tráfego REAL)
  safe_page_clicks: number; // [PR-3b.5] action_taken='safe_page' (bloqueado por geo/device/strict)
  conversions: number;
  total_cost: number;
  total_revenue: number;
}

/**
 * Dashboard V2 — Command Center (Asymmetrical Split)
 *
 * LAYOUT RULE: This component uses w-full only.
 * The parent (AppLayout) manages sidebar space.
 * ZERO fixed left margins (ml-*, margin-left).
 *
 * ─── PR-3b Fase 3: Hybrid Data Fetching ───────────────────────────
 * Antes: buscava TODA `dashboard_analytics_view` e agregava no client.
 *        Travava em 1M+ cliques.
 * Agora:
 *   • dateRange === "1" (Hoje)  → raw logs SÓ do dia (curto, OK no client)
 *   • dateRange != "1"          → daily_campaign_stats (pré-agregado, leve)
 *   • LiveStream                → SEMPRE raw de hoje (é "live", não histórico)
 * Trade-off conhecido: dados de "hoje" em filtros 7d/30d ficam até 1h
 * defasados (refresh do cron horário). Aceitável — quem quer real-time
 * fica em "Hoje".
 */
export default function Dashboard() {
  const { user, effectiveUserId } = useAuth();
  const [dateRange, setDateRange] = useState("1");
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const { t } = useTranslation();

  const isToday = dateRange === "1";

  // ─── QUERY 1: Raw logs de HOJE ────────────────────────────────────
  // Sempre ativa, independente do filtro:
  //   • Powera o LiveStream (que é, por definição, real-time)
  //   • Powera metrics/chart quando isToday === true
  // Volume: 1 dia → seguro pro client, mesmo em contas grandes.
  const {
    data: todayRaw = [],
    isLoading: isLoadingToday,
    refetch: refetchToday,
  } = useQuery({
    queryKey: ["dashboard_raw_today", effectiveUserId],
    queryFn: async () => {
      const todayStart = spStartOfDay().toISOString();
      const { data, error } = await supabase
        .from("dashboard_analytics_view" as any)
        .select(
          "action_taken, status_final, motivo_limpo, created_at, device_type, ip_address, country_code, risk_score"
        )
        .eq("user_id", effectiveUserId!)
        .gte("created_at", todayStart)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setLastUpdated(new Date());
      return data as unknown as LogRow[];
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  // ─── QUERY 2: Agregado de daily_campaign_stats (período histórico) ──
  // Só roda quando NÃO é "Hoje". Devolve poucas linhas (1 por dia × campanhas
  // ativas), então a soma client-side é O(N) com N pequeno.
  //
  // ATENÇÃO: a tabela daily_campaign_stats tem o campo `date` ancorado em
  // UTC (ver migration 20260419170000). Aqui usamos spDateString() pra
  // calcular as bordas do range — isso causa um descasamento de até 3h
  // entre "dia SP" e "dia UTC" no agregado. Para fechar esse gap de forma
  // correta, a função aggregate_daily_stats() precisa ser migrada para
  // ancorar em SP. TODO: PR-3b.4 — uniformizar timezone do agregado.
  const {
    data: aggStats = [],
    isLoading: isLoadingAgg,
    refetch: refetchAgg,
  } = useQuery({
    queryKey: ["daily_campaign_stats", effectiveUserId, dateRange],
    queryFn: async () => {
      let query = supabase
        .from("daily_campaign_stats" as any)
        .select(
          // [PR-3b.5] +approved_clicks, +safe_page_clicks (deslump)
          "date, total_clicks, unique_clicks, bot_clicks, approved_clicks, safe_page_clicks, conversions, total_cost, total_revenue"
        )
        .eq("user_id", effectiveUserId!)
        .order("date", { ascending: true });

      if (dateRange !== "all") {
        const days = parseInt(dateRange);
        const today = spDateString();
        const start = spDateString(subDays(new Date(), days - 1));
        query = query.gte("date", start).lte("date", today);
      }

      const { data, error } = await query;
      if (error) throw error;
      setLastUpdated(new Date());
      return (data || []) as unknown as DailyStatRow[];
    },
    enabled: !!effectiveUserId && !isToday,
    refetchInterval: 30_000,
  });

  // ─── QUERY 3: Período anterior do agregado (para trends) ────────────
  // Espelha a janela atual deslocada pra trás. Sempre vem do agregado
  // (mesmo quando o atual é "Hoje" — ontem já está fechado pelo cron).
  const { data: prevAggStats = [] } = useQuery({
    queryKey: ["daily_campaign_stats_prev", effectiveUserId, dateRange],
    queryFn: async () => {
      if (dateRange === "all") return [];
      const periodLength = parseInt(dateRange);
      const now = new Date();
      const currentStart = subDays(now, periodLength - 1);
      const previousStart = subDays(currentStart, periodLength);
      const previousEnd = subDays(currentStart, 1);

      const { data, error } = await supabase
        .from("daily_campaign_stats" as any)
        // [PR-3b.5] +approved_clicks, +safe_page_clicks pra previousMetrics calcular trends corretos
        .select("total_clicks, bot_clicks, approved_clicks, safe_page_clicks")
        .eq("user_id", effectiveUserId!)
        .gte("date", spDateString(previousStart))
        .lte("date", spDateString(previousEnd));

      if (error) throw error;
      return (data || []) as unknown as Pick<
        DailyStatRow,
        "total_clicks" | "bot_clicks" | "approved_clicks" | "safe_page_clicks"
      >[];
    },
    enabled: !!effectiveUserId && dateRange !== "all",
  });

  // ─── QUERY 4: Shadow stats (dedup/prefetch/ghost) ───────────────────
  // Mantida intacta — já vem de campaign_stats (tabela diferente, não da
  // requests_log) e o volume é O(dias × campanhas), trivial.
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
        const days = dateRange === "1" ? 0 : parseInt(dateRange) - 1;
        const startDate = spDateString(subDays(new Date(), days));
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

  // ─── QUERY 5: Shadow stats do período anterior (trends) ─────────────
  const { data: previousShadowStats } = useQuery<ShadowStats>({
    queryKey: ["campaign_stats_shadow_prev", effectiveUserId, dateRange],
    queryFn: async () => {
      if (dateRange === "all") return { dedup: 0, prefetch: 0, ghost: 0 };
      const { data: userCampaigns } = await supabase
        .from("campaigns")
        .select("id")
        .eq("user_id", effectiveUserId!);
      const campaignIds = (userCampaigns || []).map((c: any) => c.id);
      if (campaignIds.length === 0)
        return { dedup: 0, prefetch: 0, ghost: 0 };

      const periodLength = parseInt(dateRange);
      const now = new Date();
      const currentStart = subDays(now, periodLength - 1);
      const previousStart = subDays(currentStart, periodLength);
      const previousStartStr = spDateString(previousStart);
      const currentStartStr = spDateString(currentStart);

      const { data, error } = await supabase
        .from("campaign_stats" as any)
        .select("dedup_clicks, prefetch_clicks, ghost_clicks")
        .in("campaign_id", campaignIds)
        .gte("date", previousStartStr)
        .lt("date", currentStartStr);

      if (error) return { dedup: 0, prefetch: 0, ghost: 0 };
      const rows = (data || []) as any[];
      return {
        dedup: rows.reduce((acc: number, r: any) => acc + (r.dedup_clicks || 0), 0),
        prefetch: rows.reduce((acc: number, r: any) => acc + (r.prefetch_clicks || 0), 0),
        ghost: rows.reduce((acc: number, r: any) => acc + (r.ghost_clicks || 0), 0),
      };
    },
    enabled: !!effectiveUserId && dateRange !== "all",
  });

  // ─── METRICS: hybrid switch ─────────────────────────────────────────
  // isToday  → derivado dos raw logs (real-time)
  // !isToday → soma do agregado (até 1h de defasagem no dia corrente)
  //
  // [PR-3b.5] Buckets separados: approved = OFFER_PAGE only.
  // SAFE_PAGE deixa de ser somado em "approved" (era o bug do ROI).
  const metrics = useMemo(() => {
    if (isToday) {
      const analyzed = todayRaw.length;
      const approved = todayRaw.filter((l) => l.status_final === "Aprovado").length;
      const blocked = todayRaw.filter((l) => l.status_final !== "Aprovado").length;
      return { analyzed, approved, blocked };
    }
    const totalClicks    = aggStats.reduce((acc, r) => acc + (r.total_clicks     ?? 0), 0);
    const botClicks      = aggStats.reduce((acc, r) => acc + (r.bot_clicks       ?? 0), 0);
    const approvedClicks = aggStats.reduce((acc, r) => acc + (r.approved_clicks  ?? 0), 0);
    const safePageClicks = aggStats.reduce((acc, r) => acc + (r.safe_page_clicks ?? 0), 0);
    return {
      analyzed: totalClicks,
      // [PR-3b.5] "blocked" no Dashboard = bots + safe_page (tudo que NÃO viu a oferta)
      blocked: botClicks + safePageClicks,
      // [PR-3b.5] "approved" agora = APENAS offer_page (não mais total - bot)
      approved: approvedClicks,
    };
  }, [isToday, todayRaw, aggStats]);

  const totalRequests = useMemo(() => {
    const shadow = shadowStats || { dedup: 0, prefetch: 0, ghost: 0 };
    return metrics.analyzed + shadow.dedup + shadow.prefetch + shadow.ghost;
  }, [metrics, shadowStats]);

  // ─── PERÍODO ANTERIOR (trend real) ───────────────────────────────
  // Sempre vem do agregado (mais leve e cobre todos os ranges históricos).
  // "all" não tem comparativo sensato → trends escondidos.
  const previousMetrics = useMemo(() => {
    if (dateRange === "all") return { analyzed: 0, approved: 0, blocked: 0 };
    const totalClicks    = prevAggStats.reduce((acc, r) => acc + (r.total_clicks     ?? 0), 0);
    const botClicks      = prevAggStats.reduce((acc, r) => acc + (r.bot_clicks       ?? 0), 0);
    const approvedClicks = prevAggStats.reduce((acc, r) => acc + (r.approved_clicks  ?? 0), 0);
    const safePageClicks = prevAggStats.reduce((acc, r) => acc + (r.safe_page_clicks ?? 0), 0);
    return {
      analyzed: totalClicks,
      blocked: botClicks + safePageClicks, // [PR-3b.5]
      approved: approvedClicks,            // [PR-3b.5]
    };
  }, [prevAggStats, dateRange]);

  const previousTotalRequests = useMemo(() => {
    const shadow = previousShadowStats || { dedup: 0, prefetch: 0, ghost: 0 };
    return (
      previousMetrics.analyzed + shadow.dedup + shadow.prefetch + shadow.ghost
    );
  }, [previousMetrics, previousShadowStats]);

  const safePageHitsValue = useMemo(
    () =>
      (shadowStats?.ghost || 0) +
      (shadowStats?.prefetch || 0) +
      (shadowStats?.dedup || 0),
    [shadowStats]
  );

  const previousSafePageHits = useMemo(() => {
    const shadow = previousShadowStats || { dedup: 0, prefetch: 0, ghost: 0 };
    return shadow.dedup + shadow.prefetch + shadow.ghost;
  }, [previousShadowStats]);

  const trends = useMemo(() => {
    if (dateRange === "all") return undefined;
    return {
      totalRequests: {
        current: totalRequests,
        previous: previousTotalRequests,
      },
      botsBlocked: {
        current: metrics.blocked,
        previous: previousMetrics.blocked,
      },
      safePageHits: {
        current: safePageHitsValue,
        previous: previousSafePageHits,
      },
      realTraffic: {
        current: metrics.approved,
        previous: previousMetrics.approved,
      },
    };
  }, [
    dateRange,
    totalRequests,
    previousTotalRequests,
    metrics,
    previousMetrics,
    safePageHitsValue,
    previousSafePageHits,
  ]);

  // ─── CHART MODE ──────────────────────────────────────────────────
  // Hourly só faz sentido com dados raw (que só temos pra hoje).
  // Quando o usuário troca pra um período histórico, força daily.
  const [chartMode, setChartMode] = useState<ChartMode>(isToday ? "hourly" : "daily");
  useEffect(() => {
    setChartMode(isToday ? "hourly" : "daily");
  }, [isToday]);

  const isHourlyChart = chartMode === "hourly";

  const chartData = useMemo(() => {
    // ─── HOURLY ────────────────────────────────────────────────────
    if (isHourlyChart) {
      // Só temos granularidade horária pra hoje (raw). Em períodos
      // históricos, mostra as 24 barras zeradas (graceful degradation).
      // O agregado é por dia — não dá pra reconstruir hora-a-hora.
      if (!isToday) {
        return Array.from({ length: 24 }, (_, hour) => ({
          label: `${String(hour).padStart(2, "0")}:00`,
          approved: 0,
          blocked: 0,
        }));
      }
      return Array.from({ length: 24 }, (_, hour) => {
        const hourLogs = todayRaw.filter(
          (l) => getHours(new Date(l.created_at)) === hour
        );
        return {
          label: `${String(hour).padStart(2, "0")}:00`,
          approved: hourLogs.filter((l) => l.status_final === "Aprovado").length,
          blocked: hourLogs.filter((l) => l.status_final !== "Aprovado").length,
        };
      });
    }

    // ─── DAILY ─────────────────────────────────────────────────────
    // isToday: gráfico de uma barra só (hoje), montada do raw.
    if (isToday) {
      const approved = todayRaw.filter((l) => l.status_final === "Aprovado").length;
      const blocked = todayRaw.filter((l) => l.status_final !== "Aprovado").length;
      return [{ label: format(new Date(), "MMM d"), approved, blocked }];
    }

    // !isToday: agregado pode ter múltiplas linhas por dia (uma por
    // campanha). Soma por `date` antes de plotar.
    const dayMap: Record<string, { approved: number; blocked: number }> = {};
    aggStats.forEach((r) => {
      if (!dayMap[r.date]) dayMap[r.date] = { approved: 0, blocked: 0 };
      // [PR-3b.5] approved = OFFER_PAGE only; blocked = bot + safe_page
      dayMap[r.date].approved += (r.approved_clicks  ?? 0);
      dayMap[r.date].blocked  += (r.bot_clicks ?? 0) + (r.safe_page_clicks ?? 0);
    });

    // ─── ZERO-FILL ───────────────────────────────────────────────
    // Sem isso, o Recharts liga dia 19 a dia 24 (com gaps no meio)
    // por uma diagonal/barra adjacente, distorcendo a percepção de
    // "tráfego nos dias sem dados". Zero-fill garante 1 ponto por dia
    // do intervalo, mesmo que zerado.
    let startDate: Date;
    let endDate: Date;

    if (dateRange === "all") {
      // "Todo o Período" não tem range fixo — usa min/max do que veio
      // do banco. Conta nova sem cliques → array vazio (nada pra plotar).
      const sortedDays = Object.keys(dayMap).sort();
      if (sortedDays.length === 0) return [];
      startDate = new Date(sortedDays[0] + "T00:00:00");
      endDate = new Date(sortedDays[sortedDays.length - 1] + "T00:00:00");
    } else {
      // Períodos numéricos ("2", "7", "30") → mesmas bordas da query SQL,
      // garantindo que o gráfico cubra exatamente o período pedido —
      // mesmo que o primeiro dia tenha vindo zerado do banco.
      const days = parseInt(dateRange);
      endDate = new Date(spDateString() + "T00:00:00");
      startDate = new Date(
        spDateString(subDays(new Date(), days - 1)) + "T00:00:00"
      );
    }

    return eachDayOfInterval({ start: startDate, end: endDate }).map((d) => {
      // Lookup no formato do agregado (YYYY-MM-DD). format() do date-fns
      // gera a string no fuso local — consistente com o resto do componente.
      const dayKey = format(d, "yyyy-MM-dd");
      const v = dayMap[dayKey] || { approved: 0, blocked: 0 };
      return {
        label: format(d, "MMM d"),
        ...v,
      };
    });
  }, [isHourlyChart, isToday, todayRaw, aggStats, dateRange]);

  // ─── isLoading consolidado ───────────────────────────────────────
  // TanStack v5: query desabilitada tem isLoading=false. Então isso só
  // dá true quando alguma query realmente em uso está em flight.
  const isLoading = isLoadingToday || (!isToday && isLoadingAgg);

  const timeAgoText = useMemo(() => {
    const diffSec = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (diffSec < 10) return t("dashboard.justNow");
    if (diffSec < 60) return `${diffSec}s`;
    return `${Math.floor(diffSec / 60)}m`;
  }, [lastUpdated, t]);

  const handleRefresh = () => {
    refetchToday();
    if (!isToday) refetchAgg();
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
            safePageHits={safePageHitsValue}
            realTraffic={metrics.approved}
            isLoading={isLoading}
            trends={trends}
          />

          <div className="space-y-5 min-w-0">
            <TrafficFlowChart
              data={chartData}
              mode={chartMode}
              onModeChange={setChartMode}
              isLoading={isLoading}
            />
            {/* LiveStream sempre vem do raw de hoje — é "live", independente
                do filtro histórico que o usuário está olhando nas métricas. */}
            <LiveStreamList logs={todayRaw} isLoading={isLoadingToday} />
          </div>
        </div>
      </div>
    </div>
  );
}
