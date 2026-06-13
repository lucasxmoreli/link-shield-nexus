import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";

export type BehavioralMode = "protect_leads" | "anti_reviewer";

interface BehavioralModeConfigProps {
  behavioralMode: BehavioralMode;
  onBehavioralModeChange: (v: BehavioralMode) => void;
}

export default function BehavioralModeConfig({
  behavioralMode,
  onBehavioralModeChange,
}: BehavioralModeConfigProps) {
  const { t } = useTranslation();

  return (
    <section className="rounded-xl bg-[hsl(var(--card))] p-6 space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {t("campaignEdit.behavioralModeSection")}
      </h2>

      <RadioGroup
        value={behavioralMode}
        onValueChange={(v) => onBehavioralModeChange(v as BehavioralMode)}
      >
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-secondary/50 p-3">
          <RadioGroupItem value="protect_leads" id="bm-protect" className="mt-0.5" />
          <div>
            <Label htmlFor="bm-protect" className="text-sm font-medium cursor-pointer">
              {t("campaignEdit.behavioralModeProtectTitle")}
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("campaignEdit.behavioralModeProtectDesc")}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-secondary/50 p-3">
          <RadioGroupItem value="anti_reviewer" id="bm-aggressive" className="mt-0.5" />
          <div className="flex-1">
            <Label htmlFor="bm-aggressive" className="text-sm font-medium cursor-pointer">
              {t("campaignEdit.behavioralModeAggressiveTitle")}
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("campaignEdit.behavioralModeAggressiveDesc")}
            </p>
            {behavioralMode === "anti_reviewer" && (
              <Alert className="mt-2 border-yellow-500/30 bg-yellow-500/10 p-3">
                <AlertDescription className="text-xs text-yellow-500">
                  {t("campaignEdit.behavioralModeAggressiveWarning")}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      </RadioGroup>
    </section>
  );
}
