import { Bot, Ghost, EyeOff, Wifi, Share2, ShieldOff, AlertTriangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Threat Display Map — Single Source of Truth
 *
 * Converte o block_reason técnico do banco para um "nome comercial" de ameaça.
 * O cliente sente o poder da ferramenta, mas o concorrente não descobre
 * qual variável específica estourou.
 *
 * Regra: NUNCA expor nomes de travas (Trava 1, Trava 4, Trava 8),
 * nomes de APIs (proxycheck, ipinfo), ou sinais técnicos (webdriver, canvas).
 */

export interface ThreatDisplay {
  label: string;
  icon: LucideIcon;
  color: string;
  bgClass: string;
  badgeClass: string;
}

const THREAT_MAP: Array<{ match: (reason: string) => boolean; display: ThreatDisplay }> = [
  {
    match: (r) => r.includes("fingerprint"),
    display: {
      label: "Robô de Automação",
      icon: Bot,
      color: "hsl(200, 80%, 55%)",
      bgClass: "bg-cyan-500/15",
      badgeClass: "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
    },
  },
  {
    match: (r) => r.includes("one_time_click"),
    display: {
      label: "Ferramenta de Espionagem",
      icon: EyeOff,
      color: "hsl(30, 100%, 50%)",
      bgClass: "bg-orange-500/15",
      badgeClass: "bg-orange-500/15 text-orange-400 border-orange-500/25",
    },
  },
  {
    match: (r) => r.includes("datacenter") || r.includes("proxy") || r.includes("high_risk") || r.includes("vpn"),
    display: {
      label: "Conexão Mascarada",
      icon: Wifi,
      color: "hsl(0, 75%, 55%)",
      bgClass: "bg-red-500/15",
      badgeClass: "bg-red-500/15 text-red-400 border-red-500/25",
    },
  },
  {
    match: (r) => r.includes("no_click_id"),
    display: {
      label: "Tráfego Fantasma",
      icon: Ghost,
      color: "hsl(222, 100%, 50%)",
      bgClass: "bg-primary/15",
      badgeClass: "bg-primary/15 text-primary border-primary/25",
    },
  },
  {
    match: (r) => r.includes("ip_binding") || r.includes("too_many_ips") || r.includes("ua_or_device"),
    display: {
      label: "Fraude de Identidade",
      icon: Share2,
      color: "hsl(340, 70%, 55%)",
      bgClass: "bg-pink-500/15",
      badgeClass: "bg-pink-500/15 text-pink-400 border-pink-500/25",
    },
  },
  {
    match: (r) => r.includes("strict_mode") || r.includes("country_blocked") || r.includes("device_blocked"),
    display: {
      label: "Origem Incompatível",
      icon: ShieldOff,
      color: "hsl(45, 90%, 50%)",
      bgClass: "bg-yellow-500/15",
      badgeClass: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
    },
  },
  {
    // Trava 10 — bot de auditoria TikTok/Meta/Google (macros cruas ou UA de infra)
    match: (r) => r.includes("bot_macro_detected") || r.includes("bot_ua_signature"),
    display: {
      label: "Robô de Plataforma",
      icon: Bot,
      color: "hsl(280, 70%, 60%)",
      bgClass: "bg-purple-500/15",
      badgeClass: "bg-purple-500/15 text-purple-400 border-purple-500/25",
    },
  },
];

const FALLBACK_DISPLAY: ThreatDisplay = {
  label: "Tráfego Suspeito",
  icon: AlertTriangle,
  color: "hsl(0, 0%, 50%)",
  bgClass: "bg-muted",
  badgeClass: "bg-muted text-muted-foreground border-border",
};

export function getThreatDisplay(reason: string | null): ThreatDisplay {
  if (!reason) return FALLBACK_DISPLAY;
  const r = reason.toLowerCase();
  for (const entry of THREAT_MAP) {
    if (entry.match(r)) return entry.display;
  }
  return FALLBACK_DISPLAY;
}

export function aggregateThreats(
  logs: Array<{ status_final: string; motivo_limpo: string | null }>
): Array<ThreatDisplay & { value: number; pct: string }> {
  const blocked = logs.filter(
    (l) => l.status_final === "Bloqueado" || l.status_final === "Página Segura"
  );
  if (blocked.length === 0) return [];

  const counts: Record<string, { display: ThreatDisplay; count: number }> = {};

  blocked.forEach((l) => {
    const display = getThreatDisplay(l.motivo_limpo);
    if (!counts[display.label]) counts[display.label] = { display, count: 0 };
    counts[display.label].count++;
  });

  return Object.values(counts)
    .sort((a, b) => b.count - a.count)
    .map(({ display, count }) => ({
      ...display,
      value: count,
      pct: ((count / blocked.length) * 100).toFixed(1),
    }));
}
