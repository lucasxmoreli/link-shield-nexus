import { useState } from "react";
import { Shield, Eye, Zap, AlertTriangle, Copy, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const CNAME_TARGET = "cname.cloakerx.com";

interface AddDomainModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  onUrlChange: (url: string) => void;
  onSubmit: () => void;
  isPending: boolean;
}

export function AddDomainModal({ open, onOpenChange, url, onUrlChange, onSubmit, isPending }: AddDomainModalProps) {
  const { t } = useTranslation();
  const [cfOpen, setCfOpen] = useState(false);
  const [dnsOpen, setDnsOpen] = useState(true);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(label);
  };

  const cfBenefits = [
    { icon: Shield, titleKey: "domains.cfBanWaveTitle", descKey: "domains.cfBanWaveDesc", color: "text-primary", bg: "bg-primary/10" },
    { icon: Eye, titleKey: "domains.cfSecurityTitle", descKey: "domains.cfSecurityDesc", color: "text-chart-4", bg: "bg-chart-4/10" },
    { icon: Zap, titleKey: "domains.cfSslTitle", descKey: "domains.cfSslDesc", color: "text-chart-2", bg: "bg-chart-2/10" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("domains.addDomainTitle")}</DialogTitle>
          <DialogDescription>{t("domains.addDomainDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Domain input */}
          <div>
            <Label className="text-sm">{t("domains.domainUrl")}</Label>
            <Input
              placeholder={t("domains.domainUrlPlaceholder")}
              className="bg-secondary/50 border-border mt-1.5"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && url) onSubmit(); }}
            />
          </div>

          {/* Collapsible: Why Cloudflare? */}
          <Collapsible open={cfOpen} onOpenChange={setCfOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border/40 bg-secondary/20 px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary/30 transition-colors">
              {t("domains.cfWhyTitle")}
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${cfOpen ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2.5 pt-2.5">
              {cfBenefits.map((b) => (
                <div key={b.titleKey} className="flex gap-3 rounded-lg border border-border/40 bg-secondary/20 p-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${b.bg}`}>
                    <b.icon className={`h-4 w-4 ${b.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{t(b.titleKey)}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{t(b.descKey)}</p>
                  </div>
                </div>
              ))}
              <Alert className="border-orange-500/30 bg-orange-500/10">
                <AlertTriangle className="h-4 w-4 text-orange-400" />
                <AlertDescription className="text-orange-400 text-xs font-medium">
                  {t("domains.cfWarning")}
                </AlertDescription>
              </Alert>
            </CollapsibleContent>
          </Collapsible>

          {/* Collapsible: DNS Setup */}
          <Collapsible open={dnsOpen} onOpenChange={setDnsOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border/40 bg-secondary/20 px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary/30 transition-colors">
              DNS Setup
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${dnsOpen ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2.5 pt-2.5">
              <div className="rounded-lg border border-border/30 bg-secondary/10 p-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">1</span>
                  <p className="text-sm font-medium text-foreground">{t("domains.dnsStep1")}</p>
                </div>
              </div>

              <div className="rounded-lg border border-border/30 bg-secondary/10 p-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">2</span>
                  <p className="text-sm font-medium text-foreground">{t("domains.dnsStep2")}</p>
                </div>
                <div className="relative">
                  <Input readOnly value={CNAME_TARGET} className="pr-9 bg-background border-border font-mono text-sm h-9" />
                  <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => copyToClipboard(CNAME_TARGET, t("domains.valueCopied"))}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-xs text-orange-400 font-medium">{t("domains.dnsStep2Note")}</p>
              </div>

              <div className="rounded-lg border border-border/30 bg-secondary/10 p-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">3</span>
                  <p className="text-sm font-medium text-foreground">{t("domains.dnsStep3")}</p>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Button className="w-full" onClick={onSubmit} disabled={isPending || !url}>
            {isPending ? t("common.adding") : t("common.add")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
