import { useState } from "react";
import { useTranslation } from "react-i18next";
import { User, Lock, AlertTriangle } from "lucide-react";
import { ProfileSection } from "@/components/profile/ProfileSection";
import { PasswordSection } from "@/components/profile/PasswordSection";

type TabId = "profile" | "security" | "danger";

interface TabConfig {
  id: TabId;
  labelKey: string;
  icon: React.ElementType;
}

const TABS: TabConfig[] = [
  { id: "profile", labelKey: "profile.tabProfile", icon: User },
  { id: "security", labelKey: "profile.tabSecurity", icon: Lock },
  { id: "danger", labelKey: "profile.tabDanger", icon: AlertTriangle },
];

/**
 * Página de configurações da conta — Layout de duas colunas (padrão High-Ticket).
 * 
 * Coluna esquerda: navegação tab vertical (240px fixa em desktop)
 * Coluna direita: conteúdo da aba ativa (flex 1, fluido)
 * 
 * Mobile: vira layout de coluna única, navegação vira botões horizontais no topo.
 */
export default function AccountSettings() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabId>("profile");

  return (
    <div className="container max-w-6xl mx-auto py-6 sm:py-8 px-4">
      {/* Header */}
      <div className="mb-8 sm:mb-10">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1">
          {t("profile.pageTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("profile.pageSubtitle")}
        </p>
      </div>

      {/* Layout de duas colunas */}
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6 lg:gap-10">
        {/* ─── Coluna esquerda: Navegação ─── */}
        <nav
          className="flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0"
          aria-label="Settings navigation"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-md text-sm
                  transition-colors duration-150
                  whitespace-nowrap md:w-full text-left
                  ${
                    isActive
                      ? "bg-muted/50 text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  }
                `}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon size={16} className="shrink-0" />
                <span>{t(tab.labelKey)}</span>
              </button>
            );
          })}
        </nav>

        {/* ─── Coluna direita: Conteúdo ─── */}
        <div className="min-w-0">
          {activeTab === "profile" && <TabContent
            title={t("profile.profileTitle")}
            subtitle={t("profile.profileSubtitle")}
          >
            <ProfileSection />
          </TabContent>}

          {activeTab === "security" && <TabContent
            title={t("profile.securityTitle")}
            subtitle={t("profile.securitySubtitle")}
          >
            <PasswordSection />
          </TabContent>}

          {activeTab === "danger" && <TabContent
            title={t("profile.dangerTitle")}
            subtitle={t("profile.dangerSubtitle")}
          >
            <ComingSoonCard message={t("profile.dangerComingSoon")} />
          </TabContent>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes locais (não exportados)
// ─────────────────────────────────────────────────────────────────────────────

interface TabContentProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

/**
 * Wrapper padrão pro conteúdo de cada aba.
 * Header (título + subtítulo) + slot pro componente real.
 */
function TabContent({ title, subtitle, children }: TabContentProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

interface ComingSoonCardProps {
  message: string;
}

/**
 * Placeholder pra abas que ainda não têm conteúdo real (Danger Zone Bloco B).
 * Card sutil com mensagem centralizada.
 */
function ComingSoonCard({ message }: ComingSoonCardProps) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/50 p-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}