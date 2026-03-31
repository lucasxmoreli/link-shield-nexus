import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface SafePageConfigProps {
  safeUrl: string;
  onSafeUrlChange: (v: string) => void;
  onSafeUrlBlur: (v: string) => void;
  safeMethod: string;
  onSafeMethodChange: (v: string) => void;
}

export default function SafePageConfig({
  safeUrl,
  onSafeUrlChange,
  onSafeUrlBlur,
  safeMethod,
  onSafeMethodChange,
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
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{t("campaignEdit.method")}</Label>
        <RadioGroup value={safeMethod} onValueChange={onSafeMethodChange} className="flex flex-col sm:flex-row gap-3">
          <label
            className={`flex-1 flex items-start gap-3 cursor-pointer rounded-lg border px-4 py-3 text-sm transition-colors ${safeMethod === "redirect" ? "border-primary bg-primary/10" : "border-border bg-secondary"}`}
          >
            <RadioGroupItem value="redirect" className="mt-0.5" />
            <div>
              <p className={`font-medium ${safeMethod === "redirect" ? "text-primary" : "text-foreground"}`}>
                {t("campaignEdit.redirect")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("campaignEdit.redirectDesc")}</p>
            </div>
          </label>
          <label
            className={`flex-1 flex items-start gap-3 cursor-pointer rounded-lg border px-4 py-3 text-sm transition-colors ${safeMethod === "content_fetch" ? "border-primary bg-primary/10" : "border-border bg-secondary"}`}
          >
            <RadioGroupItem value="content_fetch" className="mt-0.5" />
            <div>
              <p className={`font-medium ${safeMethod === "content_fetch" ? "text-primary" : "text-foreground"}`}>
                {t("campaignEdit.contentFetch")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("campaignEdit.contentFetchDesc")}</p>
            </div>
          </label>
        </RadioGroup>
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <Info className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground">{t("campaignEdit.safeMethodHint")}</p>
        </div>
      </div>
    </section>
  );
}
