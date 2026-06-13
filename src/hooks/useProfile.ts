import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getPlanByName, type PlanData } from "@/lib/plan-config";

export interface ProfileData {
  id: string;
  user_id: string;
  email: string | null;
  plan_name: string | null;
  current_clicks: number | null;
  max_clicks: number | null;
  max_domains: number | null;
  is_suspended: boolean;
  subscription_status: string | null;
  billing_cycle_start: string | null;
  billing_cycle_end: string | null;
  language: string;
  created_at: string;
  updated_at: string;
  // Derived column (see migration 20260419150000_fix_activation_status_rule).
  // Ground truth for the workspace paywall: only "ACTIVE" unlocks gated
  // features; everything else (INVITED / PAST_DUE / CANCELED) is locked.
  activation_status: string | null;
}

export function useProfile() {
  const { effectiveUserId } = useAuth();

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ["profile", effectiveUserId],
    queryFn: async (): Promise<ProfileData | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", effectiveUserId!)
        .maybeSingle();
      if (error) throw error;
      return data as ProfileData | null;
    },
    enabled: !!effectiveUserId,
    staleTime: 30_000,
  });

  const planConfig: PlanData = getPlanByName(profile?.plan_name);
  const planName = profile?.plan_name ?? "Free";
  // Paywall ground truth — do NOT derive from `plan_name` (inconsistent
  // across seeds/legacy rows). The DB-generated `activation_status` column
  // is the single source of truth for whether the workspace is unlocked.
  const isActive = profile?.activation_status === "ACTIVE";

  return { profile, planConfig, planName, isActive, isLoading, error };
}
