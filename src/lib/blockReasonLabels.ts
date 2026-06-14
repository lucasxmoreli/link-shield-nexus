/**
 * Block Reason Labels — UI Masking Layer
 *
 * Converts raw block_reason values stored in the database into i18n keys
 * for display in the UI. The technical signal details (scores, weights,
 * thresholds, internal trap names) must never be exposed to clients.
 *
 * Rule: this function owns all block_reason → label mappings.
 * The raw value stays in the DB; only the i18n key reaches the DOM.
 */

export function getBlockReasonLabel(rawReason: string | null): string {
  if (!rawReason) return "blockReason.blocked_generic";

  const r = rawReason.toLowerCase();

  if (r.startsWith("fingerprint_bot") || r.startsWith("fingerprint")) {
    return "blockReason.suspicious_behavior";
  }
  if (r.startsWith("device_blocked")) return "blockReason.device_not_allowed";
  if (r.startsWith("country_blocked")) return "blockReason.geo_blocked";
  if (r === "no_click_id" || r === "bot_macro_detected" || r === "bot_ua_signature") {
    return "blockReason.invalid_click";
  }
  if (r === "campaign_paused") return "blockReason.campaign_inactive";
  if (r.startsWith("proxy:") || r.includes("datacenter") || r.includes("vpn") || r.includes("high_risk")) {
    return "blockReason.suspicious_connection";
  }
  if (r.startsWith("blacklist:") || r.startsWith("one_time_click") || r.includes("ip_binding") || r.includes("too_many_ips")) {
    return "blockReason.blocked_source";
  }

  return "blockReason.blocked_generic";
}
