import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Loader2, ArrowLeft, Eye, EyeOff, Mail, Lock, Ticket, AlertCircle } from "lucide-react";
import { toast } from "sonner";

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

    const { data, error } = await supabase
      .from("invite_codes")
      .select("id, is_used")
      .eq("code", inviteCode.trim().toUpperCase())
      .maybeSingle();

    if (error || !data) {
      setInviteError("Este código de convite é inválido ou já foi utilizado.");
    } else if (data.is_used) {
      setInviteError("Este código de convite é inválido ou já foi utilizado.");
    } else {
      setValidatedCode(inviteCode.trim().toUpperCase());
      setView("register");
      toast.success("Código válido! Crie sua conta.");
    }
    setLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data: signUpData, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });

    if (error) {
      toast.error(error.message);
    } else {
      // Mark invite code as used
      if (signUpData.user) {
        await supabase
          .from("invite_codes")
          .update({
            is_used: true,
            used_by: signUpData.user.id,
            used_at: new Date().toISOString(),
          })
          .eq("code", validatedCode);
      }
      toast.success("Conta criada! Verifique seu e-mail para confirmar.");
      setView("login");
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
          <span>Tenho um convite</span>
        </button>
      );
    }
    return (
      <button
        onClick={() => { setView("login"); setInviteError(""); }}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        Já tem conta?{" "}
        <span className="text-primary font-medium">Entrar</span>
      </button>
    );
  };

  const renderTitle = () => {
    switch (view) {
      case "login":
        return { title: "Bem-vindo de volta", subtitle: "Entre com suas credenciais para acessar o dashboard." };
      case "invite":
        return { title: "Código de Convite", subtitle: "Insira seu código de convite para criar uma conta." };
      case "register":
        return { title: "Crie sua conta", subtitle: "Comece a proteger suas campanhas em minutos." };
    }
  };

  const { title, subtitle } = renderTitle();

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left panel — branding */}
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
              Proteção invisível.{" "}
              <span className="text-primary">Resultados reais.</span>
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Filtre bots e moderadores em tempo real. Seus visitantes veem a oferta,
              o resto vê a safe page.
            </p>
          </div>
          <div className="flex gap-6 pt-4">
            {[
              { value: "99.9%", label: "Detecção" },
              { value: "<50ms", label: "Latência" },
              { value: "24/7", label: "Monitoramento" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-2xl font-bold text-primary">{stat.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between p-6">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
          {headerAction()}
        </div>

        {/* Form area */}
        <div className="flex-1 flex items-center justify-center px-6 pb-12">
          <div className="w-full max-w-sm space-y-8">
            {/* Mobile logo */}
            <div className="lg:hidden flex items-center gap-2 justify-center">
              <Shield className="h-7 w-7 text-primary" />
              <span className="text-xl font-bold">CloakGuard</span>
            </div>

            <div className="space-y-2 text-center lg:text-left">
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
              <p className="text-muted-foreground text-sm">{subtitle}</p>
            </div>

            {/* LOGIN */}
            {view === "login" && (
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="pl-10 h-11 bg-secondary/50 border-border focus:border-primary/50 transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Senha</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
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
                </div>

                <Button type="submit" className="w-full h-11 text-sm font-semibold" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Entrar
                </Button>
              </form>
            )}

            {/* INVITE CODE */}
            {view === "invite" && (
              <form onSubmit={handleValidateInvite} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Código de Convite</label>
                  <div className="relative">
                    <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="CLOAK-XXXX-XXXX"
                      value={inviteCode}
                      onChange={(e) => { setInviteCode(e.target.value); setInviteError(""); }}
                      required
                      className="pl-10 h-11 bg-secondary/50 border-border focus:border-primary/50 transition-colors uppercase tracking-wider"
                    />
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
                  Validar Código
                </Button>
              </form>
            )}

            {/* REGISTER (after valid invite) */}
            {view === "register" && (
              <form onSubmit={handleRegister} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="pl-10 h-11 bg-secondary/50 border-border focus:border-primary/50 transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Senha</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
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
                  <p className="text-xs text-muted-foreground">Mínimo de 6 caracteres</p>
                </div>

                <Button type="submit" className="w-full h-11 text-sm font-semibold" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Criar conta
                </Button>
              </form>
            )}

            {/* Footer */}
            <p className="text-xs text-center text-muted-foreground leading-relaxed">
              Acesso restrito. Se você não possui um código, entre em contato com o administrador.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
