// =============================================================================
// normalize.ts — puro: (payload event, data[i], opts) → NormalizedEvent
// Zero regra de negócio; espelha p_event->> da RPC cakto_apply_event.
// =============================================================================

import { buildEventKey } from "./event_key.ts";

export class NormalizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NormalizeError";
  }
}

export type NormalizedEvent = {
  event: string;
  event_key: string;
  order_id: string;
  subscription_id: string | null;
  offer_id: string | null;
  product_type: string | null;
  status: string | null;
  sub_status: string | null;
  paid_payments: number | null;
  base_amount: number | null;
  amount: number | null;
  discount: number | null;
  coupon: string | null;
  currency: string | null;
  occurred_at: string;
  paid_at: string | null;
  cycle_end: string | null;
  canceled_at: string | null;
  cakto_customer_id: string | null;
  user_hint: {
    sck: string | null;
    utm_content: string | null;
    email: string | null;
  };
};

type DataItem = Record<string, unknown>;

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

/** Number finito; string "abc" → null (nunca NaN). */
export function toFiniteNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function qsParam(url: string | null, key: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const v = u.searchParams.get(key);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

function pickOccurredAt(
  event: string,
  item: DataItem,
  sub: Record<string, unknown> | null,
  edgeNowIso: string,
): { value: string; warn?: string } {
  const createdAt = asStr(item.createdAt);

  if (event === "purchase_approved") {
    return { value: asStr(item.paidAt) ?? createdAt ?? edgeNowIso };
  }
  if (event === "refund") {
    return { value: asStr(item.refundedAt) ?? createdAt ?? edgeNowIso };
  }
  if (event === "chargeback") {
    return { value: asStr(item.chargedbackAt) ?? createdAt ?? edgeNowIso };
  }
  if (
    event === "purchase_refused" ||
    event.endsWith("_gerado") ||
    event === "checkout_abandonment"
  ) {
    if (createdAt) return { value: createdAt };
    return { value: edgeNowIso, warn: "occurred_at_fallback_edge_now" };
  }
  if (event === "subscription_canceled") {
    return {
      value:
        (sub && asStr(sub.canceledAt)) ??
        (sub && asStr(sub.updatedAt)) ??
        createdAt ??
        edgeNowIso,
    };
  }
  if (event.startsWith("subscription_")) {
    return {
      value: (sub && asStr(sub.updatedAt)) ?? createdAt ?? edgeNowIso,
    };
  }
  return { value: createdAt ?? edgeNowIso };
}

export type NormalizeOpts = {
  /** ISO now — só para fallback de intent events sem createdAt */
  edgeNowIso?: string;
};

/**
 * Converte um data[i] + event do envelope Cakto no contrato da RPC.
 */
export function normalize(
  event: string,
  item: unknown,
  opts: NormalizeOpts = {},
): NormalizedEvent {
  if (!event || typeof event !== "string") {
    throw new NormalizeError("missing_event");
  }
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new NormalizeError("invalid_data_item");
  }
  const row = item as DataItem;
  const orderId = asStr(row.id);
  if (!orderId) {
    throw new NormalizeError("missing_order_id");
  }

  const edgeNowIso = opts.edgeNowIso ?? new Date().toISOString();
  const sub = asObj(row.subscription);
  const offer = asObj(row.offer);
  const product = asObj(row.product);
  const customer = asObj(row.customer);
  const checkoutUrl = asStr(row.checkoutUrl);

  const { key: event_key, warn: keyWarn } = buildEventKey(event, row);
  if (keyWarn) {
    console.warn(`[normalize] event_key warn=${keyWarn} event=${event}`);
  }

  const { value: occurred_at, warn: occWarn } = pickOccurredAt(
    event,
    row,
    sub,
    edgeNowIso,
  );
  if (occWarn) {
    console.warn(`[normalize] ${occWarn} event=${event}`);
  }

  const sck =
    asStr(row.sck) ?? qsParam(checkoutUrl, "sck");
  const utm =
    asStr(row.utm_content) ?? qsParam(checkoutUrl, "utm_content");
  const emailRaw = customer ? asStr(customer.email) : null;
  const email = emailRaw ? emailRaw.toLowerCase().trim() : null;

  const canceledAt =
    (sub && asStr(sub.canceledAt)) ?? asStr(row.canceledAt);

  const customerId = customer?.id;
  const cakto_customer_id =
    customerId === null || customerId === undefined
      ? null
      : String(customerId);

  return {
    event,
    event_key,
    order_id: orderId,
    subscription_id: sub ? asStr(sub.id) : null,
    offer_id: offer ? asStr(offer.id) : null,
    product_type: product ? asStr(product.type) : null,
    status: asStr(row.status),
    sub_status: sub ? asStr(sub.status) : null,
    paid_payments: sub
      ? toFiniteNumber(sub.paid_payments_quantity)
      : null,
    base_amount: toFiniteNumber(row.baseAmount),
    amount: toFiniteNumber(row.amount),
    discount: toFiniteNumber(row.discount),
    coupon: asStr(row.couponCode),
    currency: offer ? asStr(offer.currency) : null,
    occurred_at,
    paid_at: asStr(row.paidAt),
    cycle_end: sub ? asStr(sub.next_payment_date) : null,
    canceled_at: canceledAt,
    cakto_customer_id,
    user_hint: {
      sck,
      utm_content: utm,
      email,
    },
  };
}
