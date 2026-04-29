import { useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Circle, Globe, Target, Rocket } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";

/**
 * OnboardingWizard — checklist de "primeiros 3 passos" pra usuários novos.
 *
 * ─── PR-3d.1: Dispensa permanente ─────────────────────────────────────
 * ANTES: o passo 3 ("Ativar campanha") era derivado de uma query LIVE em
 *        campaigns.is_active. Se o usuário pausasse todas as campanhas, o
 *        card reaparecia — comportamento errado pra quem já passou pelo
 *        onboarding e tava só gerenciando tráfego.
 *
 * AGORA: o card depende de profiles.onboarding_completed_at:
 *   • NULL    → renderiza normal, com os 3 passos derivados das queries
 *   • NOT NULL → return null imediato (sem queries extras, sem renderização)
 *
 * O UPDATE da flag é disparado UMA VEZ via useEffect quando os 3 passos
 * ficam todos true. WHERE onboarding_completed_at IS NULL no payload garante
 * idempotência sob race (segundo client-side dispatch não sobrescreve).
 * ────────────────────────────────────────────────────────────────────────
 */
export function OnboardingWizard() {
  const { user, effectiveUserId } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // ─── QUERY 0: dispensa permanente (curto-circuito antes de tudo) ─────
  // Cobre a regra de negócio: "se o usuário já completou os 3 passos
  // alguma vez na vida, o card desaparece pra sempre".
  const { data: onboardingCompletedAt, isLoading: loadingFlag } = useQuery({
    queryKey: ["profile-onboarding-flag", effectiveUserId],
    queryFn: async () => {
      // [PR-3d.1] Cast localizado: coluna onboarding_completed_at é nova
      // (migration PR-3d.1) e ainda não está nos types gerados. Remover
      // os `as any` quando rodar `supabase gen types typescript ...`.
      const { data, error } = await supabase
        .from("profiles")
        .select("onboarding_completed_at" as any)
        .eq("user_id", effectiveUserId!)
        .maybeSingle();
      if (error) throw error;
      // null OU undefined = ainda não completou. Date string = completou.
      return ((data as any)?.onboarding_completed_at ?? null) as string | null;
    },
    enabled: !!effectiveUserId,
    // Cache agressivo: a flag é write-once-never-toggle, não precisa refetch
    // automático. Só invalidamos manualmente após o UPDATE de auto-dispensa.
    staleTime: 5 * 60 * 1000, // 5 min
  });

  const dismissedPermanently = onboardingCompletedAt !== null;

  // ─── QUERIES 1-3: passos derivados (só rodam se ainda não dispensado) ──
  // enabled: false quando dismissedPermanently=true → zero requests pro DB
  // depois que o usuário fechou o onboarding pela primeira vez.
  const { data: domainsCount = 0 } = useQuery({
    queryKey: ["domains-count", effectiveUserId],
    queryFn: async () => {
      const { count, error } = await supabase.from("domains").select("*", { count: "exact", head: true }).eq("user_id", effectiveUserId!);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!effectiveUserId && !dismissedPermanently,
  });

  const { data: campaignsCount = 0 } = useQuery({
    queryKey: ["campaigns-count", effectiveUserId],
    queryFn: async () => {
      const { count, error } = await supabase.from("campaigns").select("*", { count: "exact", head: true }).eq("user_id", effectiveUserId!);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!effectiveUserId && !dismissedPermanently,
  });

  const { data: hasActiveCampaign = false } = useQuery({
    queryKey: ["active-campaigns", effectiveUserId],
    queryFn: async () => {
      const { count, error } = await supabase.from("campaigns").select("*", { count: "exact", head: true }).eq("is_active", true).eq("user_id", effectiveUserId!);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    enabled: !!effectiveUserId && !dismissedPermanently,
  });

  // ─── MUTATION: marca onboarding_completed_at = now() no DB ──────────
  // WHERE onboarding_completed_at IS NULL no UPDATE → idempotente sob race
  // (se 2 tabs do mesmo user dispararem simultâneo, só uma escreve).
  const completeMutation = useMutation({
    mutationFn: async () => {
      // [PR-3d.1] Cast localizado pelo mesmo motivo do select acima.
      const { error } = await supabase
        .from("profiles")
        .update({ onboarding_completed_at: new Date().toISOString() } as any)
        .eq("user_id", effectiveUserId!)
        .is("onboarding_completed_at" as any, null);
      if (error) throw error;
    },
    onSuccess: () => {
      // Atualiza o cache local pra o card sumir imediatamente nesta sessão.
      queryClient.setQueryData(
        ["profile-onboarding-flag", effectiveUserId],
        new Date().toISOString()
      );
    },
    // Failure intencionalmente silencioso: se o UPDATE falhar (rede caiu,
    // RLS estranho), o card só vai sumir no próximo refresh. Não é bug
    // crítico que justifique poluir UI com erro.
  });

  const allStepsDone =
    !!effectiveUserId &&
    !dismissedPermanently &&
    domainsCount > 0 &&
    campaignsCount > 0 &&
    hasActiveCampaign;

  // Dispara o UPDATE persistente quando os 3 passos ficam true pela 1ª vez.
  // Guards: not loading, not in-flight, not already completed (mutation
  // status protege contra double-fire dentro da mesma sessão).
  useEffect(() => {
    if (
      allStepsDone &&
      !completeMutation.isPending &&
      !completeMutation.isSuccess
    ) {
      completeMutation.mutate();
    }
  }, [allStepsDone, completeMutation]);

  // ─── EARLY EXITS ─────────────────────────────────────────────────────
  if (!user || loadingFlag) return null;
  if (dismissedPermanently) return null;

  const steps = [
    {
      icon: Globe,
      title: t("onboarding.step1Title"),
      desc: t("onboarding.step1Desc"),
      done: domainsCount > 0,
      action: () => navigate("/domains"),
    },
    {
      icon: Target,
      title: t("onboarding.step2Title"),
      desc: t("onboarding.step2Desc"),
      done: campaignsCount > 0,
      action: () => navigate("/campaigns/new"),
    },
    {
      icon: Rocket,
      title: t("onboarding.step3Title"),
      desc: t("onboarding.step3Desc"),
      done: hasActiveCampaign,
      action: () => navigate("/campaigns"),
    },
  ];

  // Belt-and-suspenders: se por algum motivo a mutation ainda não tiver
  // confirmado mas o estado local já mostrar 3/3, esconde o card pra evitar
  // flash visual entre "100% completo" e "card sumiu".
  const allDone = steps.every((s) => s.done);
  if (allDone) return null;

  const completedCount = steps.filter((s) => s.done).length;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Rocket className="h-4 w-4 text-primary" />
          {t("onboarding.welcomeTitle")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t("onboarding.welcomeDesc")}</p>
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${(completedCount / steps.length) * 100}%` }}
            />
          </div>
          <span className="text-xs font-mono text-muted-foreground">{completedCount}/{steps.length}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {steps.map((step, i) => {
          const StepIcon = step.icon;
          return (
            <button
              key={i}
              onClick={step.done ? undefined : step.action}
              className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                step.done
                  ? "border-success/20 bg-success/5 cursor-default"
                  : "border-border/40 bg-secondary/10 hover:bg-secondary/20 cursor-pointer"
              }`}
            >
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${step.done ? "bg-success/10" : "bg-primary/10"}`}>
                <StepIcon className={`h-4 w-4 ${step.done ? "text-success" : "text-primary"}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${step.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                  {step.title}
                </p>
                <p className="text-xs text-muted-foreground">{step.desc}</p>
              </div>
              {step.done ? (
                <CheckCircle className="h-4 w-4 text-success shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground/30 shrink-0" />
              )}
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
