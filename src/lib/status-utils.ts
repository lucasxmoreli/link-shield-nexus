import { ShieldCheck, Target, Eye } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type StatusFinal = "Aprovado" | "Bloqueado" | "Página Segura";

export interface StatusBadgeConfig {
  label: string;
  icon: LucideIcon;
  className: string;
}

/**
 * Single Source of Truth for status badge rendering across the entire app.
 * Maps `status_final` from dashboard_analytics_view to consistent visual config.
 */
export function getStatusBadgeConfig(statusFinal: string | null): StatusBadgeConfig {
  switch (statusFinal) {
    case "Aprovado":
      return {
        label: "Aprovado",
        icon: Target,
        className: "border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
      };
    case "Bloqueado":
      return {
        label: "Bloqueado",
        icon: ShieldCheck,
        className: "border-destructive/30 bg-destructive/10 text-destructive",
      };
    case "Página Segura":
      return {
        label: "Página Segura",
        icon: Eye,
        className: "border-primary/30 bg-primary/10 text-primary",
      };
    default:
      return {
        label: statusFinal ?? "Desconhecido",
        icon: Eye,
        className: "border-border bg-muted text-muted-foreground",
      };
  }
}

/**
 * Maps action_taken (from requests_log) to status_final equivalent.
 */
export function actionToStatusFinal(actionTaken: string): StatusFinal {
  switch (actionTaken) {
    case "offer_page": return "Aprovado";
    case "bot_blocked": return "Bloqueado";
    case "safe_page": return "Página Segura";
    default: return "Bloqueado";
  }
}
