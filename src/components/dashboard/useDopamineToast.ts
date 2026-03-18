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

  const { data: blockedCount } = useQuery({
    queryKey: ["blocked_24h", user?.id],
    queryFn: async () => {
      const since = subHours(new Date(), 24).toISOString();
      const { count, error } = await supabase
        .from("requests_log")
        .select("id", { count: "exact", head: true })
        .in("action_taken", ["bot_blocked", "safe_page"])
        .gte("created_at", since);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (firedRef.current || blockedCount == null || !profile) return;
    const threshold = getThreshold(profile.plan_name);
    if (blockedCount < threshold) return;
    firedRef.current = true;
    const timer = setTimeout(() => {
      toast({
        title: t("dopamine.title") as string,
        description: t("dopamine.description", { count: blockedCount.toLocaleString() }) as string,
      });
    }, 2800);
    return () => clearTimeout(timer);
  }, [blockedCount, profile, t]);
}
