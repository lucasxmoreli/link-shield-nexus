/**
 * Helpers de formatação consistente para Billing UI.
 * Centraliza lógica que seria duplicada em PlanOverviewCard, OverageCard, etc.
 */

/**
 * Formata número de cliques com separador de milhar (pt-BR style).
 * Ex: 27500 → "27.500"
 */
export function formatClicks(clicks: number, locale: string = "pt-BR"): string {
  return new Intl.NumberFormat(locale).format(clicks);
}

/**
 * Formata valor em USD com 2 casas decimais.
 * Ex: 60 → "$60.00"
 */
export function formatUSD(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Formata taxa unitária de overage com até 4 casas decimais (pra não truncar $0.001).
 */
export function formatOverageRate(rate: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 3,
    maximumFractionDigits: 4,
  }).format(rate);
}

/**
 * Formata data curta (dia + mês abreviado) no locale.
 */
export function formatShortDate(isoDate: string, locale: string = "pt-BR"): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  }).format(new Date(isoDate));
}

/**
 * Calcula dias restantes entre agora e uma data futura. Retorna 0 se já passou.
 */
export function daysUntil(isoDate: string): number {
  const now = new Date();
  const target = new Date(isoDate);
  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Calcula overage atual (cliques + custo estimado).
 * Fallback: extraClickPrice default 0.01 (preço BASIC) se plan não tem definido.
 */
export function calculateOverage(
  currentClicks: number,
  maxClicks: number,
  extraClickPrice: number | undefined | null
): { overageClicks: number; overageCost: number } {
  const overageClicks = Math.max(0, currentClicks - maxClicks);
  const rate = extraClickPrice ?? 0.01;
  const overageCost = overageClicks * rate;
  return { overageClicks, overageCost };
}

/**
 * Calcula limites efetivos somando plano base + addons ativos.
 */
export function calculateEffectiveLimits(
  baseMaxDomains: number,
  baseMaxCampaigns: number,
  addons: Array<{ addon_type: string; quantity: number; status: string }>
): {
  effectiveMaxDomains: number;
  effectiveMaxCampaigns: number;
  extraDomains: number;
  extraCampaigns: number;
} {
  const activeAddons = addons.filter((a) => a.status === "active");

  const extraDomains = activeAddons
    .filter((a) => a.addon_type === "extra_domain")
    .reduce((sum, a) => sum + (a.quantity || 0), 0);

  const extraCampaigns = activeAddons
    .filter((a) => a.addon_type === "extra_campaign")
    .reduce((sum, a) => sum + (a.quantity || 0), 0);

  return {
    effectiveMaxDomains: baseMaxDomains + extraDomains,
    effectiveMaxCampaigns: baseMaxCampaigns + extraCampaigns,
    extraDomains,
    extraCampaigns,
  };
}