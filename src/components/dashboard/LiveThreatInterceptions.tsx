import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";

function maskIp(ip: string | null): string {
  if (!ip) return "***.***.***.***";
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.***.***`;
  return ip.replace(/.{3}$/, "***");
}

export function LiveThreatInterceptions() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const { data: threats = [], isLoading } = useQuery({
    queryKey: ["threat_interceptions_view", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dashboard_analytics_view" as any)
        .select("id, status_final, motivo_limpo, created_at, ip_address, country_code, campaign_name")
        .eq("status_final", "Bloqueado")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data as Array<{
        id: string;
        status_final: string;
        motivo_limpo: string | null;
        created_at: string;
        ip_address: string | null;
        country_code: string | null;
        campaign_name: string | null;
      }>;
    },
    enabled: !!user,
    refetchInterval: 15000,
  });

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-destructive" />
            {t("threats.title")}
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
            </span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">{t("common.monitoring")}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1 px-4 pb-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)
        ) : threats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <ShieldAlert className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">{t("threats.noThreats")}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{t("threats.noThreatsHelper")}</p>
          </div>
        ) : (
          threats.map((thr) => {
            const campaignName = thr.campaign_name ?? "Unknown Campaign";
            const reason = thr.motivo_limpo ?? t("threats.botBlocked");
            const timeAgo = formatDistanceToNow(new Date(thr.created_at), { addSuffix: false });
            const shortTime = timeAgo
              .replace("less than a minute", t("threats.justNow"))
              .replace(" minutes", "m").replace(" minute", "m")
              .replace(" hours", "h").replace(" hour", "h")
              .replace(" days", "d").replace(" day", "d")
              .replace("about ", "");

            return (
              <div key={thr.id} className="flex items-start gap-3 rounded-lg border border-border/50 bg-secondary/30 px-3 py-2.5 transition-colors hover:bg-secondary/50">
                <div className="mt-0.5 shrink-0">
                  <div className="rounded-md bg-destructive/10 p-1.5 text-destructive"><ShieldAlert className="h-3.5 w-3.5" /></div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-snug text-foreground">
                    <span className="font-medium">{t("threats.intercepted")}:</span>{" "}
                    <span className="text-destructive font-mono text-xs">{reason}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("threats.on")} <span className="font-mono text-primary">{campaignName}</span>
                    {" · "}IP {maskIp(thr.ip_address)}
                    {thr.country_code && <span className="ml-1">· {thr.country_code}</span>}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground font-mono mt-0.5">
                  {shortTime === t("threats.justNow") ? shortTime : `${shortTime} ago`}
                </span>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
