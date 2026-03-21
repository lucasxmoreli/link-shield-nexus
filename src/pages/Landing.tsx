import { Link } from "react-router-dom";
import { Shield, Zap, Eye, Globe, ArrowRight, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "@/components/LanguageSelector";

export default function Landing() {
  const { session } = useAuth();
  const { t } = useTranslation();

  const features = [
    { icon: Shield, title: t("landing.advancedCloaking"), description: t("landing.advancedCloakingDesc"), color: "text-primary", bg: "bg-primary/10" },
    { icon: Eye, title: t("landing.proxyDetection"), description: t("landing.proxyDetectionDesc"), color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { icon: Zap, title: t("landing.ultraLowLatency"), description: t("landing.ultraLowLatencyDesc"), color: "text-amber-500", bg: "bg-amber-500/10" },
    { icon: Globe, title: t("landing.multiPlatform"), description: t("landing.multiPlatformDesc"), color: "text-sky-500", bg: "bg-sky-500/10" },
  ];

  const benefits = [
    t("landing.benefit1"),
    t("landing.benefit2"),
    t("landing.benefit3"),
    t("landing.benefit4"),
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Shield className="h-7 w-7 text-primary" />
            <span className="text-xl font-bold tracking-tight">CloakGuard</span>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSelector />
            {session ? (
              <Button asChild>
                <Link to="/dashboard">
                  {t("landing.goToDashboard")} <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link to="/auth">{t("landing.login")}</Link>
                </Button>
                <Button asChild>
                  <Link to="/auth">{t("landing.getStarted")}</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(271_81%_56%/0.15),transparent_60%)]" />
        <div className="max-w-4xl mx-auto px-6 pt-24 pb-20 text-center relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary mb-8">
            <Zap className="h-3.5 w-3.5" />
            {t("landing.smartProtection")}
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-6">
            {t("landing.heroTitle")}{" "}
            <span className="text-primary">{t("landing.heroTitleHighlight")}</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
            {t("landing.heroDesc")}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" asChild className="text-base px-8">
              <Link to="/auth">
                {t("landing.createFreeAccount")} <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="text-base px-8">
              <a href="#features">{t("landing.seeFeatures")}</a>
            </Button>
          </div>
        </div>
      </section>

      <section id="features" className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-3">{t("landing.everythingYouNeed")}</h2>
          <p className="text-muted-foreground text-lg">{t("landing.everythingDesc")}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card p-6 hover:border-primary/40 transition-colors">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <f.icon className="h-5 w-5 text-primary" strokeWidth={2} />
              </div>
              <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-card/50">
        <div className="max-w-4xl mx-auto px-6 py-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-4">{t("landing.whyChoose")}</h2>
              <p className="text-muted-foreground mb-8">{t("landing.whyChooseDesc")}</p>
              <ul className="space-y-4">
                {benefits.map((b) => (
                  <li key={b} className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-[hsl(var(--success))] mt-0.5 shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-border bg-background p-8 text-center">
              <div className="text-5xl font-bold text-primary mb-2">99.9%</div>
              <p className="text-muted-foreground">{t("landing.botDetectionRate")}</p>
              <div className="h-px bg-border my-6" />
              <div className="text-5xl font-bold text-[hsl(var(--success))] mb-2">&lt;50ms</div>
              <p className="text-muted-foreground">{t("landing.avgLatency")}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">{t("landing.readyToProtect")}</h2>
        <p className="text-muted-foreground mb-8 text-lg">{t("landing.readyDesc")}</p>
        <Button size="lg" asChild className="text-base px-10">
          <Link to="/auth">
            {t("landing.getStarted")} <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </section>

      <footer className="border-t border-border py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span>CloakGuard © {new Date().getFullYear()}</span>
          </div>
          <span>{t("landing.footer")}</span>
        </div>
      </footer>
    </div>
  );
}
