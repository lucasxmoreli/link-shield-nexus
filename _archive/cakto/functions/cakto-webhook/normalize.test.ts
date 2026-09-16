// =============================================================================
// normalize.test.ts — Deno.test sem rede / sem Deno.env de secrets
// -----------------------------------------------------------------------------
// deno test --allow-read --allow-write supabase/functions/cakto-webhook/normalize.test.ts
// =============================================================================

import {
  assertEquals,
  assertExists,
  assertThrows,
} from "jsr:@std/assert@1";
import { normalize, NormalizeError, toFiniteNumber } from "./normalize.ts";
import { buildEventKey } from "./event_key.ts";

const FIX = new URL("./fixtures/", import.meta.url);
const RAW = new URL("./fixtures/raw/", import.meta.url);
const NORM = new URL("./fixtures/normalized/", import.meta.url);

async function loadRaw(name: string): Promise<Record<string, unknown>> {
  // Prefer fixtures/raw/; fallback fixtures/ root
  let path = new URL(name, RAW);
  try {
    await Deno.stat(path);
  } catch {
    path = new URL(name, FIX);
  }
  const text = await Deno.readTextFile(path);
  return JSON.parse(text) as Record<string, unknown>;
}

function firstItem(payload: Record<string, unknown>) {
  const data = payload.data;
  if (!Array.isArray(data) || !data[0]) throw new Error("no data[0]");
  return data[0] as Record<string, unknown>;
}

Deno.test("toFiniteNumber: abc → null (not NaN)", () => {
  assertEquals(toFiniteNumber("abc"), null);
  assertEquals(toFiniteNumber("0.00"), 0);
  assertEquals(toFiniteNumber(5.99), 5.99);
});

Deno.test("normalize: missing order id → NormalizeError", () => {
  assertThrows(
    () => normalize("purchase_approved", { status: "paid" }),
    NormalizeError,
    "missing_order_id",
  );
});

Deno.test("fixtures 22–25: field asserts + snapshots + unique keys", async () => {
  await Deno.mkdir(NORM, { recursive: true });

  const p22 = await loadRaw("22_pix_gerado.json");
  const p23 = await loadRaw("23_purchase_approved.json");
  const p24 = await loadRaw("24_subscription_created.json");
  const p25 = await loadRaw("25_subscription_canceled.json");

  const e22 = normalize(String(p22.event), firstItem(p22));
  const e23 = normalize(String(p23.event), firstItem(p23));
  const e24 = normalize(String(p24.event), firstItem(p24));
  const e25 = normalize(String(p25.event), firstItem(p25));

  // --- 23 purchase_approved ---
  assertEquals(e23.event, "purchase_approved");
  assertEquals(
    e23.event_key,
    "purchase_approved:7f933b3c-1cc5-4683-9a5b-c423b2dedcfa",
  );
  assertEquals(e23.occurred_at, "2026-09-15T13:46:47.878870-03:00");
  assertEquals(e23.paid_at, "2026-09-15T13:46:47.878870-03:00");
  assertEquals(e23.cycle_end, null);
  assertEquals(e23.sub_status, "inactive");
  assertEquals(e23.paid_payments, 1);
  assertEquals(e23.base_amount, 5);
  assertEquals(e23.amount, 5.99);
  assertEquals(e23.discount, 0);
  assertEquals(e23.currency, "BRL");
  assertEquals(e23.user_hint.sck, "44817c30-c37b-491d-afde-1b5e43007f49");
  assertEquals(e23.cakto_customer_id, "215501");

  // --- 24 subscription_created ---
  assertEquals(e24.event, "subscription_created");
  assertEquals(
    e24.cycle_end,
    "2026-10-15T13:47:00.077288-03:00",
  );
  assertEquals(
    e24.event_key,
    "subscription_created:d2537402-1b60-4303-9a03-7dd22bba4fd2:2026-09-15T13:47:00.225701-03:00",
  );

  // --- 25 canceled: sck via checkoutUrl ---
  assertEquals(e25.event, "subscription_canceled");
  assertEquals(e25.user_hint.sck, "44817c30-c37b-491d-afde-1b5e43007f49");
  assertEquals(e25.canceled_at, "2026-09-15T13:56:07.355555-03:00");
  assertEquals(
    e25.event_key,
    "subscription_canceled:d2537402-1b60-4303-9a03-7dd22bba4fd2:2026-09-15T13:56:07.360821-03:00",
  );

  // --- 22 pix ---
  assertEquals(e22.event, "pix_gerado");
  assertEquals(
    e22.event_key,
    "pix_gerado:7f933b3c-1cc5-4683-9a5b-c423b2dedcfa",
  );

  // Unique keys (22 vs 23 share order_id — prefix differs)
  const keys = [e22.event_key, e23.event_key, e24.event_key, e25.event_key];
  assertEquals(new Set(keys).size, 4);

  // Snapshots for replay A1–A5 (N1: compare committed file BEFORE overwrite)
  const snapshots: Record<string, typeof e22> = {
    "22": e22,
    "23": e23,
    "24": e24,
    "25": e25,
  };
  for (const [id, ev] of Object.entries(snapshots)) {
    const out = new URL(`${id}.json`, NORM);
    try {
      const committed = JSON.parse(await Deno.readTextFile(out));
      assertEquals(
        committed.event_key,
        ev.event_key,
        `P2-5 drift: normalized/${id}.json event_key changed`,
      );
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
      // first run: no committed snapshot yet
    }
    await Deno.writeTextFile(out, JSON.stringify(ev, null, 2) + "\n");
  }
});

