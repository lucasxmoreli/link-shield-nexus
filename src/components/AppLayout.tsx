import { AppSidebar } from "@/components/AppSidebar";
import { LanguageSelector } from "@/components/LanguageSelector";
import { OverageWarning } from "@/components/OverageWarning";
import { AdminViewBanner } from "@/components/AdminViewBanner";
import { CrispChat } from "@/components/CrispChat";
import { Outlet } from "react-router-dom";
import { SidebarTrigger, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";

export function AppLayout() {
  const { profileMissing, gateError, refreshActivationStatus } = useAuth();
  const { t } = useTranslation();

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <AdminViewBanner />
          {(profileMissing || gateError) && (
            <div
              role="alert"
              className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm flex flex-wrap items-center gap-3"
            >
              <span className="text-foreground/90">
                {t(profileMissing ? "gate.profileMissing" : "gate.fetchError")}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void refreshActivationStatus()}
              >
                {t("gate.retry")}
              </Button>
              <a
                className="underline text-muted-foreground hover:text-foreground"
                href="mailto:suporte@cloakerx.com?subject=Perfil%20n%C3%A3o%20encontrado"
              >
                {t("gate.contactSupport")}
              </a>
            </div>
          )}
          <header className="h-12 flex items-center justify-between border-b border-border/50 px-3 sm:px-4 bg-card/30 backdrop-blur-sm">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <SidebarTrigger className="text-muted-foreground hover:text-primary transition-colors h-9 w-9 shrink-0" />
              <div className="h-5 w-px bg-border/50 hidden sm:block" />
              <span className="text-xs font-mono text-muted-foreground/60 uppercase tracking-[0.2em] hidden sm:block">CloakerX</span>
            </div>
            <LanguageSelector />
          </header>
          <OverageWarning />
          <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
      <CrispChat />
    </SidebarProvider>
  );
}
