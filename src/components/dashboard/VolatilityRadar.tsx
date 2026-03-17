import { Card } from "@/components/ui/card";

const networks = [
  { name: "Meta Ads", status: "Stable", helper: "Normal approval rates", volatile: false },
  { name: "TikTok Ads", status: "High Volatility", helper: "Ban wave detected. Scale cautiously.", volatile: true },
  { name: "Google Ads", status: "Stable", helper: "No anomalies", volatile: false },
];

export function VolatilityRadar() {
  return (
    <Card className="border-border bg-muted/30 px-4 py-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
        <span className="text-sm font-semibold tracking-tight whitespace-nowrap">📡 Network Status:</span>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-6 flex-1">
          {networks.map((n) => (
            <div key={n.name} className="flex items-center gap-2.5 min-w-0">
              <span className="relative flex h-2 w-2 shrink-0">
                {n.volatile && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${n.volatile ? "bg-destructive" : "bg-[hsl(var(--success))]"}`} />
              </span>
              <span className="text-xs font-medium whitespace-nowrap">{n.name}</span>
              <span className={`text-[11px] font-mono ${n.volatile ? "text-destructive" : "text-[hsl(var(--success))]"}`}>{n.status}</span>
              <span className="text-[10px] text-muted-foreground truncate hidden md:inline">{n.helper}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
