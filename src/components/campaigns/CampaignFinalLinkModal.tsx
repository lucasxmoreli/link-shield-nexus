import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Zap, Copy, Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { buildDefaultTrackingUrl } from "@/components/campaigns/CampaignLinkGenerator";

export interface CampaignFinalLinkData {
  name: string;
  domain: string;
  hash: string;
  traffic_source: string;
}

interface CampaignFinalLinkModalProps {
  campaign: CampaignFinalLinkData | null;
  onClose: () => void;
  redirectTo?: string;
}

export default function CampaignFinalLinkModal({
  campaign,
  onClose,
  redirectTo = "/campaigns",
}: CampaignFinalLinkModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  if (!campaign) return null;

  const finalUrl = buildDefaultTrackingUrl(
    campaign.domain || "yourdomain.com",
    campaign.hash,
    campaign.traffic_source,
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(finalUrl);
    toast.success(t("campaignEdit.linkCopied"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    onClose();
    if (redirectTo) navigate(redirectTo);
  };

  return (
    <Dialog
      open={!!campaign}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="text-center sm:text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Zap className="h-7 w-7 text-primary" />
          </div>
          <DialogTitle className="text-xl">{t("campaignEdit.successTitle")}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{campaign.name}</span>
            <br />
            {t("campaignEdit.successHelp")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("campaignEdit.finalUrl")}
              </p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-xs">
                    {t("campaignEdit.testRecommendation")}
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="rounded-md border border-primary/30 bg-background p-3 break-all">
              <code className="text-xs sm:text-sm text-primary font-mono leading-relaxed">
                {finalUrl}
              </code>
            </div>
          </div>

          {/* Copy Button */}
          <Button className="w-full gap-2" size="lg" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {t("campaignEdit.copyFinalUrl")}
          </Button>
        </div>

        {/* Quick Setup */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            {t("campaignEdit.quickSetup")}
          </p>
          <div className="space-y-2">
            {["step1", "step2", "step3"].map((stepKey, i) => (
              <div key={stepKey} className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                  {i + 1}
                </span>
                <p className="text-sm text-muted-foreground">
                  {t(`campaignEdit.${stepKey}`)
                    .split("<bold>")
                    .map((part: string, j: number) => {
                      if (j === 0) return part;
                      const [bold, rest] = part.split("</bold>");
                      return (
                        <span key={j}>
                          <span className="font-medium text-foreground">{bold}</span>
                          {rest}
                        </span>
                      );
                    })}
                </p>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} className="w-full">
            {t("campaignEdit.closeCampaigns")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
