import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ShieldAlert, Users, Ticket, Gift, History, type LucideIcon } from "lucide-react";
import { useAdmin } from "@/hooks/useAdmin";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ComponentType } from "react";

// Imports reais dos nossos componentes extraídos
import CommercialVisibilityTab from "./tabs/CommercialVisibilityTab";
import InviteCodesTab from "./tabs/InviteCodesTab";
import PromoCodesTab from "./tabs/PromoCodesTab";
import AuditLogTab from "./tabs/AuditLogTab";

// =============================================================================
// TAB CONFIG — array-driven, ready to grow
// =============================================================================

interface TabDef {
  id: string;
  labelKey: string;
  icon: LucideIcon;
  component: ComponentType; // <-- Agora a interface exige o componente real
}

const TABS: ReadonlyArray<TabDef> = [
  { id: "visibility", labelKey: "admin.tabVisibility", icon: Users, component: CommercialVisibilityTab },
  { id: "invites",    labelKey: "admin.tabInvites",    icon: Ticket, component: InviteCodesTab },
  { id: "promos",     labelKey: "admin.tabPromos",     icon: Gift,   component: PromoCodesTab },
  { id: "audit",      labelKey: "admin.tabAudit",      icon: History, component: AuditLogTab },
];


const DEFAULT_TAB = TABS[0].id;
const VALID_TAB_IDS = new Set(TABS.map((t) => t.id));

// =============================================================================
// MAIN
// =============================================================================

export default function AdminCommandCenter() {
  const { isAdmin, isLoading: adminLoading } = useAdmin();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Admin gate
  useEffect(() => {
    if (!adminLoading && !isAdmin) navigate("/dashboard", { replace: true });
  }, [adminLoading, isAdmin, navigate]);

  // Tab state synced with URL
  const rawTab = searchParams.get("tab");
  const activeTab = rawTab && VALID_TAB_IDS.has(rawTab) ? rawTab : DEFAULT_TAB;

  const setActiveTab = (next: string) => {
    if (!VALID_TAB_IDS.has(next)) return;
    setSearchParams({ tab: next }, { replace: true });
  };

  // Loading guard
  if (adminLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-7 w-7 text-primary" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("admin.commandCenter")}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t("admin.commandCenterSubtitle")}</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-secondary">
          {TABS.map(({ id, labelKey, icon: Icon }) => (
            <TabsTrigger key={id} value={id} className="gap-1.5">
              <Icon className="h-4 w-4" aria-hidden="true" />
              {t(labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Aqui é onde a mágica acontece: ele renderiza o componente real atrelado à Tab */}
        {TABS.map(({ id, component: Component }) => (
          <TabsContent key={id} value={id} className="mt-6">
            <Component />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}