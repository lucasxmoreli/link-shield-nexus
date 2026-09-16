// =============================================================================
// cakto-webhook v1 — auth + normalize + RPC cakto_apply_event
// -----------------------------------------------------------------------------
// Zero regra de negócio na edge. Path token + secret; raw sempre gravado.
// verify_jwt = false.
// =============================================================================

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { normalize, NormalizeError, type NormalizedEvent } from "./normalize.ts";
import {
  redactBodyByRegex,
  redactCustomer,
  redactParsedPayload,
  redactPaymentBlobs,
} from "./redact.ts";

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function pathTokenFromUrl(url: string): string | null {
  try {
    const { pathname } = new URL(url);
    const parts = pathname.split("/").filter(Boolean);
    const idx = parts.lastIndexOf("cakto-webhook");
    if (idx < 0 || idx >= parts.length - 1) return null;
    const token = parts[idx + 1];
    if (idx + 2 !== parts.length) return null;
    return token || null;
  } catch {
    return null;
  }
}

/** Comparação em tempo constante (mesmo comprimento). */
function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ba.length, bb.length);
  let mismatch = ba.length === bb.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    const x = i < ba.length ? ba[i] : 0;
    const y = i < bb.length ? bb[i] : 0;
    mismatch |= x ^ y;
  }
  return mismatch === 0;
}

function prepareBody(rawBody: string): {
  body: string;
  secretOk: boolean;
  parseError: boolean;
  parsed: Record<string, unknown> | null;
} {
  const expectedSecret = Deno.env.get("CAKTO_WEBHOOK_SECRET") ?? "";
  let secretOk = false;
  let parseError = false;
  let bodyOut = rawBody;
  let parsed: Record<string, unknown> | null = null;

  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
    const incoming = typeof parsed.secret === "string" ? parsed.secret : "";
    secretOk =
      expectedSecret.length > 0 &&
      timingSafeEqualStr(incoming, expectedSecret);

    redactParsedPayload(parsed);
    bodyOut = JSON.stringify(parsed);
  } catch {
    parseError = true;
    const m = rawBody.match(/"secret"\s*:\s*"([^"]*)"/i);
    const incoming = m?.[1] ?? "";
    secretOk =
      expectedSecret.length > 0 &&
      timingSafeEqualStr(incoming, expectedSecret);
    bodyOut = redactBodyByRegex(rawBody);
    parsed = null;
  }

  return { body: bodyOut, secretOk, parseError, parsed };
}

function redactDataItem(item: unknown): unknown {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  const clone = structuredClone(item) as Record<string, unknown>;
  redactCustomer(clone.customer as Record<string, unknown>);
  redactPaymentBlobs(clone);
  const sub = clone.subscription;
  if (sub && typeof sub === "object") {
    redactCustomer(
      (sub as Record<string, unknown>).customer as Record<string, unknown>,
    );
  }
  return clone;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type ResultRow = Record<string, unknown>;

async function insertFailedEvent(
  admin: SupabaseClient,
  row: {
    event_key: string;
    event: string;
    status: string;
    reason: string;
    payload: unknown;
  },
) {
  const { error } = await admin.from("cakto_events").upsert(
    {
      event_key: row.event_key,
      event: row.event,
      status: row.status,
      reason: row.reason,
      payload: row.payload,
      received_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
    },
    { onConflict: "event_key", ignoreDuplicates: true },
  );
  if (error) {
    console.error("[cakto-webhook] failed-row insert:", error.message);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  const expected = Deno.env.get("CAKTO_WEBHOOK_PATH_TOKEN");
  if (!expected || expected.length < 24) {
    console.error("[cakto-webhook] CAKTO_WEBHOOK_PATH_TOKEN missing or too short");
    return new Response(null, { status: 503 });
  }

  const got = pathTokenFromUrl(req.url);
  if (!got || got !== expected) {
    return new Response(null, { status: 404 });
  }

  if (req.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  const rawBody = await req.text();
  const headers = headersToObject(req.headers);
  const { body, secretOk, parseError, parsed } = prepareBody(rawBody);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[cakto-webhook] missing SUPABASE_URL / SERVICE_ROLE");
    return new Response(null, { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: rawRow, error: rawErr } = await admin
    .from("cakto_events_raw")
    .insert({
      headers,
      body,
      secret_ok: secretOk,
      parse_error: parseError,
    })
    .select("id")
    .single();

  if (rawErr) {
    console.error("[cakto-webhook] insert raw failed:", rawErr.message);
    return json(500, { ok: false });
  }

  const rawId = rawRow?.id as number | string | undefined;

  if (parseError) {
    return json(400, { ok: false, reason: "invalid_json" });
  }

  if (!secretOk) {
    return json(401, { ok: false });
  }

  if (!parsed) {
    return json(400, { ok: false, reason: "invalid_json" });
  }

  const eventName = typeof parsed.event === "string" ? parsed.event : null;
  const dataArr = parsed.data;
  if (!eventName || !Array.isArray(dataArr)) {
    return json(400, { ok: false, reason: "invalid_shape" });
  }

  const results: ResultRow[] = [];
  let anyFailed = false;

  for (let i = 0; i < dataArr.length; i++) {
    let ev: NormalizedEvent;
    try {
      ev = normalize(eventName, dataArr[i], {
        edgeNowIso: new Date().toISOString(),
      });
    } catch (e) {
      const msg = e instanceof NormalizeError ? e.message : "normalize_error";
      const failKey = `${eventName}:raw:${rawId ?? "x"}:${i}`;
      const reason = `normalize_error:${msg}`;
      await insertFailedEvent(admin, {
        event_key: failKey,
        event: eventName,
        status: "failed",
        reason,
        payload: redactDataItem(dataArr[i]),
      });
      console.log(
        JSON.stringify({
          event: eventName,
          event_key: failKey,
          status: "failed",
          reason,
        }),
      );
      results.push({ status: "failed", reason, event_key: failKey });
      anyFailed = true;
      continue;
    }

    const { data: rpcData, error: rpcErr } = await admin.rpc(
      "cakto_apply_event",
      { p_event: ev },
    );

    if (rpcErr) {
      const reason = `rpc_error:${rpcErr.message}`;
      await insertFailedEvent(admin, {
        event_key: ev.event_key,
        event: ev.event,
        status: "failed",
        reason,
        payload: ev,
      });
      console.log(
        JSON.stringify({
          event: ev.event,
          event_key: ev.event_key,
          status: "failed",
          reason,
        }),
      );
      // N2: HTTP body sem detalhe Postgres; detalhe fica em cakto_events + log
      results.push({
        status: "failed",
        reason: "rpc_error",
        event_key: ev.event_key,
      });
      anyFailed = true;
      continue;
    }

    const row = (rpcData ?? {}) as ResultRow;
    console.log(
      JSON.stringify({
        event: ev.event,
        event_key: ev.event_key,
        status: row.status ?? null,
        reason: row.reason ?? null,
        user_id: row.user_id ?? null,
      }),
    );

    // N3: RPC failed sem INSERT (ex. missing_event_key) → rastro em cakto_events
    if (row.status === "failed") {
      await insertFailedEvent(admin, {
        event_key: ev.event_key,
        event: ev.event,
        status: "failed",
        reason: String(row.reason ?? "rpc_failed"),
        payload: ev,
      });
      anyFailed = true;
    }

    results.push(row);
  }

  if (anyFailed) {
    return json(500, { ok: false, results });
  }
  return json(200, { ok: true, results });
});
