import { useTranslation } from "react-i18next";
import { ProfileSection } from "@/components/profile/ProfileSection";
import { PasswordSection } from "@/components/profile/PasswordSection";

/**
 * Página de configurações da conta do usuário.
 * 
 * Estrutura modular:
 * - ProfileSection: edição de display_name (email readonly)
 * - PasswordSection: troca de senha com validação de força
 * - DangerZoneSection: (pendente Bloco B) delete de conta com grace period
 */
export default function AccountSettings() {
  const { t } = useTranslation();

  return (
    <div className="container max-w-3xl mx-auto space-y-4 sm:space-y-6 py-4 sm:py-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
          {t("profile.pageTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("profile.pageSubtitle")}
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-4 sm:space-y-6">
        <ProfileSection />
        <PasswordSection />
        {/* TODO Bloco B: <DangerZoneSection /> */}
      </div>
    </div>
  );
}