import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnimatedCounter } from "@/hooks/useAnimatedCounter";

/**
 * MetricsSidebar — Vertical KPI rail (left column of Asymmetrical Split)
 *
 * TYPOGRAPHY: text-4xl (36px) to text-5xl (48px) max.
 * Sofisticado e limpo, não absurdamente grande.
 * Labels: 10-11px uppercase tracking-wide, zinc-500.
 *
 * Trends: calculados via comparação período-vs-período-anterior.
 * Direção verde/vermelha independente da categoria da métrica — o VIP lê
 * direção imediatamente (↗ verde = cresceu, ↘ vermelho = caiu) sem ter
 * que decodificar esquema de cor por tipo.
 */

// ── Tipos ───────────────────────────────────────────────────────────
export interface TrendData {
  current: number;
  previous: number;
}

interface MetricsSidebarProps {
  totalRequests: number;
  botsBlocked: number;
  safePageHits: number;
  realTraffic: number;
  isLoading: boolean;
  /**
   * Dados brutos para cálculo de trend (atual vs período anterior).
   * Se ausente (ex.: filtro "Todo o Período"), os trends ficam escondidos.
   */
  trends?: {
    totalRequests?: TrendData;
    botsBlocked?: TrendData;
    safePageHits?: TrendData;
    realTraffic?: TrendData;
  };
}

interface TrendDisplay {
  label: string;
  color: string;
}

// ── Computa rótulo + cor do trend a partir dos valores brutos ──────
// Regras:
// • prev=0, curr=0 → não mostra (retorna null — evita poluição visual)
// • prev=0, curr>0 → "• NEW" (neutro, cinza — primeira aparição, sem baseline)
// • prev>0, curr=prev → não mostra (ruído)
// • prev>0, delta arredondado = 0% → não mostra (idem)
// • curr<prev → ↘ -X% (vermelho)
// • curr>prev → ↗ +X% (verde)
// • Cap em 999% pra evitar "↗ 12847%" feio com baselines minúsculos
function computeTrend(
  data: TrendData | undefined,
  newLabel: string
): TrendDisplay | null {
  if (!data) return null;
  const { current, previous } = data;

  if (previous === 0 && current === 0) return null;
  if (previous === 0 && current > 0) {
    return { label: `• ${newLabel}`, color: "text-muted-foreground/60" };
  }

  const delta = ((current - previous) / previous) * 100;
  const rounded = Math.round(delta);

  if (rounded === 0) return null;

  const capped = Math.min(Math.abs(rounded), 999);

  if (rounded > 0) {
    return { label: `↗ +${capped}%`, color: "text-emerald-400/80" };
  }
  return { label: `↘ −${capped}%`, color: "text-red-400/80" };
}

interface MetricItemProps {
  label: string;
  value: number;
  subtitle: string;
  trend?: TrendDisplay | null;
}

function MetricItem({ label, value, subtitle, trend }: MetricItemProps) {
  // Wow factor: conta de forma animada até o valor alvo (easeOutCubic, 800ms).
  // Respeita prefers-reduced-motion automaticamente.
  const animatedValue = useAnimatedCounter(value, 900);
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50">
        {label}
      </p>
      <p className="text-4xl sm:text-5xl font-bold leading-none tracking-tight tabular-nums">
        {animatedValue.toLocaleString()}
      </p>
      <p className="text-[11px] text-muted-foreground/40">
        {subtitle}
        {trend && (
          <span className={`ml-1.5 font-medium tabular-nums ${trend.color}`}>
            {trend.label}
          </span>
        )}
      </p>
    </div>
  );
}

function MetricSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-10 w-28" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

export function MetricsSidebar({
  totalRequests,
  botsBlocked,
  safePageHits,
  realTraffic,
  isLoading,
  trends,
}: MetricsSidebarProps) {
  const { t } = useTranslation();
  const newLabel = t("dashboard.trendNew");

  const trendTotal = computeTrend(trends?.totalRequests, newLabel);
  const trendBots = computeTrend(trends?.botsBlocked, newLabel);
  const trendSafe = computeTrend(trends?.safePageHits, newLabel);
  const trendReal = computeTrend(trends?.realTraffic, newLabel);

  if (isLoading) {
    return (
      <aside className="flex flex-row lg:flex-col gap-6 lg:gap-0 lg:space-y-10 overflow-x-auto lg:overflow-visible pb-3 lg:pb-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <MetricSkeleton key={i} />
        ))}
      </aside>
    );
  }

  return (
    <aside className="flex flex-row lg:flex-col gap-6 lg:gap-0 lg:space-y-10 overflow-x-auto lg:overflow-visible pb-3 lg:pb-0">
      {/* Section label (desktop only) */}
      <div className="hidden lg:block">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/30 mb-6">
          {t("dashboard.metricsLabel")}
        </p>
      </div>

      <MetricItem
        label={t("dashboard.totalRequests")}
        value={totalRequests}
        subtitle={t("dashboard.totalRequestsSub")}
        trend={trendTotal}
      />

      <MetricItem
        label={t("dashboard.botsBlocked")}
        value={botsBlocked}
        subtitle={t("dashboard.botsBlockedSub")}
        trend={trendBots}
      />

      <MetricItem
        label={t("dashboard.safePageHits")}
        value={safePageHits}
        subtitle={t("dashboard.safePageHitsSub")}
        trend={trendSafe}
      />

      <MetricItem
        label={t("dashboard.realTraffic")}
        value={realTraffic}
        subtitle={t("dashboard.realTrafficSub")}
        trend={trendReal}
      />

      {/* Shield status (desktop only) */}
      <div className="hidden lg:block pt-4 mt-2 border-t border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
          </span>
          <span className="text-xs text-muted-foreground/60 font-medium">
            {t("dashboard.shieldActive")}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground/30 mt-1 tabular-nums">
          {t("dashboard.shieldStats")}
        </p>
      </div>
    </aside>
  );
}
