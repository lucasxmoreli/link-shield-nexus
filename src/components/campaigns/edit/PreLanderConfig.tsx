import { useTranslation } from "react-i18next";
import { Shield } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";

interface PreLanderConfigProps {
  prelanderEnabled: boolean;
  onPrelanderEnabledChange: (v: boolean) => void;
  prelanderHeadline: string;
  onPrelanderHeadlineChange: (v: string) => void;
  prelanderBody: string;
  onPrelanderBodyChange: (v: string) => void;
  prelanderCta: string;
  onPrelanderCtaChange: (v: string) => void;
  powDifficulty: number;
  onPowDifficultyChange: (v: number) => void;
  headlineError: boolean;
  bodyError: boolean;
}

export default function PreLanderConfig({
  prelanderEnabled,
  onPrelanderEnabledChange,
  prelanderHeadline,
  onPrelanderHeadlineChange,
  prelanderBody,
  onPrelanderBodyChange,
  prelanderCta,
  onPrelanderCtaChange,
  powDifficulty,
  onPowDifficultyChange,
  headlineError,
  bodyError,
}: PreLanderConfigProps) {
  const { t } = useTranslation();

  const difficultyHelper = t(`campaignEdit.powDifficulty${powDifficulty}Helper`);

  return (
    <section className="rounded-xl bg-[hsl(var(--card))] p-6 space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {t("campaignEdit.prelanderSection")}
      </h2>

      <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">{t("campaignEdit.prelanderEnabledTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("campaignEdit.prelanderEnabledDesc")}</p>
          </div>
        </div>
        <Switch checked={prelanderEnabled} onCheckedChange={onPrelanderEnabledChange} />
      </div>

      <Collapsible open={prelanderEnabled}>
        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-up-2 data-[state=open]:slide-down-2">
          <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("campaignEdit.prelanderHeadlineLabel")}
              </Label>
              <Input
                placeholder={t("campaignEdit.prelanderHeadlinePlaceholder")}
                className="bg-secondary border-border"
                maxLength={80}
                value={prelanderHeadline}
                onChange={(e) => onPrelanderHeadlineChange(e.target.value)}
              />
              {headlineError && (
                <p className="text-xs text-destructive">{t("campaignEdit.prelanderHeadlineRequired")}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("campaignEdit.prelanderBodyLabel")}
              </Label>
              <Textarea
                placeholder={t("campaignEdit.prelanderBodyPlaceholder")}
                className="bg-secondary border-border resize-none"
                rows={4}
                maxLength={400}
                value={prelanderBody}
                onChange={(e) => onPrelanderBodyChange(e.target.value)}
              />
              {bodyError && (
                <p className="text-xs text-destructive">{t("campaignEdit.prelanderBodyRequired")}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("campaignEdit.prelanderCtaLabel")}
              </Label>
              <Input
                placeholder={t("campaignEdit.prelanderCtaPlaceholder")}
                className="bg-secondary border-border"
                maxLength={30}
                value={prelanderCta}
                onChange={(e) => onPrelanderCtaChange(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">
                  {t("campaignEdit.powDifficultyLabel")}
                </Label>
                <span className="text-xs font-medium text-foreground">{powDifficulty}</span>
              </div>
              <Slider
                min={3}
                max={5}
                step={1}
                value={[powDifficulty]}
                onValueChange={(values) => onPowDifficultyChange(values[0])}
              />
              <p className="text-xs text-muted-foreground">{difficultyHelper}</p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
