import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowRight } from "lucide-react";
import { getPlanByName } from "@/lib/plan-config";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "@/components/LanguageSelector";

export default function AccountSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: domainsCount = 0 } = useQuery({
    queryKey: ["domains-count", user?.id],
    queryFn: async () => {
      const { count, error } = await supabase.from("domains").select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
  });

  const { data: campaignsCount = 0 } = useQuery({
    queryKey: ["campaigns-count", user?.id],
    queryFn: async () => {
      const { count, error } = await supabase.from("campaigns").select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
  });

  const activePlan = getPlanByName(profile?.plan_name);
  const planName = profile?.plan_name ?? "Free";
  const isFreePlan = planName.toLowerCase() === "free";

  const maxClicks = (profile?.max_clicks && profile.max_clicks > 0) ? profile.max_clicks : activePlan.maxClicksLimit;
  const currentClicks = profile?.current_clicks ?? 0;
  const rawUsagePercent = maxClicks > 0 ? (currentClicks / maxClicks) * 100 : 0;
  const usagePercent = Math.round(rawUsagePercent);
  const usageDisplay = currentClicks > 0 && rawUsagePercent < 1 ? "< 1" : `${usagePercent}`;
  const progressValue = currentClicks > 0 && usagePercent < 1 ? 1 : usagePercent;

  const maxDomains = profile?.max_domains || activePlan.maxDomains;
  const domainsPercent = maxDomains > 0 ? Math.round((domainsCount / maxDomains) * 100) : 0;

  const maxCampaigns = activePlan.maxCampaigns;
  const campaignsUnlimited = maxCampaigns === -1;
  const campaignsPercent = maxCampaigns > 0 ? Math.round((campaignsCount / maxCampaigns) * 100) : 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-2xl">
      <h1 className="text-xl sm:text-2xl font-bold">{t("settings.title")}</h1>

      <Card className="border-border bg-card">
        <CardHeader><CardTitle className="text-lg">{t("settings.profile")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("settings.email")}</span>
            <span className="font-mono text-sm">{profile?.email ?? user?.email ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("settings.plan")}</span>
            <Badge className="bg-primary/20 text-primary border-0">{planName}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("common.status")}</span>
            {isFreePlan ? (
              <Badge className="bg-muted text-muted-foreground border-0">{t("settings.freePlanStatus")}</Badge>
            ) : (
              <Badge className="bg-success/20 text-success border-0">{t("common.active")}</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Language Selector */}
      <Card className="border-border bg-card">
        <CardHeader><CardTitle className="text-lg">{t("settings.language")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("settings.languageDesc")}</p>
          <LanguageSelector variant="full" />
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader><CardTitle className="text-lg">{t("settings.planUsage")}</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          {/* Clicks */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("settings.clicksUsed")}</span>
              <span className="font-mono">
                {isFreePlan ? "— / —" : `${currentClicks.toLocaleString()} / ${maxClicks > 0 ? maxClicks.toLocaleString() : "0"}`}
              </span>
            </div>
            {isFreePlan ? (
              <p className="text-xs text-muted-foreground">{t("settings.noClicksIncluded")}</p>
            ) : (
              <>
                <Progress value={progressValue} className="h-3 bg-secondary" />
                <p className="text-xs text-muted-foreground">{t("settings.ofLimitUsed", { percent: usageDisplay })}</p>
              </>
            )}
          </div>

          {/* Domains */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("settings.domainsUsed")}</span>
              <span className="font-mono">
                {isFreePlan || maxDomains <= 0 ? "— / —" : `${domainsCount} / ${maxDomains}`}
              </span>
            </div>
            {isFreePlan || maxDomains <= 0 ? (
              <p className="text-xs text-muted-foreground">{t("settings.noDomainsIncluded")}</p>
            ) : (
              <>
                <Progress value={domainsPercent} className="h-3 bg-secondary" />
                <p className="text-xs text-muted-foreground">{t("settings.ofLimitUsed", { percent: domainsPercent })}</p>
              </>
            )}
          </div>

          {/* Campaigns */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("settings.campaignsCreated")}</span>
              <span className="font-mono">
                {isFreePlan ? "— / —" : campaignsUnlimited ? campaignsCount.toLocaleString() : `${campaignsCount.toLocaleString()} / ${maxCampaigns}`}
              </span>
            </div>
            {isFreePlan ? (
              <p className="text-xs text-muted-foreground">{t("settings.noCampaignsIncluded")}</p>
            ) : campaignsUnlimited ? (
              <Badge variant="secondary" className="text-[10px] tracking-wider">{t("settings.unlimitedAccess")}</Badge>
            ) : maxCampaigns > 0 ? (
              <>
                <Progress value={campaignsPercent} className="h-3 bg-secondary" />
                <p className="text-xs text-muted-foreground">{t("settings.ofLimitUsed", { percent: campaignsPercent })}</p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">{t("settings.upgradeForCampaigns")}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={() => navigate("/billing")}
        className="w-full h-14 text-base font-semibold bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-500 text-primary-foreground shadow-[0_0_20px_hsl(271_81%_56%/0.3)] hover:shadow-[0_0_30px_hsl(271_81%_56%/0.5)] transition-all duration-300"
      >
        {t("settings.seePlans")}
        <ArrowRight className="ml-2 h-5 w-5" />
      </Button>
    </div>
  );
}
