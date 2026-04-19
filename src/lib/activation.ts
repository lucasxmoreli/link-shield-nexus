// =============================================================================
// Activation state machine — shared types and helpers.
// -----------------------------------------------------------------------------
// The database column `profiles.activation_status` is a generated column
// derived from `subscription_status` + `plan_name` (see migration
// 20260419140000_activation_status.sql). This module is the single source of
// truth for the state enum and guard helpers on the client side.
// =============================================================================

export type ActivationStatus =
  | "INVITED"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED";

/** Fallback when the profile row has not been hydrated yet. */
export const DEFAULT_ACTIVATION_STATUS: ActivationStatus = "INVITED";

/** Route where the user must go to pay / fix their subscription. */
export const BILLING_ROUTE = "/billing";

/**
 * Normalize a raw string coming from the DB into the typed enum.
 * Unknown values are treated as `INVITED` (safest default — gate stays closed).
 */
export function normalizeActivationStatus(raw: string | null | undefined): ActivationStatus {
  switch (raw) {
    case "ACTIVE":
    case "PAST_DUE":
    case "CANCELED":
      return raw;
    case "INVITED":
    default:
      return "INVITED";
  }
}

/**
 * Should the user be allowed to use feature primitives
 * (create/edit domains, campaigns, etc)?
 */
export function isWorkspaceActive(status: ActivationStatus): boolean {
  return status === "ACTIVE";
}

/**
 * Should the user be redirected to the billing page when trying to reach
 * gated routes? True for everything except ACTIVE.
 */
export function shouldRedirectToBilling(status: ActivationStatus): boolean {
  return status !== "ACTIVE";
}
