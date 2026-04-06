import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface DomainRow {
  id: string;
  url: string;
  user_id: string;
  is_verified: boolean | null;
  ssl_status: string | null;
  cloudflare_hostname_id: string | null;
  created_at: string;
}

export function useDomains() {
  const { effectiveUserId } = useAuth();

  const { data: domains = [], isLoading, error } = useQuery({
    queryKey: ["domains", effectiveUserId],
    queryFn: async (): Promise<DomainRow[]> => {
      const { data, error } = await supabase
        .from("domains")
        .select("*")
        .eq("user_id", effectiveUserId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as DomainRow[];
    },
    enabled: !!effectiveUserId,
  });

  const verifiedDomains = domains.filter((d) => d.is_verified);
  const domainsCount = domains.length;

  return { domains, verifiedDomains, domainsCount, isLoading, error };
}

export function useDomainsCount() {
  const { effectiveUserId } = useAuth();

  const { data: count = 0, isLoading } = useQuery({
    queryKey: ["domains-count", effectiveUserId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("domains")
        .select("*", { count: "exact", head: true })
        .eq("user_id", effectiveUserId!);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!effectiveUserId,
  });

  return { domainsCount: count, isLoading };
}
