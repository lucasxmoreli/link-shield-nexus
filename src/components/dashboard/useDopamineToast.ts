import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { subHours } from "date-fns";
import { useTranslation } from "react-i18next";

const PLAN_THRESHOLDS: Record<string, number> = {
  Free: 15, "Basic Plan": 15, "BASIC PLAN": 15,
  "Pro Plan": 50, "PRO PLAN": 50,
  "Freedom Plan": 200, "FREEDOM PLAN": 200,
  "Enterprise Conquest": 500, "ENTERPRISE CONQUEST": 500,
};

function getThreshold(planName: string | null | undefined): number {
  if (!planName) return 25;
  return PLAN_THRESHOLDS[planName] ?? 25;
}

export function useDopamineToast() {
  const { user } = useAuth();
  const firedRef = useRef(false);
  const { t } = useTranslation();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("plan_name").eq("user_id", user!.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const since = subHours(new Date(), 24).toISOString();

  // Fetch from the View instead of requests_log
  const { data: blockedData } = useQuery({
    queryKey: ["blocked_24h_view", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dashboard_analytics_view" as any)
        .select("motivo_limpo")
        .eq("action_taken", "bot_blocked")
        .gte("created_at", since);
      if (error) throw error;
      return data as unknown as Array<{ motivo_limpo: string | null }>;
    },
    enabled: !!user,
  });

  const blockedCount = blockedData?.length ?? 0;

  // Find the top threat reason
  const topThreat = (() => {
    if (!blockedData || blockedData.length === 0) return null;
    const counts: Record<string, number> = {};
    blockedData.forEach(d => {
      const reason = d.motivo_limpo || "Desconhecido";
      counts[reason] = (counts[reason] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  })();

  useEffect(() => {
    if (firedRef.current || blockedCount === 0 || !profile) return;
    const threshold = getThreshold(profile.plan_name);
    if (blockedCount < threshold) return;
    firedRef.current = true;
    const timer = setTimeout(() => {
      const desc = t("dopamine.description", { count: blockedCount.toLocaleString() } as any);
      const threatLine = topThreat ? `\n${t("dopamine.topThreat", { reason: topThreat } as any)}` : "";
      toast({
        title: String(t("dopamine.title")),
        description: String(desc) + threatLine,
      });
    }, 2800);
    return () => clearTimeout(timer);
  }, [blockedCount, profile, t, topThreat]);
}
