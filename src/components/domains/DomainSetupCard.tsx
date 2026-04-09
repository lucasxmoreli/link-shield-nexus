import { Copy, CheckCircle2, Loader2, AlertCircle, Shield, Clock, Trash2, Info, Cloud, HelpCircle } from "lucide-react";
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
    cloudflare_hostname_id: string | null;
    verification_errors?: string | null;
    // DCV CNAME (preferred, permanent)
    dcv_cname_name?: string | null;
    dcv_cname_target?: string | null;
    // TXT fallback (expires with cert)
    ssl_txt_name?: string | null;
    ssl_txt_value?: string | null;
    // Legacy — kept for backwards compat but no longer rendered
    ownership_token?: string | null;
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

// Reusable proxy indicator pill — shown in the Proxy row of each CNAME block.
// Proxied = routing path, needs Cloudflare interception. DNS only = raw CNAME,
// resolved directly by external CAs for certificate validation.
const ProxyIndicator = ({ proxied }: { proxied: boolean }) => {
  if (proxied) {
    return (
      <div className="flex items-center gap-1.5">
        <Cloud className="h-3.5 w-3.5 text-orange-500 fill-orange-500" />
        <span className="text-orange-400 font-medium text-[11px]">Ativado</span>
        <span className="text-[10px] text-muted-foreground">(nuvem laranja)</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <Cloud className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-muted-foreground font-medium text-[11px]">Desativado</span>
      <span className="text-[10px] text-muted-foreground">(DNS only, cinza)</span>
    </div>
  );
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

  // Determine which SSL validation method to show.
  // Priority: Delegated DCV CNAME > TXT fallback > degenerate (no tokens yet).
  const hasDcvCname = !!(domain.dcv_cname_name && domain.dcv_cname_target);
  const hasTxtFallback = !!(domain.ssl_txt_name && domain.ssl_txt_value);

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
        {/* Record 1: Main CNAME (routing) — MUST be proxied */}
        <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#004BFF]/15 text-[#004BFF] text-[10px] font-bold">1</span>
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Registro CNAME (Roteamento)</span>
          </div>

          <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 text-xs">
            <span className="text-muted-foreground font-mono">Tipo</span>
            <span className="font-mono text-foreground">CNAME</span>

            <span className="text-muted-foreground font-mono">Host</span>
            <div className="flex items-center gap-2 min-w-0">
              <code className="px-2 py-0.5 rounded bg-black/40 font-mono text-foreground border border-white/[0.06] shrink-0">@</code>
              <span className="text-[10px] text-muted-foreground truncate">(ou subdomínio: www, app, etc)</span>
            </div>

            <span className="text-muted-foreground font-mono">Aponta para</span>
            <div className="flex items-center gap-1.5 min-w-0">
              <code className="flex-1 px-2 py-1 rounded bg-black/40 font-mono text-[#004BFF] border border-[#004BFF]/20 truncate">
                {CNAME_TARGET}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground hover:bg-white/5"
                onClick={() => copyToClipboard(CNAME_TARGET, "CNAME")}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>

            <span className="text-muted-foreground font-mono">Proxy</span>
            <ProxyIndicator proxied={true} />
          </div>
        </div>

        {/* Record 2: SSL Validation — Delegated DCV CNAME (preferred) — MUST be DNS only */}
        {hasDcvCname && (
          <div className="rounded-md border border-emerald-500/15 bg-emerald-500/[0.03] p-3 space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold shrink-0">2</span>
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Registro CNAME (Validação SSL)</span>
              <Badge variant="outline" className="ml-auto text-[9px] uppercase border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shrink-0">
                Permanente
              </Badge>
            </div>

            <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 text-xs">
              <span className="text-muted-foreground font-mono">Tipo</span>
              <span className="font-mono text-foreground">CNAME</span>

              <span className="text-muted-foreground font-mono">Host</span>
              <div className="flex items-center gap-1.5 min-w-0">
                <code className="flex-1 px-2 py-1 rounded bg-black/40 font-mono text-foreground border border-white/[0.06] truncate text-[11px]">
                  {domain.dcv_cname_name}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground hover:bg-white/5"
                  onClick={() => copyToClipboard(domain.dcv_cname_name!, "Host CNAME")}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>

              <span className="text-muted-foreground font-mono">Aponta para</span>
              <div className="flex items-center gap-1.5 min-w-0">
                <code className="flex-1 px-2 py-1 rounded bg-black/40 font-mono text-emerald-400 border border-emerald-500/20 truncate text-[11px]">
                  {domain.dcv_cname_target}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground hover:bg-white/5"
                  onClick={() => copyToClipboard(domain.dcv_cname_target!, "Alvo CNAME")}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>

              <span className="text-muted-foreground font-mono">Proxy</span>
              <ProxyIndicator proxied={false} />
            </div>

            <div className="flex items-start gap-1.5 text-[10px] text-emerald-400/80 leading-relaxed pt-0.5">
              <Info className="h-3 w-3 shrink-0 mt-0.5" />
              <span>
                Este CNAME é permanente e renova o SSL automaticamente. Configure uma vez e esqueça.
              </span>
            </div>
          </div>
        )}

        {/* Record 2: SSL Validation — TXT fallback (used only if Delegated DCV unavailable) */}
        {!hasDcvCname && hasTxtFallback && (
          <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#004BFF]/15 text-[#004BFF] text-[10px] font-bold">2</span>
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Registro TXT (Validação SSL)</span>
            </div>

            <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 text-xs">
              <span className="text-muted-foreground font-mono">Tipo</span>
              <span className="font-mono text-foreground">TXT</span>

              <span className="text-muted-foreground font-mono">Host</span>
              <div className="flex items-center gap-1.5 min-w-0">
                <code className="flex-1 px-2 py-1 rounded bg-black/40 font-mono text-foreground border border-white/[0.06] truncate text-[11px]">
                  {domain.ssl_txt_name}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground hover:bg-white/5"
                  onClick={() => copyToClipboard(domain.ssl_txt_name!, "Host TXT")}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>

              <span className="text-muted-foreground font-mono">Valor</span>
              <div className="flex items-center gap-1.5 min-w-0">
                <code className="flex-1 px-2 py-1 rounded bg-black/40 font-mono text-[#004BFF] border border-[#004BFF]/20 truncate text-[11px]">
                  {domain.ssl_txt_value}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground hover:bg-white/5"
                  onClick={() => copyToClipboard(domain.ssl_txt_value!, "Valor TXT")}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>

              <span className="text-muted-foreground font-mono">Proxy</span>
              <ProxyIndicator proxied={false} />
            </div>
          </div>
        )}

        {/* Degenerate case: no SSL tokens captured yet */}
        {!hasDcvCname && !hasTxtFallback && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/[0.04] p-3">
            <Loader2 className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5 animate-spin" />
            <div className="text-[11px] text-amber-400/90 leading-relaxed">
              Aguardando geração do token de validação SSL pela Cloudflare. Clique em <span className="font-semibold">Verificar agora</span> em alguns segundos para capturar o registro.
            </div>
          </div>
        )}

        {/* Help block — collapsible, explains the proxy asymmetry */}
        <details className="group rounded-md border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/[0.03] transition-colors list-none">
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-[11px] text-muted-foreground flex-1">
              Por que um registro fica com proxy e o outro não?
            </span>
            <span className="text-[10px] text-muted-foreground/60 group-open:rotate-180 transition-transform shrink-0">
              ▼
            </span>
          </summary>
          <div className="px-3 pb-3 pt-1 space-y-2 text-[11px] text-muted-foreground leading-relaxed border-t border-white/[0.04]">
            <div className="flex items-start gap-2">
              <Cloud className="h-3 w-3 text-orange-500 fill-orange-500 shrink-0 mt-0.5" />
              <p>
                <span className="text-foreground font-medium">CNAME de Roteamento (proxy ativado):</span>{" "}
                precisa estar com a nuvem laranja para que a Cloudflare entregue o tráfego do seu domínio ao CloakerX com SSL, proteção contra bots e cache ativos.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Cloud className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
              <p>
                <span className="text-foreground font-medium">CNAME de Validação SSL (DNS only):</span>{" "}
                precisa estar com a nuvem cinza para que a Autoridade Certificadora consiga ler o registro e emitir o certificado SSL. Se ficar com proxy ativado, a emissão falha.
              </p>
            </div>
            <div className="flex items-start gap-2 pt-1 border-t border-white/[0.04] mt-2">
              <AlertCircle className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-amber-400/90">
                <span className="font-medium">Importante:</span> configure exatamente como mostrado. Não inverta os estados de proxy entre os dois registros.
              </p>
            </div>
          </div>
        </details>

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
        <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
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
