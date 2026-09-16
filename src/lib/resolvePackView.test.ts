import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolvePackView, type PackViewInput } from "./resolvePackView";
import type { BillingPack, BillingResource } from "@/hooks/useBillingState";

function resource(partial: Partial<BillingResource>): BillingResource {
  return {
    base: 1,
    pack_extra: 0,
    effective: 1,
    hard_cap: 3,
    used: 0,
    state: "ok",
    ...partial,
  };
}

function pack(partial: Partial<BillingPack>): BillingPack {
  return {
    bought_this_cycle: 0,
    max_per_cycle: 2,
    unit_size: 1,
    unit_price_cents: 6700,
    can_buy: false,
    reason: "checkout_unavailable",
    ...partial,
  };
}

function base(over: Partial<PackViewInput> = {}): PackViewInput {
  return {
    kind: "capacity",
    resource: resource({}),
    pack: pack({}),
    activation: "ACTIVE",
    isBypass: false,
    checkoutAvailable: false,
    planKey: "BASIC",
    ...over,
  };
}

describe("resolvePackView", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("R-D: bypass → read-only, no CTA, no price", () => {
    const v = resolvePackView(base({ isBypass: true, pack: pack({ reason: "at_cap" }) }));
    expect(v.copyKey).toBe("bypass");
    expect(v.cta).toEqual({ type: "none" });
    expect(v.showPrice).toBe(false);
  });

  it("R-C: PAST_DUE ignores reason free_plan quirk", () => {
    const v = resolvePackView(
      base({
        activation: "PAST_DUE",
        pack: pack({ reason: "free_plan" }),
      }),
    );
    expect(v.copyKey).toBe("inactive_past_due");
    expect(v.cta).toEqual({ type: "inactive", disabled: true, key: "past_due" });
  });

  it("R-C: CANCELED", () => {
    const v = resolvePackView(base({ activation: "CANCELED" }));
    expect(v.copyKey).toBe("inactive_canceled");
  });

  it("unlimited campaigns", () => {
    const v = resolvePackView(
      base({
        resource: resource({ effective: -1, hard_cap: -1, state: "ok" }),
        pack: pack({ reason: "unlimited", unit_price_cents: null }),
      }),
    );
    expect(v.copyKey).toBe("unlimited");
    expect(v.cta.type).toBe("none");
  });

  it("at_cap → view_plans", () => {
    const v = resolvePackView(
      base({
        resource: resource({ effective: 3, hard_cap: 3, used: 3, state: "at_limit" }),
        pack: pack({ reason: "at_cap" }),
      }),
    );
    expect(v.copyKey).toBe("at_cap");
    expect(v.cta).toEqual({ type: "view_plans", disabled: false });
  });

  it("cycle_quota → view_plans discreet path", () => {
    const v = resolvePackView(
      base({
        kind: "quota",
        pack: pack({ reason: "cycle_quota", bought_this_cycle: 2, max_per_cycle: 2 }),
      }),
    );
    expect(v.copyKey).toBe("cycle_quota");
    expect(v.cta.type).toBe("view_plans");
  });

  it("over_limit + checkout_unavailable → coming_soon + arithmetic", () => {
    const v = resolvePackView(
      base({
        resource: resource({ used: 3, effective: 1, hard_cap: 3, state: "over_limit" }),
        pack: pack({ reason: "checkout_unavailable" }),
      }),
    );
    expect(v.copyKey).toBe("over_limit");
    expect(v.removeCount).toBe(2);
    expect(v.buySlotsCount).toBe(2);
    expect(v.cta).toEqual({ type: "coming_soon", disabled: true });
    expect(v.showPrice).toBe(false);
  });

  it("W1: never show price while checkout_available=false", () => {
    const v = resolvePackView(base({ checkoutAvailable: false }));
    expect(v.showPrice).toBe(false);
  });

  it("null reason → checkout_unavailable + warn", () => {
    const v = resolvePackView(base({ pack: pack({ reason: null }) }));
    expect(v.reason).toBe("checkout_unavailable");
    expect(warn).toHaveBeenCalled();
  });

  it("unknown reason → checkout_unavailable + warn", () => {
    const v = resolvePackView(base({ pack: pack({ reason: "available" as BillingPack["reason"] }) }));
    expect(v.reason).toBe("checkout_unavailable");
    expect(warn).toHaveBeenCalled();
  });

  it("at_limit → coming_soon while checkout off", () => {
    const v = resolvePackView(
      base({
        resource: resource({ used: 1, effective: 1, state: "at_limit" }),
      }),
    );
    expect(v.copyKey).toBe("at_limit");
    expect(v.cta.type).toBe("coming_soon");
  });

  it("can_buy + checkout on → buy CTA + price", () => {
    const v = resolvePackView(
      base({
        checkoutAvailable: true,
        pack: pack({ can_buy: true, reason: null, unit_price_cents: 700 }),
      }),
    );
    expect(v.cta).toEqual({ type: "buy", disabled: false });
    expect(v.showPrice).toBe(true);
  });
});
