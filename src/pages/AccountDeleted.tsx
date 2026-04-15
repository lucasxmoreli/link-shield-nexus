import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Shield, Mail, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function AccountDeleted() {
  const { t } = useTranslation();

  const handleEmailSupport = () => {
    window.location.href = "mailto:suporte@cloakerx.com?subject=Reativar%20conta";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md w-full space-y-8 text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2">
          <Shield className="h-8 w-8 text-primary" />
          <span className="text-2xl font-bold tracking-tight">CloakerX</span>
        </div>

        {/* Ícone de status */}
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center">
            <Shield className="h-10 w-10 text-destructive" strokeWidth={1.5} />
          </div>
        </div>

        {/* Mensagem */}
        <div className="space-y-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {t("accountDeleted.title")}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("accountDeleted.description")}
          </p>
        </div>

        {/* Card explicativo */}
        <div className="rounded-lg border border-border/50 bg-card/50 p-4 text-left space-y-2">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
            {t("accountDeleted.howToRestore")}
          </p>
          <p className="text-sm text-foreground/80">
            {t("accountDeleted.howToRestoreDesc")}
          </p>
        </div>

        {/* Ações */}
        <div className="space-y-3">
          <Button
            onClick={handleEmailSupport}
            className="w-full h-11 text-sm font-semibold"
          >
            <Mail className="h-4 w-4 mr-2" />
            {t("accountDeleted.contactSupport")}
          </Button>

          <Link to="/">
            <Button variant="outline" className="w-full h-11 text-sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("accountDeleted.backToHome")}
            </Button>
          </Link>
        </div>

        {/* Footer */}
        <p className="text-xs text-muted-foreground">
          {t("accountDeleted.gracePeriodNote")}
        </p>
      </div>
    </div>
  );
}