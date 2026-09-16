import type { BillingPack, BillingResource, BillingResourceState } from "@/hooks/useBillingState";

export type PackReason =
  | "unlimited"
  | "free_plan"
  | "at_cap"
  | "cycle_quota"
  | "checkout_unavailable"
  | null;

export type PackCardKind = "quota" | "capacity";

export type PackCta =
  | { type: "none" }
  | { type: "coming_soon"; disabled: true }
  | { type: "view_plans"; disabled: false }
  | { type: "buy"; disabled: false }
  | { type: "inactive"; disabled: true; key: "past_due" | "canceled" };

export interface PackViewInput {
  kind: PackCardKind;
  resource: BillingResource;
  pack: BillingPack;
  activation: string | null | undefined;
  isBypass: boolean;
  checkoutAvailable: boolean;
  planKey: string;
}

export interface PackView {
  kind: PackCardKind;
  reason: PackReason | "checkout_unavailable";
  copyKey:
    | "bypass"
    | "inactive_past_due"
    | "inactive_canceled"
    | "unlimited"
    | "at_cap"
    | "cycle_quota"
    | "over_limit"
    | "at_limit"
    | "ok";
  cta: PackCta;
  showPrice: boolean;
  removeCount: number;
  buySlotsCount: number;
}

function normalizeReason(
  raw: string | null | undefined,
  canBuy: boolean,
): PackReason | "checkout_unavailable" {
  if (canBuy && (raw === null || raw === undefined)) return null;
  switch (raw) {
    case "unlimited":
    case "free_plan":
    case "at_cap":
    case "cycle_quota":
    case "checkout_unavailable":
      return raw;
    case null:
    case undefined:
      console.warn("[resolvePackView] reason null with can_buy path — treating as checkout_unavailable");
      return "checkout_unavailable";
    default:
      console.warn(`[resolvePackView] unknown reason "${raw}" — treating as checkout_unavailable`);
      return "checkout_unavailable";
  }
}

/** Helper puro W2/W6/R-C/R-D — testável sem React. */
export function resolvePackView(input: PackViewInput): PackView {
  const { kind, resource, pack, activation, isBypass, checkoutAvailable, planKey } = input;
  const state: BillingResourceState = resource.state;
  const canBuy = pack.can_buy === true && checkoutAvailable === true;
  const reason = normalizeReason(pack.reason, canBuy);

  const removeCount = Math.max(0, resource.used - Math.max(resource.effective, 0));
  const buySlotsCount =
    resource.hard_cap >= 0 && resource.effective >= 0
      ? Math.max(0, resource.hard_cap - resource.effective)
      : 0;

  const base = {
    kind,
    reason,
    showPrice: checkoutAvailable === true && planKey !== "FREE" && canBuy,
    removeCount,
    buySlotsCount,
  };

  if (isBypass) {
    return { ...base, copyKey: "bypass", cta: { type: "none" }, showPrice: false };
  }

  if (activation === "PAST_DUE") {
    return {
      ...base,
      copyKey: "inactive_past_due",
      cta: { type: "inactive", disabled: true, key: "past_due" },
      showPrice: false,
    };
  }

  if (activation === "CANCELED") {
    return {
      ...base,
      copyKey: "inactive_canceled",
      cta: { type: "inactive", disabled: true, key: "canceled" },
      showPrice: false,
    };
  }

  if (reason === "unlimited") {
    return { ...base, copyKey: "unlimited", cta: { type: "none" }, showPrice: false };
  }

  if (reason === "at_cap") {
    return {
      ...base,
      copyKey: state === "over_limit" ? "over_limit" : "at_cap",
      cta: { type: "view_plans", disabled: false },
      showPrice: false,
    };
  }

  if (reason === "cycle_quota") {
    return {
      ...base,
      copyKey: "cycle_quota",
      cta: { type: "view_plans", disabled: false },
      showPrice: false,
    };
  }

  if (reason === "checkout_unavailable" || reason === "free_plan") {
    if (state === "over_limit") {
      return {
        ...base,
        copyKey: "over_limit",
        cta: { type: "coming_soon", disabled: true },
        showPrice: false,
      };
    }
    if (state === "at_limit") {
      return {
        ...base,
        copyKey: "at_limit",
        cta: { type: "coming_soon", disabled: true },
        showPrice: false,
      };
    }
    return {
      ...base,
      copyKey: "ok",
      cta: { type: "coming_soon", disabled: true },
      showPrice: false,
    };
  }

  // can_buy path (reason null)
  if (state === "over_limit") {
    return {
      ...base,
      copyKey: "over_limit",
      cta: { type: "buy", disabled: false },
      showPrice: true,
    };
  }

  if (state === "at_limit") {
    return {
      ...base,
      copyKey: "at_limit",
      cta: { type: "buy", disabled: false },
      showPrice: true,
    };
  }

  return {
    ...base,
    copyKey: "ok",
    cta: { type: "buy", disabled: false },
    showPrice: true,
  };
}

export function normalizePackNeed(raw: string | null): "clicks" | "domains" | "campaigns" | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v === "clicks" || v === "click") return "clicks";
  if (v === "domains" || v === "domain") return "domains";
  if (v === "campaigns" || v === "campaign") return "campaigns";
  return null;
}

export function normalizePackFrom(raw: string | null): "domains" | "campaigns" | "dashboard" | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v === "domains" || v === "campaigns" || v === "dashboard") return v;
  return null;
}

export function formatPackPriceUsd(cents: number | null | undefined): string | null {
  if (cents == null || !Number.isFinite(cents)) return null;
  return `$${(cents / 100).toFixed(2)}`;
}
