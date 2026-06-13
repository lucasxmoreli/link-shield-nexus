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
import { RoiHero } from "@/components/dashboard/RoiHero";
import {
  BarChart2,
  MousePointerClick,
  Users,
  CheckCircle,
  Percent,
  TrendingUp,
  Shield,
  ShieldAlert,
} from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { getThreatDisplay } from "@/lib/threat-display";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { subDays, format, eachDayOfInterval } from "date-fns";
import { spDateString, spStartOfDay } from "@/lib/timezone";

type DatePreset = "today" | "7days" | "30days" | "all";

const DONUT_COLORS = [
  "hsl(0, 84%, 60%)",
  "hsl(30, 100%, 50%)",
  "hsl(271, 81%, 56%)",
  "hsl(200, 80%, 50%)",
  "hsl(45, 100%, 51%)",
  "hsl(340, 82%, 52%)",
  "hsl(160, 60%, 45%)",
  "hsl(0, 0%, 50%)",
];

// ─── Tipos das tabelas agregadas ──────────────────────────────────────
// Não estão nos types gerados do Supabase ainda (rodar `supabase gen types`
// resolve), por isso o cast manual aqui evita poluir o componente com
// `as any` espalhado pelos selects.
interface DailyCampaignStatRow {
  date: string;             // [PR-3b.5] "YYYY-MM-DD" ancorado em America/Sao_Paulo (FOLLOW-UP fechado)
  total_clicks: number;
  unique_clicks: number;
  bot_clicks: number;
  approved_clicks: number;  // [PR-3b.5] action_taken='offer_page'
  safe_page_clicks: number; // [PR-3b.5] action_taken='safe_page'
  conversions: number;
  total_cost: number;
  total_revenue: number;
}

interface DailyBreakdownStatRow {
  date: string;
  dimension_type: "country" | "device" | "platform" | "motivo";
  dimension_value: string;
  total_clicks: number;
  unique_clicks: number;
  bot_clicks: number;
  approved_clicks: number;  // [PR-3b.5]
  safe_page_clicks: number; // [PR-3b.5]
  conversions: number;
  total_cost: number;
  total_revenue: number;
}

interface RawLogRow {
  status_final: string;
  motivo_limpo: string | null;
  country_code: string | null;
  device_type: string | null;
  created_at: string;
  source_platform: string | null;
  cost: number | null;
  is_unique: boolean | null;
  risk_score: number | null;
  is_conversion: boolean | null;
  revenue: number | null;
}

/**
 * Analytics V2 — Hybrid Fetching (PR-3b Fase 3.3)
 *
 * Antes: scan completo de `dashboard_analytics_view` mesmo pra "Todo o
 *        Período". Travava em campanhas grandes (10k+ cliques) e era
 *        impagável em escala (100k+).
 *
 * Agora — espelhando a estratégia do Dashboard:
 *   • datePreset === "today"  → raw (dashboard_analytics_view) só do dia.
 *                                Volume baixo, real-time, granularidade total.
 *   • datePreset !== "today"  → agregados:
 *       - daily_campaign_stats     → cards + gráfico daily
 *       - daily_breakdown_stats    → tabelas (platform/country/device) + donut motivo
 *
 * Trade-offs documentados:
 *   1. `risk_score` não está no agregado → avgScore = "—" fora do "Hoje".
 *   2. Os agregados só guardam `bot_clicks` (action_taken='bot_blocked').
 *      "Aprovado" e "Página Segura" do raw ficam lumped em (total - bot_clicks)
 *      no histórico. Para breakdown estrito por status_final → "Hoje".
 *   3. Dia corrente em filtros 7d/30d pode ficar até 1h defasado (refresh
 *      do cron horário). Aceitável; quem quer real-time fica em "Hoje".
 *
 * Timezone: bordas de range (start/end) sempre via spDateString() pra
 * blindar contra browsers em fuso diferente de SP (Lisboa, NY, Tóquio
 * veriam "ontem" sem isso).
 */
