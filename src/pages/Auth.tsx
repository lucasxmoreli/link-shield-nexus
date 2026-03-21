import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Loader2, ArrowLeft, Eye, EyeOff, Mail, Lock, Ticket, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "@/components/LanguageSelector";

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
    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("register", {
        body: { email, password, invite_code: validatedCode },
      });
      if (fnError) {
        toast.error(fnError.message || t("auth.registrationFailed"));
      } else if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success(t("auth.accountCreated"));
        setView("login");
      }
    } catch {
      toast.error(t("auth.registrationFailed"));
    }
    setLoading(false);
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
        onClick={() => { setView("login"); setInviteError(""); }}
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
            <span className="text-2xl font-bold tracking-tight">CloakGuard</span>
          </div>
          <div className="space-y-4">
            <h2 className="text-3xl font-bold leading-tight">
              {t("auth.invisibleProtection")}{" "}
              <span className="text-primary">{t("auth.realResults")}</span>
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed">
              {t("auth.authDescription")}
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
              <span className="text-xl font-bold">CloakGuard</span>
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
                  onClick={() => { setView("invite"); setInviteError(""); }}
                  className="flex items-center justify-center gap-1.5 w-full text-sm text-muted-foreground hover:text-primary transition-colors pt-1"
                >
                  <Ticket className="h-4 w-4" />
                  <span>{t("auth.iHaveInvite")}</span>
                </button>
              </form>
            )}

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
                    <Input type={showPassword ? "text" : "password"} placeholder={t("auth.passwordPlaceholder")} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="pl-10 pr-10 h-11 bg-secondary/50 border-border focus:border-primary/50 transition-colors" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("auth.minChars")}</p>
                </div>
                <Button type="submit" className="w-full h-11 text-sm font-semibold" disabled={loading}>
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
