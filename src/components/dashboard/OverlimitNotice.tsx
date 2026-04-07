import { AlertTriangle } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { calculateOverageCost } from "@/lib/plan-config";

export function OverlimitNotice() {
  const { profile, planConfig } = useProfile();

  const currentClicks = profile?.current_clicks ?? 0;
  const maxClicks = profile?.max_clicks ?? 0;

  if (!maxClicks || maxClicks <= 0) return null;
  if (currentClicks < maxClicks) return null;

  const { extraClicks, cost } = calculateOverageCost(currentClicks, maxClicks, planConfig);

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.04] px-4 py-3 flex items-start gap-3">
      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-500">
          Limite de Tráfego Atingido
        </p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Suas campanhas continuam ativas. Os cliques excedentes estão sendo processados
          em modo de contingência e cobrados de forma avulsa conforme o seu plano.
        </p>
        {extraClicks > 0 && (
          <div className="mt-2 flex items-center gap-3 text-[11px] font-mono">
            <span className="text-muted-foreground">
              <span className="text-white/80">+{extraClicks.toLocaleString()}</span> cliques excedentes
            </span>
            <span className="text-white/30">·</span>
            <span className="text-muted-foreground">
              Custo estimado: <span className="text-amber-500">${cost.toFixed(2)}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
