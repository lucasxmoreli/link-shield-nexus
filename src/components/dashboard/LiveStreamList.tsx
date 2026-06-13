import { useMemo } from "react";
import { Monitor, Smartphone, Radio } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useTranslation } from "react-i18next";
import { formatDistanceToNowStrict } from "date-fns";

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

interface LiveStreamListProps {
  logs: LogRow[];
  isLoading: boolean;
}

function countryFlag(code: string | null): string {
  if (!code || code.length !== 2) return "🌐";
  const codePoints = code
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

const COUNTRY_NAMES: Record<string, string> = {
  BR: "Brazil", US: "United States", SG: "Singapore", VN: "Vietnam",
  FI: "Finland", DE: "Germany", GB: "United Kingdom", CA: "Canada",
  FR: "France", JP: "Japan", AU: "Australia", AR: "Argentina",
  CO: "Colombia", MX: "Mexico", SA: "Saudi Arabia", BD: "Bangladesh",
  EG: "Egypt", EC: "Ecuador", BE: "Belgium", NL: "Netherlands",
  PT: "Portugal", ES: "Spain", IT: "Italy", IN: "India",
};

function countryName(code: string | null): string {
  if (!code) return "Unknown";
  return COUNTRY_NAMES[code.toUpperCase()] || code.toUpperCase();
}

export function LiveStreamList({ logs, isLoading }: LiveStreamListProps) {
  const { t } = useTranslation();
  const recentLogs = useMemo(() => logs.slice(0, 8), [logs]);

  if (isLoading) {
    return (
      <div className="rounded-xl bg-[#111111] p-5 sm:p-6">
        <Skeleton className="h-4 w-28 mb-4" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full mb-2" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#111111] p-5 sm:p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-sm font-semibold tracking-tight">
          {t("dashboard.liveStream")}
        </h3>
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
        </span>
      </div>

      {recentLogs.length === 0 ? (
        // [PR-3d.2] Subtle variant: já estamos dentro de um card, EmptyState
        // só centraliza ícone + copy sem adicionar borda extra.
        <EmptyState
          icon={Radio}
          title={t("dashboard.liveStreamEmptyTitle")}
          description={t("dashboard.liveStreamEmptyDesc")}
          variant="subtle"
        />
      ) : (
        <div className="space-y-0">
          {recentLogs.map((log, idx) => {
            const isClean = log.status_final === "Aprovado";
            const timeAgo = formatDistanceToNowStrict(
              new Date(log.created_at),
              { addSuffix: false }
            );
            const DeviceIcon =
              log.device_type === "desktop" ? Monitor : Smartphone;

            return (
              <div
                key={`${log.created_at}-${idx}`}
                className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[11px] text-muted-foreground/35 tabular-nums w-14 shrink-0">
                    {timeAgo}
                  </span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm" aria-hidden>
                      {countryFlag(log.country_code)}
                    </span>
                    <span className="text-xs text-muted-foreground/60 truncate">
                      {countryName(log.country_code)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <DeviceIcon size={12} className="text-muted-foreground/25" />
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      isClean
                        ? "text-emerald-400 bg-emerald-400/10"
                        : "text-red-400 bg-red-400/10"
                    }`}
                  >
                    {isClean
                      ? t("dashboard.statusClean")
                      : t("dashboard.statusBlocked")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {recentLogs.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-white/[0.04]">
          <a
            href="/requests"
            className="text-xs text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            {t("dashboard.viewFullLog")} →
          </a>
        </div>
      )}
    </div>
  );
}