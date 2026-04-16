import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * MetricsSidebar — Vertical KPI rail (left column of Asymmetrical Split)
 *
 * TYPOGRAPHY: text-4xl (36px) to text-5xl (48px) max.
 * Sofisticado e limpo, não absurdamente grande.
 * Labels: 10-11px uppercase tracking-wide, zinc-500.
 */

interface MetricsSidebarProps {
  totalRequests: number;
  botsBlocked: number;
  safePageHits: number;
  realTraffic: number;
  isLoading: boolean;
}

interface MetricItemProps {
  label: string;
  value: number;
  subtitle: string;
  trend?: string;
  trendColor?: string;
}

function MetricItem({
  label,
  value,
  subtitle,
  trend,
  trendColor = "text-muted-foreground",
}: MetricItemProps) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50">
        {label}
      </p>
      <p className="text-4xl sm:text-5xl font-bold leading-none tracking-tight tabular-nums">
        {value.toLocaleString()}
      </p>
      <p className="text-[11px] text-muted-foreground/40">
        {subtitle}
        {trend && (
          <span className={`ml-1.5 font-medium ${trendColor}`}>{trend}</span>
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
}: MetricsSidebarProps) {
  const { t } = useTranslation();

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
      />

      <MetricItem
        label={t("dashboard.botsBlocked")}
        value={botsBlocked}
        subtitle={t("dashboard.botsBlockedSub")}
        trend="↗ 18%"
        trendColor="text-red-400/80"
      />

      <MetricItem
        label={t("dashboard.safePageHits")}
        value={safePageHits}
        subtitle={t("dashboard.safePageHitsSub")}
        trend="↗ 12%"
        trendColor="text-amber-400/80"
      />

      <MetricItem
        label={t("dashboard.realTraffic")}
        value={realTraffic}
        subtitle={t("dashboard.realTrafficSub")}
        trend="↗ 6%"
        trendColor="text-emerald-400/80"
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