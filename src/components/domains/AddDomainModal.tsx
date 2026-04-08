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
            <p className="text-xs text-muted-foreground leading-relaxed mt-2">
              Digite o domínio que deseja usar. Na próxima tela, forneceremos os registros{" "}
              <span className="text-foreground font-medium">CNAME</span> e{" "}
              <span className="text-foreground font-medium">TXT</span>{" "}
              que você precisará configurar no seu provedor (Cloudflare, GoDaddy, HostGator, etc)
              para a emissão automática do seu certificado SSL.
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
