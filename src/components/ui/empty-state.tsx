import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * EmptyState — componente padronizado pra "telas vazias" do app.
 *
 * Por que existe:
 *  - Toda página/widget vazio antes era um texto cinza claro perdido na tela,
 *    sem direção visual de "o que clicar agora". Cold start frustrante.
 *  - Centraliza o padrão visual (ícone gigante + título emocional + CTA óbvio)
 *    pra que adicionar novos empty states no futuro seja consistente.
 *
 * Variantes:
 *  - "card"   → wrap em Card com borda, ideal pra área principal de página
 *               (ex.: tabela vazia em Campaigns, Domains).
 *  - "subtle" → sem borda, só centralizado, ideal pra OVERLAY dentro de
 *               widgets que já têm seu próprio container (ex.: chart, lista).
 */

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: "default" | "outline" | "ghost";
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** CTA primário (botão grande, cor de destaque). */
  cta?: EmptyStateAction;
  /** CTA secundário (link pequeno abaixo do botão). */
  secondaryCta?: EmptyStateAction;
  /** "card" (default) wrap em Card; "subtle" só centraliza sem borda. */
  variant?: "card" | "subtle";
  /** Classes extras pro container externo (ex.: ajuste de altura). */
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  cta,
  secondaryCta,
  variant = "card",
  className,
}: EmptyStateProps) {
  const inner = (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        variant === "card" ? "py-14 px-6" : "py-8 px-4",
      )}
    >
      {/* Halo + ícone — visual focal, atrai o olhar pro CTA */}
      <div
        className={cn(
          "mb-4 flex items-center justify-center rounded-2xl",
          "bg-primary/10 ring-1 ring-primary/20",
          variant === "card" ? "h-16 w-16" : "h-12 w-12",
        )}
      >
        <Icon
          className={cn(
            "text-primary",
            variant === "card" ? "h-8 w-8" : "h-6 w-6",
          )}
          strokeWidth={1.75}
        />
      </div>

      {/* Título emocional — fala com o usuário, não descreve o estado */}
      <h3
        className={cn(
          "font-semibold text-foreground tracking-tight",
          variant === "card" ? "text-lg sm:text-xl" : "text-sm",
        )}
      >
        {title}
      </h3>

      {/* Descrição — 1 linha de contexto/promessa (max-w trava a respiração) */}
      {description && (
        <p
          className={cn(
            "mt-2 text-muted-foreground max-w-md",
            variant === "card" ? "text-sm" : "text-xs",
          )}
        >
          {description}
        </p>
      )}

      {/* CTA primário — gigante, óbvio, com a copy exata da próxima ação */}
      {cta && (
        <Button
          onClick={cta.onClick}
          variant={cta.variant ?? "default"}
          size={variant === "card" ? "lg" : "default"}
          className={cn(
            "mt-6 font-semibold",
            // neon-glow só no variant card e quando default — segue o padrão
            // do botão "Criar Campanha" do Campaigns.tsx pra não quebrar
            // identidade visual.
            variant === "card" && (cta.variant ?? "default") === "default" && "neon-glow",
          )}
        >
          {cta.label}
        </Button>
      )}

      {/* CTA secundário — link discreto abaixo, ex.: "Ver demo" / "Documentação" */}
      {secondaryCta && (
        <button
          type="button"
          onClick={secondaryCta.onClick}
          className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
        >
          {secondaryCta.label}
        </button>
      )}
    </div>
  );

  if (variant === "subtle") {
    return <div className={className}>{inner}</div>;
  }

  return (
    <Card className={cn("border-border bg-card", className)}>
      <CardContent className="p-0">{inner}</CardContent>
    </Card>
  );
}
