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
  const isFreePlan = planConfig.isFree;

  return { profile, planConfig, planName, isFreePlan, isLoading, error };
}