export default function Analytics() {
  const { t } = useTranslation();
  const { effectiveUserId } = useAuth();
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");

  const isToday = datePreset === "today";

  // ─── Bordas de range em SP (YYYY-MM-DD) ────────────────────────────
  // start/end batem 1:1 com a coluna `date` dos agregados (que estão em
  // SP). Para "all", retornamos isAll=true e omitimos o filtro temporal.
  const dateRange = useMemo<{ start: string | null; end: string | null; isAll: boolean }>(() => {
    const today = spDateString();
    if (datePreset === "today") return { start: today, end: today, isAll: false };
    if (datePreset === "7days") return { start: spDateString(subDays(new Date(), 6)), end: today, isAll: false };
    if (datePreset === "30days") return { start: spDateString(subDays(new Date(), 29)), end: today, isAll: false };
    return { start: null, end: null, isAll: true };
  }, [datePreset]);

  // ─── Lista de campanhas (filtro obrigatório) ────────────────────────
  const { data: campaigns } = useQuery({
    queryKey: ["campaigns-list", effectiveUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name, hash")
        .eq("user_id", effectiveUserId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveUserId,
  });

  // ─── QUERY 1 (RAW): ativa só em "Hoje" ──────────────────────────────
  // Uma campanha de um dia, mesmo grande, são poucas centenas de KB.
  // Seguro pro client e dá granularidade total (avgScore, "Página Segura"
  // separado de "Bloqueado" etc).
  const { data: rawLogs = [], isLoading: loadingRaw } = useQuery({
    queryKey: ["analytics-raw", selectedCampaign],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dashboard_analytics_view" as any)
        .select(
          "status_final, motivo_limpo, country_code, device_type, created_at, source_platform, cost, is_unique, risk_score, is_conversion, revenue"
        )
        .eq("campaign_id", selectedCampaign)
        .gte("created_at", spStartOfDay().toISOString())
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as RawLogRow[];
    },
    enabled: !!selectedCampaign && isToday,
  });

  // ─── QUERY 2 (AGG CAMPANHA): para cards + gráfico daily ─────────────
  const { data: aggCampaign = [], isLoading: loadingAggCampaign } = useQuery({
    queryKey: ["analytics-agg-campaign", selectedCampaign, datePreset],
    queryFn: async () => {
      let q = supabase
        .from("daily_campaign_stats" as any)
        // [PR-3b.5] +approved_clicks, +safe_page_clicks (deslump)
        .select("date, total_clicks, unique_clicks, bot_clicks, approved_clicks, safe_page_clicks, conversions, total_cost, total_revenue")
        .eq("campaign_id", selectedCampaign)
        .order("date", { ascending: true });
      if (!dateRange.isAll && dateRange.start && dateRange.end) {
        q = q.gte("date", dateRange.start).lte("date", dateRange.end);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as DailyCampaignStatRow[];
    },
    enabled: !!selectedCampaign && !isToday,
  });

  // ─── QUERY 3 (AGG BREAKDOWNS): tabelas + donut motivo ───────────────
  // Um SELECT só, multidimensional. Filtramos por dimension_type no
  // useMemo de cada breakdown — barato porque o volume é
  // O(dias × campanhas × cardinalidade), tipicamente algumas centenas.
  const { data: aggBreakdowns = [], isLoading: loadingAggBreakdowns } = useQuery({
    queryKey: ["analytics-agg-breakdowns", selectedCampaign, datePreset],
    queryFn: async () => {
      let q = supabase
        .from("daily_breakdown_stats" as any)
        .select(
          // [PR-3b.5] +approved_clicks, +safe_page_clicks por dimensão
          "date, dimension_type, dimension_value, total_clicks, unique_clicks, bot_clicks, approved_clicks, safe_page_clicks, conversions, total_cost, total_revenue"
        )
        .eq("campaign_id", selectedCampaign);
      if (!dateRange.isAll && dateRange.start && dateRange.end) {
        q = q.gte("date", dateRange.start).lte("date", dateRange.end);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as DailyBreakdownStatRow[];
    },
    enabled: !!selectedCampaign && !isToday,
  });

  // ─── isLoading consolidado ──────────────────────────────────────────
  // TanStack v5: query desabilitada tem isLoading=false. Então isso só
  // dá true quando alguma query realmente em uso está em flight.
  const isLoading = isToday ? loadingRaw : (loadingAggCampaign || loadingAggBreakdowns);

  // ─── METRICS (hybrid switch) ────────────────────────────────────────
  const metrics = useMemo(() => {
    if (isToday) {
      if (rawLogs.length === 0) return null;
      const total = rawLogs.length;
      const unique = rawLogs.filter((l) => l.is_unique).length;
      const approved = rawLogs.filter((l) => l.status_final === "Aprovado").length;
      const blocked = rawLogs.filter((l) => l.status_final === "Bloqueado").length;
      const safePage = rawLogs.filter((l) => l.status_final === "Página Segura").length;
      const approvalRate = total > 0 ? ((approved / total) * 100).toFixed(1) : "0";
      const totalCost = rawLogs.reduce((acc, l) => acc + (Number(l.cost) || 0), 0);
      const cpl = approved > 0 ? totalCost / approved : 0;
      const approvedScores = rawLogs
        .filter((l) => l.status_final === "Aprovado" && l.risk_score != null)
        .map((l) => l.risk_score as number);
      const avgScore =
        approvedScores.length > 0
          ? Math.round(approvedScores.reduce((a, b) => a + b, 0) / approvedScores.length)
          : null;
      const totalRevenue = rawLogs
        .filter((l) => l.is_conversion)
        .reduce((acc, l) => acc + (Number(l.revenue) || 0), 0);
      const conversions = rawLogs.filter((l) => l.is_conversion).length;
      return { total, unique, approved, blocked, safePage, approvalRate, totalCost, cpl, avgScore, totalRevenue, conversions };
    }

    // ─── Branch agregado ─────────────────────────────────────────────
    // IMPORTANTE: somar `total_cost`/`total_revenue` daqui (campanha) e
    // NÃO do `aggBreakdowns` (que multiplicaria pela cardinalidade das
    // dimensões — mesma row aparece replicada em platform, country, etc).
    if (aggCampaign.length === 0) return null;
    // [PR-3b.5] Buckets vêm separados do agregado — fim do "lump conhecido".
    const total       = aggCampaign.reduce((acc, r) => acc + (r.total_clicks    ?? 0), 0);
    const unique      = aggCampaign.reduce((acc, r) => acc + (r.unique_clicks   ?? 0), 0);
    const botClicks   = aggCampaign.reduce((acc, r) => acc + (r.bot_clicks      ?? 0), 0);
    const approved    = aggCampaign.reduce((acc, r) => acc + (r.approved_clicks  ?? 0), 0);
    const safePage    = aggCampaign.reduce((acc, r) => acc + (r.safe_page_clicks ?? 0), 0);
    const blocked     = botClicks; // bots only — safe_page é seu próprio bucket agora
    const approvalRate = total > 0 ? ((approved / total) * 100).toFixed(1) : "0";
    // [PR-3b.5] Number(x) || 0 mantido aqui: Number() nunca retorna null/undefined
    // (NaN-coerce-as-falsy → 0), então `?? 0` seria dead code (ESLint catch).
    // Equivalente semanticamente ao padrão `?? 0` usado no resto do componente.
    const totalCost    = aggCampaign.reduce((acc, r) => acc + (Number(r.total_cost)    || 0), 0);
    const cpl          = approved > 0 ? totalCost / approved : 0;
    const totalRevenue = aggCampaign.reduce((acc, r) => acc + (Number(r.total_revenue) || 0), 0);
    const conversions  = aggCampaign.reduce((acc, r) => acc + (r.conversions ?? 0), 0);
    return {
      total,
      unique,
      approved,
      blocked,
      safePage,
      approvalRate,
      totalCost,
      cpl,
      avgScore: null, // risk_score não está no agregado → graceful "—"
      totalRevenue,
      conversions,
    };
  }, [isToday, rawLogs, aggCampaign]);

  // ─── CHART DATA (daily) com zero-fill ───────────────────────────────
  // Sem zero-fill o Recharts liga dia 19 a dia 24 com diagonal e o usuário
  // interpreta isso como tráfego — aqui forçamos 1 ponto por dia do range.
  const chartData = useMemo(() => {
    const dayMap: Record<string, { approved: number; rejected: number; conversions: number }> = {};

    if (isToday) {
      // 1 ponto só (hoje em SP). Iteramos os logs pra contagem correta —
      // `eachDayOfInterval` abaixo vai cobrir esse único dia.
      rawLogs.forEach((l) => {
        const day = spDateString(new Date(l.created_at));
        if (!dayMap[day]) dayMap[day] = { approved: 0, rejected: 0, conversions: 0 };
        if (l.status_final === "Aprovado") dayMap[day].approved++;
        else dayMap[day].rejected++;
        if (l.is_conversion) dayMap[day].conversions++;
      });
    } else {
      aggCampaign.forEach((r) => {
        if (!dayMap[r.date]) dayMap[r.date] = { approved: 0, rejected: 0, conversions: 0 };
        // [PR-3b.5] approved = OFFER_PAGE only; rejected = bot + safe_page
        dayMap[r.date].approved    += (r.approved_clicks  ?? 0);
        dayMap[r.date].rejected    += (r.bot_clicks ?? 0) + (r.safe_page_clicks ?? 0);
        dayMap[r.date].conversions += (r.conversions ?? 0);
      });
    }

    // ─── ZERO-FILL ───────────────────────────────────────────────────
    let startDate: Date;
    let endDate: Date;

    if (dateRange.isAll) {
      // "Todo o Período" não tem range fixo — usa min/max do que veio.
      // Conta nova sem cliques → array vazio, gráfico vai pro empty-state.
      const sortedDays = Object.keys(dayMap).sort();
      if (sortedDays.length === 0) return [];
      startDate = new Date(sortedDays[0] + "T00:00:00");
      endDate = new Date(sortedDays[sortedDays.length - 1] + "T00:00:00");
    } else if (isToday) {
      // 1 dia só — hoje em SP. Mesmo que rawLogs esteja vazio, devolvemos
      // 1 ponto zerado pra UX consistente (e cair no chart "insufficient
      // data" abaixo, que precisa length === 1).
      const today = spDateString();
      startDate = new Date(today + "T00:00:00");
      endDate = startDate;
    } else {
      // 7d/30d → bordas EXATAS da query SQL, garantindo que o gráfico
      // cubra o período pedido mesmo com buracos no agregado.
      startDate = new Date(dateRange.start! + "T00:00:00");
      endDate = new Date(dateRange.end! + "T00:00:00");
    }

    return eachDayOfInterval({ start: startDate, end: endDate }).map((d) => {
      const dayKey = format(d, "yyyy-MM-dd");
      const v = dayMap[dayKey] || { approved: 0, rejected: 0, conversions: 0 };
      return { day: format(d, "MM/dd"), ...v };
    });
  }, [isToday, rawLogs, aggCampaign, dateRange]);

  // ─── Helper: colapsa rows do agg em map { dimension_value → totais } ──
  // Centraliza o pattern usado em platform/country/device pra evitar
  // 3 cópias do mesmo loop.
  // [PR-3b.5] approved/safePage agora vêm separados do agregado.
  const aggregateDimension = (dim: DailyBreakdownStatRow["dimension_type"]) => {
    const map: Record<string, { clicks: number; unique: number; bot: number; approved: number; safePage: number; cost: number }> = {};
    aggBreakdowns
      .filter((r) => r.dimension_type === dim)
      .forEach((r) => {
        const key = r.dimension_value || "unknown";
        if (!map[key]) map[key] = { clicks: 0, unique: 0, bot: 0, approved: 0, safePage: 0, cost: 0 };
        map[key].clicks   += r.total_clicks     ?? 0;
        map[key].unique   += r.unique_clicks    ?? 0;
        map[key].bot      += r.bot_clicks       ?? 0;
        map[key].approved += r.approved_clicks  ?? 0;
        map[key].safePage += r.safe_page_clicks ?? 0;
        map[key].cost     += Number(r.total_cost) || 0; // Number() never null → || 0 (ESLint)
      });
    return map;
  };

  // ─── PLATFORM BREAKDOWN ─────────────────────────────────────────────
  const platformBreakdown = useMemo(() => {
    if (isToday) {
      if (!rawLogs.length) return [];
      const map: Record<string, { clicks: number; approved: number; blocked: number; cost: number }> = {};
      rawLogs.forEach((l) => {
        const p = l.source_platform || "Unknown";
        if (!map[p]) map[p] = { clicks: 0, approved: 0, blocked: 0, cost: 0 };
        map[p].clicks++;
        if (l.status_final === "Aprovado") map[p].approved++;
        else map[p].blocked++; // Bloqueado + Página Segura
        map[p].cost += Number(l.cost) || 0;
      });
      return Object.entries(map).map(([platform, v]) => ({
        platform,
        ...v,
        cpc: v.clicks > 0 ? v.cost / v.clicks : 0,
      }));
    }
    const m = aggregateDimension("platform");
    return Object.entries(m).map(([platform, v]) => ({
      platform: platform === "unknown" ? "Unknown" : platform,
      clicks: v.clicks,
      approved: v.approved,         // [PR-3b.5] OFFER_PAGE only
      blocked: v.bot + v.safePage,  // [PR-3b.5] bot + safe_page
      cost: v.cost,
      cpc: v.clicks > 0 ? v.cost / v.clicks : 0,
    }));
  }, [isToday, rawLogs, aggBreakdowns]);

  // ─── COUNTRY BREAKDOWN (top 10) ─────────────────────────────────────
  const countryBreakdown = useMemo(() => {
    if (isToday) {
      if (!rawLogs.length) return [];
      const map: Record<string, { clicks: number; approved: number; blocked: number }> = {};
      rawLogs.forEach((l) => {
        const c = l.country_code || "??";
        if (!map[c]) map[c] = { clicks: 0, approved: 0, blocked: 0 };
        map[c].clicks++;
        if (l.status_final === "Aprovado") map[c].approved++;
        else map[c].blocked++;
      });
      return Object.entries(map)
        .map(([country, v]) => ({
          country,
          ...v,
          rate: v.clicks > 0 ? ((v.approved / v.clicks) * 100).toFixed(1) : "0",
        }))
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 10);
    }
    const m = aggregateDimension("country");
    return Object.entries(m)
      .map(([country, v]) => {
        // [PR-3b.5] approved real (OFFER_PAGE), blocked = bot + safe_page
        const approved = v.approved;
        const blocked  = v.bot + v.safePage;
        return {
          country: country === "unknown" ? "??" : country,
          clicks: v.clicks,
          approved,
          blocked,
          rate: v.clicks > 0 ? ((approved / v.clicks) * 100).toFixed(1) : "0",
        };
      })
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10);
  }, [isToday, rawLogs, aggBreakdowns]);

  // ─── DEVICE BREAKDOWN ───────────────────────────────────────────────
  const deviceBreakdown = useMemo(() => {
    if (isToday) {
      if (!rawLogs.length) return [];
      const map: Record<string, { clicks: number; approved: number; blocked: number }> = {};
      rawLogs.forEach((l) => {
        const d = l.device_type || "Unknown";
        if (!map[d]) map[d] = { clicks: 0, approved: 0, blocked: 0 };
        map[d].clicks++;
        if (l.status_final === "Aprovado") map[d].approved++;
        else map[d].blocked++;
      });
      return Object.entries(map).map(([device, v]) => ({ device, ...v }));
    }
    const m = aggregateDimension("device");
    return Object.entries(m).map(([device, v]) => ({
      device: device === "unknown" ? "Unknown" : device,
      clicks: v.clicks,
      approved: v.approved,         // [PR-3b.5] OFFER_PAGE only
      blocked: v.bot + v.safePage,  // [PR-3b.5] bot + safe_page
    }));
  }, [isToday, rawLogs, aggBreakdowns]);

  // ─── DONUT (Anatomia das Ameaças) ───────────────────────────────────
  // Raw: filtra blocked + safePage e agrupa por motivo_limpo via getThreatDisplay.
  // Agg: lê dimension_type='motivo' ignorando 'unknown' (placeholder de NULL,
  //      vem da migration via COALESCE — não queremos mostrá-lo na UI).
  const donutData = useMemo(() => {
    const grouped: Record<string, number> = {};

    if (isToday) {
      if (!rawLogs.length) return [];
      const blockedLogs = rawLogs.filter(
        (l) => l.status_final === "Bloqueado" || l.status_final === "Página Segura"
      );
      if (blockedLogs.length === 0) return [];
      blockedLogs.forEach((l) => {
        const motivo = l.motivo_limpo || "Desconhecido";
        const key = getThreatDisplay(motivo).label;
        grouped[key] = (grouped[key] || 0) + 1;
      });
    } else {
      aggBreakdowns
        .filter((r) => r.dimension_type === "motivo" && r.dimension_value !== "unknown")
        .forEach((r) => {
          const key = getThreatDisplay(r.dimension_value).label;
          grouped[key] = (grouped[key] || 0) + (r.total_clicks || 0);
        });
    }

    const sorted = Object.entries(grouped)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    if (sorted.length <= 5) return sorted;
    const top4 = sorted.slice(0, 4);
    const othersValue = sorted.slice(4).reduce((acc, d) => acc + d.value, 0);
    if (othersValue > 0) top4.push({ name: t("common.other", "Outros"), value: othersValue });
    return top4;
  }, [isToday, rawLogs, aggBreakdowns, t]);

  const reasonsTotal = donutData.reduce((acc, d) => acc + d.value, 0);

  const chartConfig = {
    approved: { label: t("analytics.approved"), color: "hsl(142 71% 45%)" },
    rejected: { label: t("dashboard.threatsBlocked"), color: "hsl(var(--destructive))" },
    conversions: { label: t("analytics.conversions"), color: "hsl(45 100% 51%)" },
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
              {campaigns?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c.hash})
                </SelectItem>
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

      {/* Empty state: nenhuma campanha selecionada */}
      {!selectedCampaign && (
        <Card className="flex flex-col items-center justify-center py-16">
          <BarChart2 className="h-16 w-16 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground text-lg font-medium">{t("analytics.emptySelect")}</p>
        </Card>
      )}

      {/* Loading skeleton (cobre raw OU agg, conforme datePreset) */}
      {selectedCampaign && isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty state: campanha selecionada mas sem dados no período */}
      {selectedCampaign && !isLoading && metrics === null && (
        <Card className="flex flex-col items-center justify-center py-16">
          <MousePointerClick className="h-16 w-16 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground text-lg font-medium">{t("analytics.emptyData")}</p>
          <p className="text-muted-foreground text-sm mt-1 max-w-md text-center">
            {t("analytics.emptyDataHint")}
          </p>
        </Card>
      )}

      {/* Conteúdo principal */}
      {selectedCampaign && metrics && (
        <>
          {/* ROI Hero — inteligência financeira por campanha */}
          <RoiHero
            blocked={metrics.blocked + metrics.safePage}
            approved={metrics.approved}
            totalCost={metrics.totalCost}
            totalRevenue={metrics.totalRevenue}
          />

          {/* Cards de tráfego */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard
              title={t("analytics.totalClicks")}
              value={metrics.total.toLocaleString()}
              icon={MousePointerClick}
              variant="default"
            />
            <StatCard
              title={t("analytics.uniqueClicks")}
              value={metrics.unique.toLocaleString()}
              icon={Users}
              variant="primary"
            />
            <StatCard
              title={t("analytics.realTraffic")}
              value={metrics.approved.toLocaleString()}
              icon={CheckCircle}
              variant="success"
            />
            <StatCard
              title={t("analytics.approvalRate")}
              value={`${metrics.approvalRate}%`}
              icon={Percent}
              variant="default"
            />
            <StatCard
              title={t("analytics.cpl")}
              value={metrics.cpl > 0 ? `$${metrics.cpl.toFixed(2)}` : "—"}
              icon={TrendingUp}
              variant="primary"
            />
            <StatCard
              title={t("analytics.avgScore")}
              value={metrics.avgScore != null ? metrics.avgScore : "—"}
              icon={Shield}
              variant={
                metrics.avgScore != null && metrics.avgScore > 65
                  ? "destructive"
                  : metrics.avgScore != null && metrics.avgScore > 25
                  ? "default"
                  : "success"
              }
            />
          </div>

          {/* Chart diário */}
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
                    <ChartTooltip content={<ChartTooltipContent />} wrapperStyle={{ outline: "none" }} />
                    <Area
                      type="monotone"
                      dataKey="approved"
                      stroke="hsl(142 71% 45%)"
                      fill="hsl(142 71% 45%)"
                      fillOpacity={0.3}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                    <Area
                      type="monotone"
                      dataKey="rejected"
                      stroke="hsl(var(--destructive))"
                      fill="hsl(var(--destructive))"
                      fillOpacity={0.2}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                    <Area
                      type="monotone"
                      dataKey="conversions"
                      stroke="hsl(45 100% 51%)"
                      fill="hsl(45 100% 51%)"
                      fillOpacity={0.15}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>
          ) : chartData.length === 1 ? (
            <Card className="flex flex-col items-center justify-center py-12">
              <BarChart2 className="h-12 w-12 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground text-sm text-center max-w-md">
                📈 {t("analytics.insufficientChartData")}
              </p>
            </Card>
          ) : null}

          {/* Donut (motivos) + Platform breakdown */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-destructive" />
                  {t("analytics.threatAnatomy")}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center">
                {isLoading ? (
                  <Skeleton className="h-[200px] w-[200px] rounded-full" />
                ) : donutData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <ShieldAlert className="h-8 w-8 text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">{t("analytics.noBlockData")}</p>
                  </div>
                ) : (
                  <>
                    <div className="h-[200px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={donutData}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={80}
                            paddingAngle={3}
                            dataKey="value"
                            strokeWidth={0}
                          >
                            {donutData.map((_, idx) => (
                              <Cell key={idx} fill={DONUT_COLORS[idx % DONUT_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#18181b",
                              borderColor: "#27272a",
                              color: "#f4f4f5",
                              borderRadius: "8px",
                            }}
                            itemStyle={{ color: "#f4f4f5" }}
                            formatter={(value: number) => {
                              const pct =
                                reasonsTotal > 0 ? ((value / reasonsTotal) * 100).toFixed(1) : "0";
                              return [`${value} (${pct}%)`, ""];
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-full space-y-1.5 mt-2">
                      {donutData.map((d, idx) => {
                        const pct =
                          reasonsTotal > 0 ? ((d.value / reasonsTotal) * 100).toFixed(1) : "0";
                        return (
                          <div key={d.name} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: DONUT_COLORS[idx % DONUT_COLORS.length] }}
                              />
                              <span className="text-muted-foreground truncate">{d.name}</span>
                            </div>
                            <span className="font-mono text-foreground shrink-0 ml-2">
                              {d.value} ({pct}%)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {platformBreakdown.length > 0 && (
              <Card className="xl:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">{t("analytics.platformBreakdown")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("analytics.platform")}</TableHead>
                        <TableHead className="text-right">{t("analytics.clicks")}</TableHead>
                        <TableHead className="text-right text-[hsl(142,71%,45%)]">
                          {t("analytics.approved")}
                        </TableHead>
                        <TableHead className="text-right text-destructive">
                          {t("analytics.blocked")}
                        </TableHead>
                        <TableHead className="text-right">{t("analytics.cost")}</TableHead>
                        <TableHead className="text-right">{t("analytics.avgCpc")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {platformBreakdown.map((r) => (
                        <TableRow key={r.platform}>
                          <TableCell className="font-medium">{r.platform}</TableCell>
                          <TableCell className="text-right">{r.clicks}</TableCell>
                          <TableCell className="text-right text-[hsl(142,71%,45%)]">
                            {r.approved}
                          </TableCell>
                          <TableCell className="text-right text-destructive">{r.blocked}</TableCell>
                          <TableCell className="text-right">${r.cost.toFixed(2)}</TableCell>
                          <TableCell className="text-right">${r.cpc.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Country + Device */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {countryBreakdown.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("analytics.countryBreakdown")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("analytics.country")}</TableHead>
                        <TableHead className="text-right">{t("analytics.clicks")}</TableHead>
                        <TableHead className="text-right text-[hsl(142,71%,45%)]">
                          {t("analytics.approved")}
                        </TableHead>
                        <TableHead className="text-right text-destructive">
                          {t("analytics.blocked")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {countryBreakdown.map((r) => (
                        <TableRow key={r.country}>
                          <TableCell className="font-medium">{r.country}</TableCell>
                          <TableCell className="text-right">{r.clicks}</TableCell>
                          <TableCell className="text-right text-[hsl(142,71%,45%)]">
                            {r.approved}
                          </TableCell>
                          <TableCell className="text-right text-destructive">{r.blocked}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {deviceBreakdown.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("analytics.deviceBreakdown")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("analytics.device")}</TableHead>
                        <TableHead className="text-right">{t("analytics.clicks")}</TableHead>
                        <TableHead className="text-right text-[hsl(142,71%,45%)]">
                          {t("analytics.approved")}
                        </TableHead>
                        <TableHead className="text-right text-destructive">
                          {t("analytics.blocked")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deviceBreakdown.map((r) => (
                        <TableRow key={r.device}>
                          <TableCell className="font-medium capitalize">{r.device}</TableCell>
                          <TableCell className="text-right">{r.clicks}</TableCell>
                          <TableCell className="text-right text-[hsl(142,71%,45%)]">
                            {r.approved}
                          </TableCell>
                          <TableCell className="text-right text-destructive">{r.blocked}</TableCell>
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
