import { useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Turnstile } from "@marsidev/react-turnstile";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Loader2, ArrowLeft, Eye, EyeOff, Mail, Lock, Inbox } from "lucide-react";
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

// Public site key — also set VITE_TURNSTILE_SITE_KEY on Vercel for overrides.
const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY || "0x4AAAAAAEw2RoFA8Uczq9-a";

type AuthView = "login" | "register" | "check_email";

export default function Auth() {
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const strength = calculatePasswordStrength(password);
  const strengthPct = getPasswordStrengthPct(password);
  const strengthColors = getPasswordStrengthColor(strength);
  const passwordAcceptable = isPasswordAcceptable(password);

  const strengthLabel =
    strength === "empty" ? "" :
    strength === "weak" ? t("password.strengthWeak") :
    strength === "medium" ? t("password.strengthMedium") :
    t("password.strengthStrong");

  const resetTurnstile = useCallback(() => {
    setCaptchaToken(null);
    setTurnstileKey((k) => k + 1);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      const msg = error.message?.toLowerCase() || "";
      if (msg.includes("email not confirmed") || msg.includes("not confirmed")) {
        toast.error(t("auth.emailNotConfirmed"));
        setView("check_email");
      } else {
        toast.error(error.message);
      }
    } else {
      navigate("/dashboard");
    }
    setLoading(false);
  };

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

  // ── Spec 1B: open signup via Auth signUp + Turnstile (no service-role edge).
  // Confirm-email ON → no session until link click → redirect lands on /dashboard logged in.
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!passwordAcceptable) {
      toast.error(t("password.notAcceptable"));
      return;
    }
    if (!captchaToken) {
      toast.error(t("auth.captchaRequired"));
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          captchaToken,
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) {
        console.error("[register] signUp failed:", error.message, (error as { code?: string }).code);
        const code = String((error as { code?: string }).code || "");
        const msg = error.message?.toLowerCase() || "";
        // HIBP / Supabase "Prevent leaked passwords" — format checklist can still be green.
        if (
          code === "weak_password" ||
          msg.includes("pwned") ||
          msg.includes("weak and easy") ||
          msg.includes("known to be weak")
        ) {
          toast.error(t("auth.passwordPwned"));
        } else if (msg.includes("captcha") || msg.includes("timeout") || msg.includes("verification")) {
          toast.error(t("auth.captchaFailed"));
        } else {
          // Anti-enum for remaining cases (e.g. duplicate email messaging).
          toast.error(t("auth.registrationFailed"));
        }
        resetTurnstile();
        setLoading(false);
        return;
      }

      // If Confirm email is OFF, Auth may return a session immediately.
      if (data.session) {
        setPassword("");
        toast.success(t("auth.accountCreated"));
        navigate("/dashboard");
        setLoading(false);
        return;
      }

      // Confirm email ON (expected): ask user to open inbox; link auto-logs them in.
      setPassword("");
      resetTurnstile();
      setView("check_email");
      toast.success(t("auth.checkEmailSent"));
    } catch (err) {
      console.error("[register] unexpected error:", err);
      toast.error(t("auth.registrationFailed"));
      resetTurnstile();
    } finally {
      setLoading(false);
    }
  };

  const headerAction = () => {
    if (view === "login") {
      return (
        <button
          onClick={() => {
            setView("register");
            setPassword("");
            resetTurnstile();
          }}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("auth.createAccount")}
        </button>
      );
    }
    return (
      <button
        onClick={() => {
          setView("login");
          setPassword("");
          resetTurnstile();
        }}
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
      case "register":
        return { title: t("auth.createAccount"), subtitle: t("auth.createSubtitle") };
      case "check_email":
        return { title: t("auth.checkEmailTitle"), subtitle: t("auth.checkEmailSubtitle") };
    }
  };

  const { title, subtitle } = renderTitle();
  const canRegister =
    !loading && passwordAcceptable && email.trim().length > 0 && !!captchaToken;

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
            {view !== "check_email" && headerAction()}
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
                  onClick={() => {
                    setView("register");
                    setPassword("");
                    resetTurnstile();
                  }}
                  className="block w-full text-center text-sm text-muted-foreground hover:text-primary transition-colors pt-1"
                >
                  {t("auth.noAccountYet")}
                </button>
              </form>
            )}

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
                  {password.length > 0 && (
                    <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
                      {t("password.breachHint")}
                    </p>
                  )}
                </div>

                <div className="flex justify-center min-h-[65px]">
                  <Turnstile
                    key={turnstileKey}
                    siteKey={TURNSTILE_SITE_KEY}
                    onSuccess={(token) => setCaptchaToken(token)}
                    onExpire={() => setCaptchaToken(null)}
                    onError={() => {
                      setCaptchaToken(null);
                      toast.error(t("auth.captchaFailed"));
                    }}
                    options={{ theme: "dark" }}
                  />
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

            {view === "check_email" && (
              <div className="space-y-5 text-center">
                <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/15 flex items-center justify-center">
                  <Inbox className="h-7 w-7 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t("auth.checkEmailBody", { email: email.trim().toLowerCase() })}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full h-11"
                  onClick={() => setView("login")}
                >
                  {t("auth.backToSignIn")}
                </Button>
              </div>
            )}

            <p className="text-xs text-center text-muted-foreground leading-relaxed">
              {t("auth.accessOpenNote")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
