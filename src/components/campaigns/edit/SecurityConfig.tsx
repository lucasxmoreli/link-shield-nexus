import { useTranslation } from "react-i18next";
import { ShieldAlert } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface SecurityConfigProps {
  strictMode: boolean;
  onStrictModeChange: (v: boolean) => void;
}

export default function SecurityConfig({ strictMode, onStrictModeChange }: SecurityConfigProps) {
  const { t } = useTranslation();

  return (
    <section className="rounded-xl bg-[hsl(var(--card))] p-6 space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {t("campaignEdit.securitySection")}
      </h2>
      <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10">
            <ShieldAlert className="h-4 w-4 text-destructive" />
          </div>
          <div>
            <p className="text-sm font-medium">{t("campaignEdit.strictModeTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("campaignEdit.strictModeDesc")}</p>
          </div>
        </div>
        <Switch checked={strictMode} onCheckedChange={onStrictModeChange} />
      </div>
    </section>
  );
}
