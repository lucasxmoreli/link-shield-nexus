/**
 * Helpers de timezone — São Paulo é o fuso comercial canônico do CloakerX.
 *
 * Por que isso mora num módulo dedicado:
 *  • Dashboard.tsx, Analytics.tsx (e qualquer página futura de métricas)
 *    precisam ancorar "hoje" no calendário brasileiro, NÃO no fuso do
 *    navegador do usuário (que pode ser Lisboa, NY, Tóquio).
 *  • Centralizando aqui, qualquer ajuste futuro (ex: trocar pra UTC se o
 *    produto internacionalizar) acontece em UM só lugar.
 *
 * Brasil aboliu horário de verão em 2019 → offset fixo -03:00 ano todo.
 * Por isso podemos usar string ISO com -03:00 hardcoded sem se preocupar
 * com DST. Se um dia voltar o horário de verão, trocar essas funções por
 * date-fns-tz é uma migração de 5 minutos.
 */

export const SP_TZ = "America/Sao_Paulo" as const;

/**
 * Retorna "YYYY-MM-DD" do `d` no fuso de São Paulo.
 *
 * Imune ao timezone do navegador do usuário — sempre o dia comercial BR.
 * Útil para:
 *  • Filtrar agregados (`.gte("date", spDateString())`)
 *  • Construir chaves de lookup em maps de zero-fill
 */
export function spDateString(d: Date = new Date()): string {
  // en-CA tem saída ISO-like (YYYY-MM-DD) sem precisar montar string manual.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Retorna o instante "00:00:00 SP" do dia em que `d` cai (em SP).
 *
 * Útil para filtros raw na requests_log:
 *   .gte("created_at", spStartOfDay().toISOString())
 */
export function spStartOfDay(d: Date = new Date()): Date {
  return new Date(`${spDateString(d)}T00:00:00-03:00`);
}
