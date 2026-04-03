import { Card } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";

/**
 * Radar de Ameaças — barra horizontal com LED pulsante.
 * Substitui o antigo "Status da Rede (Meta/TikTok/Google)".
 * Estático por agora, depois plugamos lógica do backend.
 */
export function VolatilityRadar() {
  return (
    <Card className="border-border bg-muted/30 px-4 py-3">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
        <span className="text-sm font-semibold tracking-tight whitespace-nowrap">Radar de Ameaças</span>
        <div className="flex items-center gap-2 ml-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
          </span>
          <span className="text-xs text-muted-foreground">
            Motor Operante. Nenhuma anomalia de tráfego detectada.
          </span>
        </div>
      </div>
    </Card>
  );
}