Deno.test("synthetic: customer.id ausente → cakto_customer_id null", () => {
  const ev = normalize("pix_gerado", {
    id: "ord-1",
    createdAt: "2026-01-01T00:00:00Z",
    customer: { email: "a@b.com" },
    offer: { id: "x", currency: "BRL" },
    product: { type: "subscription" },
  });
  assertEquals(ev.cakto_customer_id, null);
  assertEquals(ev.user_hint.email, "a@b.com");
  assertExists(ev.event_key);
  assertExists(ev.occurred_at);
});

Deno.test("synthetic: known event shapes do not throw", () => {
  const events = [
    "purchase_approved",
    "purchase_refused",
    "refund",
    "chargeback",
    "pix_gerado",
    "boleto_gerado",
    "picpay_gerado",
    "openfinance_nubank_gerado",
    "checkout_abandonment",
    "subscription_created",
    "subscription_renewed",
    "subscription_canceled",
    "subscription_late",
    "subscription_late_recovered",
    "subscription_renewal_refused",
    "subscription_paused",
    "subscription_resumed",
  ];
  for (const event of events) {
    const item: Record<string, unknown> = {
      id: `ord-${event}`,
      createdAt: "2026-01-01T12:00:00-03:00",
      paidAt: "2026-01-01T12:01:00-03:00",
      refundedAt: "2026-01-01T12:02:00-03:00",
      chargedbackAt: "2026-01-01T12:03:00-03:00",
      status: "paid",
      baseAmount: 10,
      amount: 10,
      discount: "0.00",
      offer: { id: "o1", currency: "BRL" },
      product: { type: "subscription" },
      customer: { id: 1, email: "T@X.COM" },
      subscription: {
        id: "sub-1",
        status: "active",
        updatedAt: "2026-01-01T12:04:00-03:00",
        canceledAt: null,
        paid_payments_quantity: 1,
        next_payment_date: null,
      },
    };
    const ev = normalize(event, item);
    assertExists(ev.event_key);
    assertExists(ev.occurred_at);
    assertEquals(ev.user_hint.email, "t@x.com");
  }
});

Deno.test("buildEventKey: ORDER vs SUB", () => {
  const order = buildEventKey("purchase_approved", {
    id: "o1",
    subscription: { id: "s1", updatedAt: "t1" },
  });
  assertEquals(order.key, "purchase_approved:o1");

  const sub = buildEventKey("subscription_created", {
    id: "o1",
    subscription: { id: "s1", updatedAt: "t1" },
  });
  assertEquals(sub.key, "subscription_created:s1:t1");
});
