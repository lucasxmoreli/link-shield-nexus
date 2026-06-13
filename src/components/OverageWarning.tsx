import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { X, AlertTriangle, Rocket } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function OverageWarning() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isModalDismissed, setIsModalDismissed] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile-suspended", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("is_suspended")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  if (isLoading || !profile?.is_suspended) return null;

  const goToBilling = () => navigate("/billing");

  // ── Persistent Banner (after modal dismiss) ──
  if (isModalDismissed) {
    return (
      <div className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="text-xs sm:text-sm font-medium text-destructive truncate">
            {t("overage.bannerText")}
          </p>
        </div>
        <Button
          size="sm"
          variant="destructive"
          className="shrink-0 text-xs"
          onClick={goToBilling}
        >
          {t("overage.bannerBtn")}
        </Button>
      </div>
    );
  }

  // ── Glassmorphism Modal ──
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />

      {/* Card */}
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card/95 backdrop-blur-md p-6 sm:p-8 shadow-2xl space-y-5 animate-in fade-in-0 zoom-in-95 duration-300">
        {/* Close */}
        <button
          onClick={() => setIsModalDismissed(true)}
          className="absolute right-4 top-4 rounded-sm text-muted-foreground hover:text-foreground transition-opacity"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">{t("common.close")}</span>
        </button>

        {/* Icon */}
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Rocket className="h-7 w-7 text-primary" />
        </div>

        {/* Text */}
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-foreground">
            {t("overage.modalTitle")}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("overage.modalDesc")}
          </p>
        </div>

        {/* CTA */}
        <Button className="w-full" size="lg" onClick={goToBilling}>
          {t("overage.modalBtn")}
        </Button>
      </div>
    </div>
  );
}
