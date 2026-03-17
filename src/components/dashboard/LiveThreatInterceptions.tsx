import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, Globe, Wifi } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";

function maskIp(ip: string | null): string {
  if (!ip) return "***.***.***.***";
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.***.***`;
  return ip.replace(/.{3}$/, "***");
}

const ACTION_META: Record<string, { icon: typeof ShieldAlert; label: string; color: string }> = {
  bot_blocked: { icon: ShieldAlert, label: "Bot blocked", color: "text-destructive" },
  safe_page: { icon: Globe, label: "Redirected to safe page", color: "text-amber-500" },
};

export function LiveThreatInterceptions() {
  const { user } = useAuth();

  const { data: threats = [], isLoading } = useQuery({
    queryKey: ["threat_interceptions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requests_log")
        .select("id, action_taken, created_at, ip_address, country_code, campaign_id, campaigns(name)")
        .in("action_taken", ["bot_blocked", "safe_page"])
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data;
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
            Live Threat Interceptions
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
            </span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Monitoring</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1 px-4 pb-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)
        ) : threats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <ShieldAlert className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No threats intercepted yet.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Threats will appear here in real-time.</p>
          </div>
        ) : (
          threats.map((t) => {
            const meta = ACTION_META[t.action_taken] ?? ACTION_META.bot_blocked;
            const Icon = meta.icon;
            const campaignName = (t.campaigns as any)?.name ?? "Unknown Campaign";
            const timeAgo = formatDistanceToNow(new Date(t.created_at), { addSuffix: false });
            const shortTime = timeAgo
              .replace("less than a minute", "Just now")
              .replace(" minutes", "m")
              .replace(" minute", "m")
              .replace(" hours", "h")
              .replace(" hour", "h")
              .replace(" days", "d")
              .replace(" day", "d")
              .replace("about ", "");

            return (
              <div
                key={t.id}
                className="flex items-start gap-3 rounded-lg border border-border/50 bg-secondary/30 px-3 py-2.5 transition-colors hover:bg-secondary/50"
              >
                <div className="mt-0.5 shrink-0">
                  <div className={`rounded-md bg-destructive/10 p-1.5 ${meta.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-snug text-foreground">
                    <span className="font-medium">{meta.label}</span>
                    {" on "}
                    <span className="font-mono text-primary">{campaignName}</span>
                  </p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    IP {maskIp(t.ip_address)}
                    {t.country_code && <span className="ml-2">· {t.country_code}</span>}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground font-mono mt-0.5">
                  {shortTime === "Just now" ? shortTime : `${shortTime} ago`}
                </span>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
