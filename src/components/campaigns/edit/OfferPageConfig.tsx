import { useTranslation } from "react-i18next";
import { Zap, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";

interface OfferPageConfigProps {
  offerUrl: string;
  onOfferUrlChange: (v: string) => void;
  onOfferUrlBlur: (v: string) => void;
  abStormEnabled: boolean;
  onAbStormEnabledChange: (v: boolean) => void;
  offerPageB: string;
  onOfferPageBChange: (v: string) => void;
  onOfferPageBBlur: (v: string) => void;
  offerMethod: string;
  onOfferMethodChange: (v: string) => void;
}

export default function OfferPageConfig({
  offerUrl,
  onOfferUrlChange,
  onOfferUrlBlur,
  abStormEnabled,
  onAbStormEnabledChange,
  offerPageB,
  onOfferPageBChange,
  onOfferPageBBlur,
  offerMethod,
  onOfferMethodChange,
}: OfferPageConfigProps) {
  const { t } = useTranslation();

  return (
    <section className="rounded-xl border border-yellow-500/20 bg-[hsl(var(--card))] p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t("campaignEdit.offerPageSection")}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{t("campaignEdit.offerPageSectionDesc")}</p>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{t("campaignEdit.primaryOffer")}</Label>
        <Input
          placeholder={t("campaignEdit.offerPlaceholder")}
          className="bg-secondary border-border"
          value={offerUrl}
          onChange={(e) => onOfferUrlChange(e.target.value)}
          onBlur={(e) => onOfferUrlBlur(e.target.value)}
        />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">{t("campaignEdit.abStormTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("campaignEdit.abStormDesc")}</p>
          </div>
        </div>
        <Switch
          checked={abStormEnabled}
          onCheckedChange={(checked) => {
            onAbStormEnabledChange(checked);
          }}
        />
      </div>
      <Collapsible open={abStormEnabled}>
        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-up-2 data-[state=open]:slide-down-2">
          <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("campaignEdit.testOfferB")}</Label>
              <Input
                placeholder={t("campaignEdit.testOfferPlaceholder")}
                className="bg-secondary border-border"
                value={offerPageB}
                onChange={(e) => onOfferPageBChange(e.target.value)}
                onBlur={(e) => onOfferPageBBlur(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("campaignEdit.abStormHelp")
                .split("<bold>")
                .map((part, i) => {
                  if (i === 0) return part;
                  const [bold, rest] = part.split("</bold>");
                  return (
                    <span key={i}>
                      <span className="font-semibold text-primary">{bold}</span>
                      {rest}
                    </span>
                  );
                })}
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{t("campaignEdit.method")}</Label>
        <RadioGroup value={offerMethod} onValueChange={onOfferMethodChange} className="flex flex-col sm:flex-row gap-3">
          <label
            className={`flex-1 flex items-start gap-3 cursor-pointer rounded-lg border px-4 py-3 text-sm transition-colors ${offerMethod === "redirect" ? "border-primary bg-primary/10" : "border-border bg-secondary"}`}
          >
            <RadioGroupItem value="redirect" className="mt-0.5" />
            <div>
              <p className={`font-medium ${offerMethod === "redirect" ? "text-primary" : "text-foreground"}`}>
                {t("campaignEdit.redirect")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("campaignEdit.redirectDesc")}</p>
            </div>
          </label>
          <label
            className={`flex-1 flex items-start gap-3 cursor-pointer rounded-lg border px-4 py-3 text-sm transition-colors ${offerMethod === "content_fetch" ? "border-primary bg-primary/10" : "border-border bg-secondary"}`}
          >
            <RadioGroupItem value="content_fetch" className="mt-0.5" />
            <div>
              <p className={`font-medium ${offerMethod === "content_fetch" ? "text-primary" : "text-foreground"}`}>
                {t("campaignEdit.contentFetch")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("campaignEdit.contentFetchDesc")}</p>
            </div>
          </label>
        </RadioGroup>
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <Info className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground">{t("campaignEdit.offerMethodHint")}</p>
        </div>
      </div>
    </section>
  );
}
