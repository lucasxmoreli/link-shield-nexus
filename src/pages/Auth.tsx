import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Loader2, ArrowLeft, Eye, EyeOff, Mail, Lock, Ticket, AlertCircle } from "lucide-react";
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

type AuthView = "login" | "invite" | "register";

export default function Auth() {
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [validatedCode, setValidatedCode] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Calcula força da senha (usado só no Register)
  const strength = calculatePasswordStrength(password);
  const strengthPct = getPasswordStrengthPct(password);
  const strengthColors = getPasswordStrengthColor(strength);
  const passwordAcceptable = isPasswordAcceptable(password);

  const strengthLabel =
    strength === "empty" ? "" :
    strength === "weak" ? t("password.strengthWeak") :
    strength === "medium" ? t("password.strengthMedium") :
    t("password.strengthStrong");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message);
    } else {
      navigate("/dashboard");
    }
    setLoading(false);
  };

  // ── Dispara o e-mail de reset password via Supabase Auth. ──
  // A redirectTo é ABSOLUTA e precisa bater com a URL configurada no painel
  // Supabase (Authentication → URL Configuration → Redirect URLs).
  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error(t("auth.forgotPasswordInvalidEmail"));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/update-password`,
      });

      // Enumeration defense: sucesso genérico mesmo se o e-mail não existir.
      // O Supabase já não retorna erro de "user not found" aqui, mas mantemos
      // a mensagem neutra por precaução.
      if (error) {
        console.error("[forgot-password] resetPasswordForEmail failed:", error.message);
      }
      toast.success(t("auth.forgotPasswordSent"));
    } catch (err) {
      console.error("[forgot-password] unexpected error:", err);
      toast.success(t("auth.forgotPasswordSent"));
    } finally {
      setLoading(false);
    }
  };

  const handleValidateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setInviteError("");
    const { data: isValid, error } = await supabase.rpc("validate_invite_code", {
      p_code: inviteCode.trim().toUpperCase(),
    });
    if (error || !isValid) {
      setInviteError(t("auth.invalidInvite"));
    } else {
      setValidatedCode(inviteCode.trim().toUpperCase());
      setView("register");
      toast.success(t("auth.validCode"));
    }
    setLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    // Defesa adicional client-side (botão já bloqueia, mas paranoia é boa)
    if (!passwordAcceptable) {
      toast.error(t("password.notAcceptable"));
      return;
    }

    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("register", {
        body: { email, password, invite_code: validatedCode },
      });

      if (fnError) {
        toast.error(fnError.message || t("auth.registrationFailed"));
        setLoading(false);
        return;
      }
      if (data?.error) {
        toast.error(data.error);
        setLoading(false);
        return;
      }

      // ── Conta criada. Auto-login imediato pra eliminar fricção do onboarding. ──
      // A edge function já confirma o e-mail (email_confirm: true), então
      // signInWithPassword aqui funciona na mesma chamada — sem round-trip
      // de confirmação por e-mail.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        // Fallback defensivo: conta existe mas sign-in travou (caso raríssimo).
        // Não deixa o usuário sem saída — manda pra login com a senha já em mente.
        console.error("[register] auto-login falhou:", signInError.message);
        toast.success(t("auth.accountCreated"));
        setView("login");
        setPassword("");
        setLoading(false);
        return;
      }

      // ── Sucesso total: limpa senha da memória e manda pro dashboard. ──
      toast.success(t("auth.accountCreated"));
      setPassword("");
      navigate("/dashboard");
    } catch {
      toast.error(t("auth.registrationFailed"));
    } finally {
      setLoading(false);
    }
  };

  const headerAction = () => {
    if (view === "login") {
      return (
        <button
          onClick={() => { setView("invite"); setInviteError(""); }}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Ticket className="h-4 w-4" />
          <span>{t("auth.iHaveInvite")}</span>
        </button>
      );
    }
    return (
      <button
        onClick={() => { setView("login"); setInviteError(""); setPassword(""); }}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {t("auth.alreadyHaveAccount")}{" "}
        <span className="text-primary font-medium">{t("auth.signIn")}</span>
      </button>
    );
  };

  const renderTitle = () => {
    switch (view) {
      case "login":
        return { title: t("auth.welcomeBack"), subtitle: t("auth.welcomeSubtitle") };
      case "invite":
        return { title: t("auth.inviteCode"), subtitle: t("auth.inviteSubtitle") };
      case "register":
        return { title: t("auth.createAccount"), subtitle: t("auth.createSubtitle") };
    }
  };

  const { title, subtitle } = renderTitle();

  // Botão Register habilita apenas com senha aceitável + email preenchido
  const canRegister = !loading && passwordAcceptable && email.trim().length > 0;

  return (
    <div className="min-h-screen flex bg-background">
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
              Next-level cloaking for elite traffic campaigns
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Protect your funnels with real-time bot filtering, smart cloaking, and performance-first security.
            </p>
          </div>
          <div className="flex gap-6 pt-4">
            {[
              { value: "99.9%", label: t("auth.detectionFull") },
              { value: "<50ms", label: t("auth.latency") },
              { value: "24/7", label: t("common.monitoring") },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-2xl font-bold text-primary">{stat.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between p-6">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            {t("common.back")}
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSelector />
            {headerAction()}
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 pb-12">
          <div className="w-full max-w-sm space-y-8">
            <div className="lg:hidden flex items-center gap-2 justify-center">
              <Shield className="h-7 w-7 text-primary" />
              <span className="text-xl font-bold">CloakerX</span>
            </div>

            <div className="space-y-2 text-center lg:text-left">
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
              <p className="text-muted-foreground text-sm">{subtitle}</p>
            </div>

            {/* ─── LOGIN ─── */}
            {view === "login" && (
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">{t("auth.emailLabel")}</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="email" placeholder={t("auth.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} required className="pl-10 h-11 bg-secondary/50 border-border focus:border-primary/50 transition-colors" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">{t("auth.passwordLabel")}</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type={showPassword ? "text" : "password"} placeholder={t("auth.passwordPlaceholder")} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="pl-10 pr-10 h-11 bg-secondary/50 border-border focus:border-primary/50 transition-colors" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 text-sm font-semibold" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t("auth.signInButton")}
                </Button>

                {/* Forgot password — usa o e-mail já digitado no campo acima. */}
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={loading}
                  className="block w-full text-center text-sm text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  {t("auth.forgotPassword")}
                </button>

                <button
                  type="button"
                  onClick={() => { setView("invite"); setInviteError(""); }}
                  className="flex items-center justify-center gap-1.5 w-full text-sm text-muted-foreground hover:text-primary transition-colors pt-1"
                >
                  <Ticket className="h-4 w-4" />
                  <span>{t("auth.iHaveInvite")}</span>
                </button>
              </form>
            )}

            {/* ─── INVITE CODE ─── */}
            {view === "invite" && (
              <form onSubmit={handleValidateInvite} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">{t("auth.inviteCodeLabel")}</label>
                  <div className="relative">
                    <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="text" placeholder={t("auth.inviteCodePlaceholder")} value={inviteCode} onChange={(e) => { setInviteCode(e.target.value); setInviteError(""); }} required className="pl-10 h-11 bg-secondary/50 border-border focus:border-primary/50 transition-colors uppercase tracking-wider" />
                  </div>
                  {inviteError && (
                    <div className="flex items-center gap-2 text-destructive text-sm mt-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{inviteError}</span>
                    </div>
                  )}
                </div>
                <Button type="submit" className="w-full h-11 text-sm font-semibold" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t("auth.validateCode")}
                </Button>
              </form>
            )}

            {/* ─── REGISTER (com checklist) ─── */}
            {view === "register" && (
              <form onSubmit={handleRegister} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">{t("auth.emailLabel")}</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="email" placeholder={t("auth.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} required className="pl-10 h-11 bg-secondary/50 border-border focus:border-primary/50 transition-colors" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">{t("auth.passwordLabel")}</label>
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
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
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

                  {/* ★ Checklist dinâmico de critérios */}
                  <PasswordCriteriaList password={password} />
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 text-sm font-semibold"
                  disabled={!canRegister}
                >
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t("auth.createAccountButton")}
                </Button>
              </form>
            )}

            <p className="text-xs text-center text-muted-foreground leading-relaxed">
              {t("auth.accessRestricted")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}