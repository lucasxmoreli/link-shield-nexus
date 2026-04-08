import { useState, useMemo } from "react";
import { DollarSign, TrendingUp, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface RoiHeroProps {
  blocked: number;
  approved: number;
  totalCost: number;
  totalRevenue: number;
}

const DEFAULT_CPC = 0.25;

export function RoiHero({ blocked, approved, totalCost, totalRevenue }: RoiHeroProps) {
  const [manualCpc, setManualCpc] = useState<number>(DEFAULT_CPC);

  // Se tem dados reais de cost, usa automático. Senão, usa o input manual.
  const hasRealCost = totalCost > 0 && approved > 0;

  const { savedEstimate, roi, activeCpc, isEstimated } = useMemo(() => {
    const realCpc = hasRealCost ? totalCost / approved : 0;
    const activeCpc = hasRealCost ? realCpc : manualCpc;
    const isEstimated = !hasRealCost;
    const savedEstimate = blocked * activeCpc;
    const roi = totalCost > 0
      ? ((totalRevenue - totalCost) / totalCost) * 100
      : totalRevenue > 0 ? 100 : 0;
    return { savedEstimate, roi, activeCpc, isEstimated };
  }, [blocked, approved, totalCost, totalRevenue, manualCpc, hasRealCost]);

  const handleCpcChange = (value: string) => {
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      setManualCpc(parsed);
    } else if (value === "" || value === "0" || value === "0.") {
      setManualCpc(0);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.07] via-card to-card p-5 sm:p-6">
      <div className="absolute -top-20 -right-20 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="absolute -bottom-10 -left-10 h-28 w-28 rounded-full bg-primary/5 blur-2xl" />

      <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
        {/* MONEY SAVED — HERO */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15">
              <DollarSign className="h-4 w-4 text-emerald-400" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400/80">
              Dinheiro Economizado
            </span>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[260px] text-xs leading-relaxed">
                  {isEstimated
                    ? "Valor estimado baseado nos cliques bloqueados multiplicados pelo seu CPC médio. Ajuste o valor ao lado para refletir seu custo real."
                    : "Calculado automaticamente com base no custo real registrado pelo seu tracking dividido pelos cliques aprovados."}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-3xl sm:text-4xl font-extrabold font-mono text-emerald-400 tracking-tight">
            ${savedEstimate.toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {blocked.toLocaleString()} bots × ${activeCpc.toFixed(3)} CPC
            {isEstimated && <span className="text-primary/60 ml-1">(estimado)</span>}
          </p>

          {/* CPC Manual Input — só aparece quando não tem dados reais */}
          {isEstimated && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">CPC Estimado:</span>
              <div className="relative w-24">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={manualCpc || ""}
                  onChange={(e) => handleCpcChange(e.target.value)}
                  className="h-7 pl-5 pr-2 text-xs font-mono bg-background/50 border-border/50 w-full"
                  placeholder="0.25"
                />
              </div>
            </div>
          )}
        </div>

        {/* ROI */}
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">ROI</span>
          </div>
          <p className={`text-3xl sm:text-4xl font-extrabold font-mono tracking-tight ${roi >= 0 ? 'text-emerald-400' : 'text-destructive'}`}>
            {totalCost > 0 ? `${roi.toFixed(1)}%` : "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {totalCost > 0
              ? `Receita: $${totalRevenue.toFixed(2)} · Custo: $${totalCost.toFixed(2)}`
              : "Dados de custo não disponíveis"}
          </p>
        </div>
      </div>
    </div>
  );
}
