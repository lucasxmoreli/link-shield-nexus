// =============================================================================
// event_key.ts — contrato com o banco (P2-5)
// -----------------------------------------------------------------------------
// Mudar este formato invalida a idempotência de tudo que já está em cakto_events.
// Só com migration de rekey.
// =============================================================================

export const ORDER_EVENTS = new Set([
  "purchase_approved",
  "purchase_refused",
  "refund",
  "chargeback",
  "pix_gerado",
  "boleto_gerado",
  "picpay_gerado",
  "openfinance_nubank_gerado",
  "checkout_abandonment",
]);

export const SUB_EVENTS = new Set([
  "subscription_created",
  "subscription_renewed",
  "subscription_canceled",
  "subscription_late",
  "subscription_late_recovered",
  "subscription_renewal_refused",
  "subscription_paused",
  "subscription_resumed",
]);

type DataItem = Record<string, unknown>;

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

/**
 * Chave estável por evento. ORDER → event:order_id; SUB → event:subId:updatedAt.
 */
export function buildEventKey(
  event: string,
  item: DataItem,
): { key: string; warn?: string } {
  const orderId = asStr(item.id) ?? "missing";
  const sub = asObj(item.subscription);
  const subId = sub ? asStr(sub.id) : null;
  const updatedAt = sub ? asStr(sub.updatedAt) : null;

  if (ORDER_EVENTS.has(event)) {
    return { key: `${event}:${orderId}` };
  }

  if (SUB_EVENTS.has(event)) {
    if (subId && updatedAt) {
      return { key: `${event}:${subId}:${updatedAt}` };
    }
    return {
      key: `${event}:${orderId}`,
      warn: "sub_event_missing_id_or_updatedAt",
    };
  }

  return { key: `${event}:${orderId}` };
}
