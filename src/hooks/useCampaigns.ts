import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface CampaignRow {
  id: string;
  name: string;
  hash: string;
  user_id: string;
  domain: string | null;
  traffic_source: string;
  safe_url: string;
  offer_url: string;
  offer_page_b: string | null;
  safe_page_method: string;
  offer_page_method: string;
  target_countries: string[] | null;
  target_devices: string[] | null;
  tags: string[] | null;
  strict_mode: boolean;
  postback_url: string | null;
  postback_method: string;
  is_active: boolean | null;
  created_at: string;
}

export function useCampaigns() {
  const { effectiveUserId } = useAuth();

  const { data: campaigns = [], isLoading, error } = useQuery({
    queryKey: ["campaigns", effectiveUserId],
    queryFn: async (): Promise<CampaignRow[]> => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("user_id", effectiveUserId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CampaignRow[];
    },
    enabled: !!effectiveUserId,
  });

  return { campaigns, isLoading, error };
}

export function useCampaignsList() {
  const { effectiveUserId } = useAuth();

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns-list", effectiveUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name, hash")
        .eq("user_id", effectiveUserId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveUserId,
  });

  return { campaigns, isLoading };
}

export function useCampaignsCount() {
  const { effectiveUserId } = useAuth();

  const { data: count = 0, isLoading } = useQuery({
    queryKey: ["campaigns-count", effectiveUserId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("campaigns")
        .select("*", { count: "exact", head: true })
        .eq("user_id", effectiveUserId!);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!effectiveUserId,
  });

  return { campaignsCount: count, isLoading };
}

export function useHasActiveCampaign() {
  const { effectiveUserId } = useAuth();

  const { data: hasActive = false, isLoading } = useQuery({
    queryKey: ["active-campaigns", effectiveUserId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("campaigns")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("user_id", effectiveUserId!);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    enabled: !!effectiveUserId,
  });

  return { hasActiveCampaign: hasActive, isLoading };
}

export function useCampaign(id: string | undefined) {
  const { data: campaign, isLoading, error } = useQuery({
    queryKey: ["campaign", id],
    queryFn: async (): Promise<CampaignRow | null> => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as CampaignRow;
    },
    enabled: !!id,
  });

  return { campaign, isLoading, error };
}
