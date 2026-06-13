import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Após a descontinuação do Masking, o bloco da Safe Page passa a conter
// apenas a URL — o método de entrega é sempre Redirect 302 no engine.
interface SafePageConfigProps {
  safeUrl: string;
  onSafeUrlChange: (v: string) => void;
  onSafeUrlBlur: (v: string) => void;
}

export default function SafePageConfig({
  safeUrl,
  onSafeUrlChange,
  onSafeUrlBlur,
}: SafePageConfigProps) {
  const { t } = useTranslation();

  return (
    <section className="rounded-xl border border-green-500/20 bg-[hsl(var(--card))] p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t("campaignEdit.safePageSection")}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{t("campaignEdit.safePageSectionDesc")}</p>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{t("campaignEdit.safePageUrl")}</Label>
        <Input
          placeholder={t("campaignEdit.safePagePlaceholder")}
          className="bg-secondary border-border"
          value={safeUrl}
          onChange={(e) => onSafeUrlChange(e.target.value)}
          onBlur={(e) => onSafeUrlBlur(e.target.value)}
        />
      </div>
    </section>
  );
}
