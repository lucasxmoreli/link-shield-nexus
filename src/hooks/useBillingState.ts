import { useQuery } from "@tanstack/react-query";
import { supabaseUntyped } from "@/integrations/supabase/untyped";
import { useAuth } from "@/hooks/useAuth";

export type BillingResourceState = "ok" | "at_limit" | "over_limit";

export interface BillingResource {
  base: number;
  pack_extra: number;
  effective: number;
  hard_cap: number;
  used: number;
  state: BillingResourceState;
}

export interface BillingPack {
  bought_this_cycle: number;
  max_per_cycle: number;
  unit_size: number;
  unit_price_cents: number | null;
  can_buy: boolean;
  reason: string | null;
}

export interface BillingState {
  plan: {
    name: string | null;
    key: string;
    activation_status: string | null;
    subscription_status: string | null;
    billing_cycle_start: string | null;
    billing_cycle_end: string | null;
    is_admin_bypass: boolean;
    checkout_available: boolean;
  };
  resources: {
    clicks: BillingResource;
    domains: BillingResource;
    campaigns: BillingResource;
  };
  packs: {
    clicks: BillingPack;
    domains: BillingPack;
    campaigns: BillingPack;
  };
}

/** R3: staleTime curto — após add/delete invalide ["billing_state"]. */
export function useBillingState() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["billing_state", user?.id],
    queryFn: async (): Promise<BillingState> => {
      const { data, error } = await supabaseUntyped.rpc("get_billing_state");
      if (error) throw error;
      return data as BillingState;
    },
    enabled: !!user,
    staleTime: 30_000,
    retry: false,
  });
}

/** Gate visual: ACTIVE + effective > 0 (ou -1) e used < effective. */
export function canCreateResource(
  activation: string | null | undefined,
  resource: BillingResource | undefined,
): boolean {
  if (activation !== "ACTIVE") return false;
  if (!resource) return false;
  if (resource.effective < 0) return true;
  return resource.used < resource.effective;
}
