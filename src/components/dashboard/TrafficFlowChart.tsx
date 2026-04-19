import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface ChartDataPoint {
  label: string;
  approved: number;
  blocked: number;
}

export type ChartMode = "hourly" | "daily";

interface TrafficFlowChartProps {
  data: ChartDataPoint[];
  /**
   * Modo ativo (hourly agrega por hora, daily agrega por dia).
   * Quem passa este prop normalmente deriva o default do dateRange
   * (ex.: "Hoje" → hourly), mas o usuário pode alternar via botões.
   */
  mode: ChartMode;
  onModeChange: (mode: ChartMode) => void;
  isLoading: boolean;
}

export function TrafficFlowChart({
  data,
  mode,
  onModeChange,
  isLoading,
}: TrafficFlowChartProps) {
  const { t } = useTranslation();
  const hasData = data.some((d) => d.approved > 0 || d.blocked > 0);
  const isHourly = mode === "hourly";

  if (isLoading) {
    return (
      <div className="rounded-xl bg-[#111111] p-5 sm:p-6">
        <Skeleton className="h-4 w-28 mb-5" />
        <Skeleton className="h-[300px] w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#111111] p-5 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold tracking-tight">
          {t("dashboard.trafficFlow")}
        </h3>
        <div
          role="tablist"
          aria-label={t("dashboard.trafficFlow")}
          className="flex items-center bg-[#1a1a1a] rounded-md p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={isHourly}
            onClick={() => onModeChange("hourly")}
            className={`px-2.5 py-1 text-[10px] font-medium rounded transition-colors ${
              isHourly
                ? "bg-[#222222] text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("dashboard.hourly")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isHourly}
            onClick={() => onModeChange("daily")}
            className={`px-2.5 py-1 text-[10px] font-medium rounded transition-colors ${
              !isHourly
                ? "bg-[#222222] text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("dashboard.daily")}
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[300px]">
        {!hasData ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-1.5">
              <p className="text-sm text-muted-foreground/50">
                {t("dashboard.noTrafficYet")}
              </p>
              <p className="text-xs text-muted-foreground/30">
                {t("dashboard.shieldWatching")}
              </p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="gradReal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#004BFF" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#004BFF" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradBlocked" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EF4444" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
              </defs>

              <XAxis
                dataKey="label"
                stroke="rgba(255,255,255,0.08)"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                interval={isHourly ? 3 : "preserveStartEnd"}
                tick={{ fill: "rgba(255,255,255,0.25)" }}
              />
              <YAxis
                stroke="rgba(255,255,255,0.08)"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "rgba(255,255,255,0.15)" }}
                width={28}
              />

              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  borderColor: "rgba(255,255,255,0.08)",
                  color: "#fafafa",
                  borderRadius: "8px",
                  fontSize: "11px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                }}
                itemStyle={{ color: "#fafafa" }}
                cursor={{ stroke: "rgba(255,255,255,0.06)", strokeWidth: 1 }}
              />

              <Legend
                iconType="circle"
                iconSize={5}
                wrapperStyle={{
                  fontSize: 10,
                  paddingTop: 12,
                  color: "rgba(255,255,255,0.35)",
                }}
              />

              <Area
                type="monotone"
                dataKey="approved"
                stroke="#004BFF"
                strokeWidth={2}
                fill="url(#gradReal)"
                name={t("dashboard.realLabel")}
                dot={false}
                activeDot={{ r: 3, fill: "#004BFF", strokeWidth: 0 }}
              />

              <Area
                type="monotone"
                dataKey="blocked"
                stroke="#EF4444"
                strokeWidth={1.5}
                fill="url(#gradBlocked)"
                name={t("dashboard.blockedLabel")}
                dot={false}
                activeDot={{ r: 3, fill: "#EF4444", strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}