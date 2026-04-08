import { Copy, CheckCircle2, Loader2, AlertCircle, Shield, Clock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const CNAME_TARGET = "cname.cloakerx.com";

interface DomainSetupCardProps {
  domain: {
    id: string;
    url: string;
    is_verified: boolean | null;
    ssl_status: string | null;
    ownership_token: string | null;
    cloudflare_hostname_id: string | null;
    verification_errors?: string | null;
  };
  isVerifying: boolean;
  isDeleting: boolean;
  onVerify: (id: string) => void;
  onDelete: (id: string) => void;
}

const getSslConfig = (status: string | null) => {
  switch (status) {
    case "active":
      return {
        label: "SSL Ativo",
        className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
        icon: CheckCircle2,
      };
    case "pending_validation":
      return {
        label: "Aguardando validação DNS",
        className: "border-amber-500/30 bg-amber-500/10 text-amber-400",
        icon: Loader2,
      };
    case "pending_issuance":
      return {
        label: "Emitindo certificado",
        className: "border-amber-500/30 bg-amber-500/10 text-amber-400",
        icon: Loader2,
      };
    case "pending_deployment":
      return {
        label: "Implantando",
        className: "border-amber-500/30 bg-amber-500/10 text-amber-400",
        icon: Loader2,
      };
    default:
      return {
        label: status || "Pendente",
        className: "border-amber-500/30 bg-amber-500/10 text-amber-400",
        icon: Clock,
      };
  }
};

export function DomainSetupCard({ domain, isVerifying, isDeleting, onVerify, onDelete }: DomainSetupCardProps) {
  const { t } = useTranslation();

  const copyToClipboard = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copiado`);
  };

  const sslConfig = getSslConfig(domain.ssl_status);
  const SslIcon = sslConfig.icon;
  const isPending = sslConfig.icon === Loader2;
  const txtRecordHost = `_acme-challenge.${domain.url}`;

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.03] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-amber-500/10 bg-amber-500/[0.04]">
        <div className="flex items-center gap-2.5 min-w-0">
          <Shield className="h-4 w-4 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-mono text-foreground truncate">{domain.url}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Configure os registros DNS abaixo no seu provedor de domínio
            </p>
          </div>
        </div>
        <Badge variant="outline" className={`text-[10px] font-medium uppercase tracking-wider ${sslConfig.className}`}>
          <SslIcon className={`h-3 w-3 mr-1 ${isPending ? "animate-spin" : ""}`} />
          {sslConfig.label}
        </Badge>
      </div>

      {/* DNS Records */}
      <div className="p-4 space-y-3">
        {/* CNAME Record */}
        <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#004BFF]/15 text-[#004BFF] text-[10px] font-bold">1</span>
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Registro CNAME</span>
          </div>

          <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 text-xs">
            <span className="text-muted-foreground font-mono">Tipo</span>
            <span className="font-mono text-foreground">CNAME</span>

            <span className="text-muted-foreground font-mono">Host</span>
            <div className="flex items-center gap-2">
              <code className="px-2 py-0.5 rounded bg-black/40 font-mono text-foreground border border-white/[0.06]">@</code>
              <span className="text-[10px] text-muted-foreground">(ou subdomínio: www, app, etc)</span>
            </div>

            <span className="text-muted-foreground font-mono">Aponta para</span>
            <div className="flex items-center gap-1.5">
              <code className="flex-1 px-2 py-1 rounded bg-black/40 font-mono text-[#004BFF] border border-[#004BFF]/20 truncate">
                {CNAME_TARGET}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-white/5"
                onClick={() => copyToClipboard(CNAME_TARGET, "CNAME")}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>

        {/* TXT Validation Record (if exists) */}
        {domain.ownership_token && (
          <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#004BFF]/15 text-[#004BFF] text-[10px] font-bold">2</span>
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Registro TXT (Validação)</span>
            </div>

            <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 text-xs">
              <span className="text-muted-foreground font-mono">Tipo</span>
              <span className="font-mono text-foreground">TXT</span>

              <span className="text-muted-foreground font-mono">Host</span>
              <div className="flex items-center gap-1.5">
                <code className="flex-1 px-2 py-1 rounded bg-black/40 font-mono text-foreground border border-white/[0.06] truncate text-[11px]">
                  {txtRecordHost}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-white/5"
                  onClick={() => copyToClipboard(txtRecordHost, "Host TXT")}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>

              <span className="text-muted-foreground font-mono">Valor</span>
              <div className="flex items-center gap-1.5">
                <code className="flex-1 px-2 py-1 rounded bg-black/40 font-mono text-[#004BFF] border border-[#004BFF]/20 truncate text-[11px]">
                  {domain.ownership_token}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-white/5"
                  onClick={() => copyToClipboard(domain.ownership_token!, "Valor TXT")}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Verification Errors */}
        {domain.verification_errors && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/[0.04] p-2.5">
            <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
            <div className="text-[11px] text-destructive/90 leading-relaxed">
              {domain.verification_errors}
            </div>
          </div>
        )}

        {/* SSL Notice */}
        <div className="flex items-start gap-2 text-[11px] text-muted-foreground leading-relaxed pt-1">
          <Clock className="h-3 w-3 shrink-0 mt-0.5" />
          <span>
            O certificado SSL pode levar até <span className="text-foreground font-medium">15 minutos</span> para ser gerado
            após a propagação dos registros DNS. Você pode clicar em verificar a qualquer momento.
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive/70 hover:text-destructive hover:bg-destructive/10 h-8 text-xs"
            disabled={isDeleting || isVerifying}
            onClick={() => {
              if (confirm(`Excluir o domínio "${domain.url}"? Esta ação não pode ser desfeita.`)) {
                onDelete(domain.id);
              }
            }}
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                Excluindo...
              </>
            ) : (
              <>
                <Trash2 className="h-3 w-3 mr-1.5" />
                Excluir
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-[#004BFF]/30 text-[#004BFF] hover:bg-[#004BFF]/10 hover:text-[#004BFF] h-8 text-xs"
            disabled={isVerifying || isDeleting}
            onClick={() => onVerify(domain.id)}
          >
            {isVerifying ? (
              <>
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                Verificando...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3 w-3 mr-1.5" />
                Verificar agora
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
