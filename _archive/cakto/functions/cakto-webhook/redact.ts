// =============================================================================
// redact.ts — extraído do v0.1 (sem mudança de comportamento)
// =============================================================================

export const REDACT = "***";

export function redactCustomer(c: Record<string, unknown> | null | undefined) {
  if (!c || typeof c !== "object") return;
  if ("docNumber" in c) c.docNumber = REDACT;
  if ("phone" in c) c.phone = REDACT;
  if ("birthDate" in c) c.birthDate = REDACT;
}

export function redactPaymentBlobs(item: Record<string, unknown>) {
  if (item.card && typeof item.card === "object") {
    item.card = REDACT;
  }
  if (item.boleto && typeof item.boleto === "object") {
    const b = item.boleto as Record<string, unknown>;
    if ("barcode" in b) b.barcode = REDACT;
  }
  if (item.pix && typeof item.pix === "object") {
    const p = item.pix as Record<string, unknown>;
    if ("qrCode" in p) p.qrCode = REDACT;
  }
  if (item.picpay && typeof item.picpay === "object") {
    item.picpay = REDACT;
  }
}

/** V0-1: mascarar PII no JSON parseado. */
export function redactParsedPayload(payload: Record<string, unknown>): void {
  if ("secret" in payload) payload.secret = REDACT;

  const data = payload.data;
  if (!Array.isArray(data)) return;

  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    redactCustomer(item.customer as Record<string, unknown>);
    redactPaymentBlobs(item);

    const sub = item.subscription;
    if (sub && typeof sub === "object") {
      redactCustomer(
        (sub as Record<string, unknown>).customer as Record<string, unknown>,
      );
    }
  }
}

/** Fallback se JSON.parse falhar: regex nos campos conhecidos. */
export function redactBodyByRegex(raw: string): string {
  let s = raw;
  s = s.replace(/"secret"\s*:\s*"[^"]*"/gi, `"secret":"${REDACT}"`);
  s = s.replace(/"docNumber"\s*:\s*"[^"]*"/gi, `"docNumber":"${REDACT}"`);
  s = s.replace(/"phone"\s*:\s*"[^"]*"/gi, `"phone":"${REDACT}"`);
  s = s.replace(
    /"birthDate"\s*:\s*("[^"]*"|null)/gi,
    `"birthDate":"${REDACT}"`,
  );
  s = s.replace(/"barcode"\s*:\s*"[^"]*"/gi, `"barcode":"${REDACT}"`);
  s = s.replace(/"qrCode"\s*:\s*"[^"]*"/gi, `"qrCode":"${REDACT}"`);
  s = s.replace(/"card"\s*:\s*\{[^}]*\}/gi, `"card":"${REDACT}"`);
  s = s.replace(/"picpay"\s*:\s*\{[^}]*\}/gi, `"picpay":"${REDACT}"`);
  return s;
}
