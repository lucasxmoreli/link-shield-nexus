import { useQuery } from "@tanstack/react-query";
import { Globe, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", BR: "Brazil", IN: "India", CN: "China", RU: "Russia",
  DE: "Germany", FR: "France", GB: "United Kingdom", JP: "Japan", KR: "South Korea",
  NG: "Nigeria", PH: "Philippines", ID: "Indonesia", VN: "Vietnam", PK: "Pakistan",
  BD: "Bangladesh", MX: "Mexico", TH: "Thailand", UA: "Ukraine", EG: "Egypt",
  AR: "Argentina", CO: "Colombia", ZA: "South Africa", TR: "Turkey", PL: "Poland",
};

function getCountryName(code: string): string {
  return COUNTRY_NAMES[code] || code;
}

function getFlagEmoji(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return "🌍";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export function TopAttackOrigins() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const { data: origins = [], isLoading } = useQuery({
    queryKey: ["top_attack_origins", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dashboard_analytics_view")
        .select("country_code")
        .eq("status_final", "Bloqueado");
      if (error) throw error;

      const counts: Record<string, number> = {};
      (data as any[]).forEach((row) => {
        const cc = row.country_code || "??";
        counts[cc] = (counts[cc] || 0) + 1;
      });

      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([code, total]) => ({ code, total }));
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  const maxTotal = origins.length > 0 ? origins[0].total : 1;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Globe className="h-4 w-4 text-destructive" />
            {t("dashboard.topAttackOrigins")}
          </CardTitle>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
              {t("dashboard.globalShield")}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))
        ) : origins.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Globe className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">{t("dashboard.noAttackData")}</p>
          </div>
        ) : (
          origins.map((origin, idx) => {
            const pct = Math.round((origin.total / maxTotal) * 100);
            return (
              <div key={origin.code} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-base leading-none">{getFlagEmoji(origin.code)}</span>
                    <span className="font-medium text-foreground">
                      {getCountryName(origin.code)}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">({origin.code})</span>
                  </div>
                  <span className="font-mono font-semibold text-destructive text-sm">
                    {origin.total.toLocaleString()}
                  </span>
                </div>
                <Progress
                  value={pct}
                  className="h-2 bg-secondary"
                />
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
