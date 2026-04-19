import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Loader2, ArrowLeft, Eye, EyeOff, Lock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "@/components/LanguageSelector";
import {
  calculatePasswordStrength,
  isPasswordAcceptable,
  getPasswordStrengthPct,
  getPasswordStrengthColor,
} from "@/lib/password-validation";
import { PasswordCriteriaList } from "@/components/profile/PasswordCriteriaList";

/**
 * Tela de atualização de senha (fluxo de recovery).
 * Accessível via link enviado por e-mail (supabase.auth.resetPasswordForEmail)
 * → Supabase client auto-parseia o hash fragment (#access_token=...&type=recovery)
 * e cria uma sessão temporária de recuperação. A partir daí, updateUser funciona.
 */
export default function UpdatePassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Detecta a sessão de recovery. O client Supabase já parseia o hash automaticamente
  // no mount (detectSessionInUrl default=true). Se já houver sessão OU o evento
  // PASSWORD_RECOVERY disparar, liberamos o formulário.
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) setRecoveryReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || session) setRecoveryReady(true);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Validações
  const strength = calculatePasswordStrength(password);
  const strengthPct = getPasswordStrengthPct(password);
  const strengthColors = getPasswordStrengthColor(strength);
  const passwordAcceptable = isPasswordAcceptable(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const strengthLabel =
    strength === "empty" ? "" :
    strength === "weak" ? t("password.strengthWeak") :
    strength === "medium" ? t("password.strengthMedium") :
    t("password.strengthStrong");

  const canSubmit = !loading && passwordAcceptable && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Defesa client-side
    if (!passwordAcceptable) {
      toast.error(t("password.notAcceptable"));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t("updatePassword.passwordsDoNotMatch"));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        // Erros comuns: "Auth session missing" (link expirado) / "New password should be different"
        console.error("[update-password] updateUser failed:", error.message);
        toast.error(error.message || t("updatePassword.updateFailed"));
        setLoading(false);
        return;
      }

      toast.success(t("updatePassword.updateSuccess"));
      setPassword("");
      setConfirmPassword("");
      // Pequeno delay pra usuário ver o toast antes do redirect
      setTimeout(() => navigate("/dashboard"), 800);
    } catch (err) {
      console.error("[update-password] unexpected error:", err);
      toast.error(t("updatePassword.updateFailed"));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Painel lateral esquerdo (branding) — idêntico ao Auth.tsx */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(271_81%_56%/0.2),transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,hsl(271_81%_56%/0.05)_0%,transparent_50%,hsl(271_81%_56%/0.08)_100%)]" />
        <div className="relative z-10 max-w-md px-12 space-y-8">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-primary/15 flex items-center justify-center">
              <Shield className="h-7 w-7 text-primary" />
            </div>
            <span className="text-2xl font-bold tracking-tight">CloakerX</span>
          </div>
          <div className="space-y-4">
            <h2 className="text-3xl font-bold leading-tight">
              {t("updatePassword.sidebarTitle")}
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed">
              {t("updatePassword.sidebarDescription")}
            </p>
          </div>
        </div>
      </div>

      {/* Painel direito — formulário */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between p-6">
          <Link
            to="/auth"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("common.back")}
          </Link>
          <LanguageSelector />
        </div>

        <div className="flex-1 flex items-center justify-center px-6 pb-12">
          <div className="w-full max-w-sm space-y-8">
            <div className="lg:hidden flex items-center gap-2 justify-center">
              <Shield className="h-7 w-7 text-primary" />
              <span className="text-xl font-bold">CloakerX</span>
            </div>

            <div className="space-y-2 text-center lg:text-left">
              <h1 className="text-2xl font-bold tracking-tight">
                {t("updatePassword.title")}
              </h1>
              <p className="text-muted-foreground text-sm">
                {t("updatePassword.subtitle")}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* New Password */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  {t("updatePassword.newPasswordLabel")}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder={t("auth.passwordPlaceholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="pl-10 pr-10 h-11 bg-secondary/50 border-border focus:border-primary/50 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Barra de força */}
                {password.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {t("password.strengthLabel")}
                      </span>
                      <span className={`font-medium ${strengthColors.text}`}>
                        {strengthLabel}
                      </span>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${strengthColors.bg}`}
                        style={{ width: `${strengthPct}%` }}
                      />
                    </div>
                  </div>
                )}

                <PasswordCriteriaList password={password} />
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  {t("updatePassword.confirmPasswordLabel")}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type={showConfirm ? "text" : "password"}
                    placeholder={t("auth.passwordPlaceholder")}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="pl-10 pr-10 h-11 bg-secondary/50 border-border focus:border-primary/50 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Feedback de match */}
                {confirmPassword.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs pt-1">
                    {passwordsMatch ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                        <span className="text-success">
                          {t("updatePassword.passwordsMatch")}
                        </span>
                      </>
                    ) : (
                      <span className="text-destructive">
                        {t("updatePassword.passwordsDoNotMatch")}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-11 text-sm font-semibold"
                disabled={!canSubmit || !recoveryReady}
              >
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t("updatePassword.submitButton")}
              </Button>

              {!recoveryReady && (
                <p className="text-xs text-center text-muted-foreground leading-relaxed">
                  {t("updatePassword.validatingSession")}
                </p>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
