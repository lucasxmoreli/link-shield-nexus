import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("domains.addDomainTitle")}</DialogTitle>
          <DialogDescription>{t("domains.addDomainDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <Label className="text-sm">{t("domains.domainUrl")}</Label>
            <Input
              placeholder={t("domains.domainUrlPlaceholder")}
              className="bg-secondary/50 border-border mt-1.5 font-mono"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && url) onSubmit(); }}
              autoFocus
            />
            <p className="text-sm text-amber-100/90 leading-relaxed mt-3 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2">
              {t("domains.addModalHint")}
            </p>
          </div>

          <Button className="w-full" onClick={onSubmit} disabled={isPending || !url}>
            {isPending ? t("common.adding") : t("common.add")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
