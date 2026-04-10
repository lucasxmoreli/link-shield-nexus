import { useState } from "react";
import {
  Copy,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Shield,
  Clock,
  Trash2,
  Info,
  Cloud,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { DomainRow } from "@/hooks/useDomains";

const CNAME_TARGET = "cname.cloakerx.com";

// Card only needs a subset of DomainRow. Using Pick ensures type safety
// propagates automatically when the schema changes — no duplicate field lists.
type CardDomain = Pick<
  DomainRow,
  | "id"
  | "url"
  | "is_verified"
  | "ssl_status"
  | "cloudflare_hostname_id"
  | "verification_errors"
  | "dcv_cname_name"
  | "dcv_cname_target"
  | "ssl_txt_name"
  | "ssl_txt_value"
  | "ownership_token"
>;

interface DomainSetupCardProps {
  domain: CardDomain;
  // Contract change: these are now async and may throw.
  // Card manages its own loading state based on promise lifecycle.
  onVerify: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

// SSL status config. `isPending` is explicit data (not inferred by icon identity)
// so changing icons later doesn't silently break the spinning-animation logic.
interface SslConfig {
  label: string;
  className: string;
  icon: typeof CheckCircle2;
  isPending: boolean;
}

const getSslConfig = (status: string | null): SslConfig => {
  switch (status) {
    case "active":
      return {
        label: "SSL Ativo",
        className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
        icon: CheckCircle2,
        isPending: false,
      };
    case "pending_validation":
      return {
        label: "Aguardando validação DNS",
        className: "border-amber-500/30 bg-amber-500/10 text-amber-400",
        icon: Loader2,
        isPending: true,
      };
    case "pending_issuance":
      return {
        label: "Emitindo certificado",
        className: "border-amber-500/30 bg-amber-500/10 text-amber-400",
        icon: Loader2,
        isPending: true,
      };
    case "pending_deployment":
      return {
        label: "Implantando",
        className: "border-amber-500/30 bg-amber-500/10 text-amber-400",
        icon: Loader2,
        isPending: true,
      };
    default:
      return {
        label: status || "Pendente",
        className: "border-amber-500/30 bg-amber-500/10 text-amber-400",
        icon: Clock,
        isPending: false,
      };
  }
};

// Safe clipboard wrapper — navigator.clipboard.writeText can fail in insecure
// contexts, Safari private mode, iframes without permissions, etc. Failing
// silently and showing a success toast is lying to the user.
const copyToClipboard = async (value: string, label: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiado`);
  } catch (err) {
    console.error("[DomainSetupCard] clipboard write failed:", err);
    toast.error("Não foi possível copiar. Copie manualmente.");
  }
};

// Reusable proxy indicator pill — shown in the Proxy row of each CNAME block.
// Proxied = routing path, needs Cloudflare interception. DNS only = raw CNAME,
// resolved directly by external CAs for certificate validation.
const ProxyIndicator = ({ proxied }: { proxied: boolean }) => {
  if (proxied) {
    return (
      <div className="flex items-center gap-1.5">
        <Cloud className="h-3.5 w-3.5 text-orange-500 fill-orange-500" aria-hidden="true" />
        <span className="text-orange-400 font-medium text-[11px]">Ativado</span>
        <span className="text-[10px] text-muted-foreground">(nuvem laranja)</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <Cloud className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      <span className="text-muted-foreground font-medium text-[11px]">Desativado</span>
      <span className="text-[10px] text-muted-foreground">(DNS only, cinza)</span>
    </div>
  );
};

export function DomainSetupCard({ domain, onVerify, onDelete }: DomainSetupCardProps) {
  // Per-card loading states — isolated from other cards rendered by the parent.
  // Previously the parent passed global isDeleting/isVerifying flags which caused
  // all cards to show spinner when any single card was mid-action.
  const [isDeleting, setIsDeleting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const isBusy = isDeleting || isVerifying;

  // Narrow DCV/TXT values into locals so downstream JSX can use them without
  // non-null assertions (`!`). Also computed once instead of on every access.
  const dcvCnameName = domain.dcv_cname_name;
  const dcvCnameTarget = domain.dcv_cname_target;
  const sslTxtName = domain.ssl_txt_name;
  const sslTxtValue = domain.ssl_txt_value;

  const hasDcvCname = Boolean(dcvCnameName && dcvCnameTarget);
  const hasTxtFallback = Boolean(sslTxtName && sslTxtValue);

  const sslConfig = getSslConfig(domain.ssl_status);
  const SslIcon = sslConfig.icon;

  // Verify handler — manages its own loading state, awaits parent promise,
  // catches errors so a rejected promise never leaves the button stuck spinning.
  const handleVerify = async () => {
    if (isBusy) return;
    setIsVerifying(true);
    try {
      await onVerify(domain.id);
    } catch (err) {
      // Parent is expected to show a toast; log here for debugging.
      // Intentionally swallowed so we still reach the finally and reset state.
      console.error("[DomainSetupCard] verify failed:", err);
    } finally {
      setIsVerifying(false);
    }
  };

  // Delete handler — two phases: (1) open dialog, (2) user confirms.
  // Phase 2 awaits the parent promise, closes dialog only on completion
  // (success or failure), and resets loading state in finally.
  const handleDeleteConfirm = async () => {
    if (isBusy) return;
    setIsDeleting(true);
    try {
      await onDelete(domain.id);
      // On success, the parent will typically invalidate the domains query
      // and this component unmounts. The finally block still runs but any
      // state change on unmounted component is a no-op in React 18+.
      setShowDeleteDialog(false);
    } catch (err) {
      console.error("[DomainSetupCard] delete failed:", err);
      // Keep dialog open on failure so user can retry or cancel.
    } finally {
      setIsDeleting(false);
    }
  };

  // Truncate long domain names in the dialog title to prevent layout blowout.
  const dialogDomainLabel =
    domain.url.length > 48 ? `${domain.url.slice(0, 45)}…` : domain.url;

  return (
    <>
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.03] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-amber-500/10 bg-amber-500/[0.04]">
          <div className="flex items-center gap-2.5 min-w-0">
            <Shield className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-mono text-foreground truncate">{domain.url}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Configure os registros DNS abaixo no seu provedor de domínio
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={`text-[10px] font-medium uppercase tracking-wider ${sslConfig.className}`}
          >
            <SslIcon
              className={`h-3 w-3 mr-1 ${sslConfig.isPending ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {sslConfig.label}
          </Badge>
        </div>

        {/* DNS Records */}
        <div className="p-4 space-y-3">
          {/* Record 1: Main CNAME (routing) — MUST be proxied */}
          <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#004BFF]/15 text-[#004BFF] text-[10px] font-bold">
                1
              </span>
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Registro CNAME (Roteamento)
              </span>
            </div>

            <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 text-xs">
              <span className="text-muted-foreground font-mono">Tipo</span>
              <span className="font-mono text-foreground">CNAME</span>

              <span className="text-muted-foreground font-mono">Host</span>
              <div className="flex items-center gap-2 min-w-0">
                <code className="px-2 py-0.5 rounded bg-black/40 font-mono text-foreground border border-white/[0.06] shrink-0">
                  @
                </code>
                <span className="text-[10px] text-muted-foreground truncate">
                  (ou subdomínio: www, app, etc)
                </span>
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
                  aria-label="Copiar alvo do CNAME de roteamento"
                >
                  <Copy className="h-3 w-3" aria-hidden="true" />
                </Button>
              </div>

              <span className="text-muted-foreground font-mono">Proxy</span>
              <ProxyIndicator proxied={true} />
            </div>
          </div>

          {/* Record 2: SSL Validation — Delegated DCV CNAME (preferred) — MUST be DNS only */}
          {hasDcvCname && dcvCnameName && dcvCnameTarget && (
            <div className="rounded-md border border-emerald-500/15 bg-emerald-500/[0.03] p-3 space-y-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold shrink-0">
                  2
                </span>
                <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Registro CNAME (Validação SSL)
                </span>
                <Badge
                  variant="outline"
                  className="ml-auto text-[9px] uppercase border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shrink-0"
                >
                  Permanente
                </Badge>
              </div>

              <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 text-xs">
                <span className="text-muted-foreground font-mono">Tipo</span>
                <span className="font-mono text-foreground">CNAME</span>

                <span className="text-muted-foreground font-mono">Host</span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <code className="flex-1 px-2 py-1 rounded bg-black/40 font-mono text-foreground border border-white/[0.06] truncate text-[11px]">
                    {dcvCnameName}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground hover:bg-white/5"
                    onClick={() => copyToClipboard(dcvCnameName, "Host CNAME")}
                    aria-label="Copiar host do CNAME de validação SSL"
                  >
                    <Copy className="h-3 w-3" aria-hidden="true" />
                  </Button>
                </div>

                <span className="text-muted-foreground font-mono">Aponta para</span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <code className="flex-1 px-2 py-1 rounded bg-black/40 font-mono text-emerald-400 border border-emerald-500/20 truncate text-[11px]">
                    {dcvCnameTarget}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground hover:bg-white/5"
                    onClick={() => copyToClipboard(dcvCnameTarget, "Alvo CNAME")}
                    aria-label="Copiar alvo do CNAME de validação SSL"
                  >
                    <Copy className="h-3 w-3" aria-hidden="true" />
                  </Button>
                </div>

                <span className="text-muted-foreground font-mono">Proxy</span>
                <ProxyIndicator proxied={false} />
              </div>

              <div className="flex items-start gap-1.5 text-[10px] text-emerald-400/80 leading-relaxed pt-0.5">
                <Info className="h-3 w-3 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  Este CNAME é permanente e renova o SSL automaticamente. Configure uma vez e esqueça.
                </span>
              </div>
            </div>
          )}

          {/* Record 2: SSL Validation — TXT fallback (used only if Delegated DCV unavailable) */}
          {!hasDcvCname && hasTxtFallback && sslTxtName && sslTxtValue && (
            <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#004BFF]/15 text-[#004BFF] text-[10px] font-bold">
                  2
                </span>
                <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Registro TXT (Validação SSL)
                </span>
              </div>

              <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 text-xs">
                <span className="text-muted-foreground font-mono">Tipo</span>
                <span className="font-mono text-foreground">TXT</span>

                <span className="text-muted-foreground font-mono">Host</span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <code className="flex-1 px-2 py-1 rounded bg-black/40 font-mono text-foreground border border-white/[0.06] truncate text-[11px]">
                    {sslTxtName}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground hover:bg-white/5"
                    onClick={() => copyToClipboard(sslTxtName, "Host TXT")}
                    aria-label="Copiar host do TXT de validação SSL"
                  >
                    <Copy className="h-3 w-3" aria-hidden="true" />
                  </Button>
                </div>

                <span className="text-muted-foreground font-mono">Valor</span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <code className="flex-1 px-2 py-1 rounded bg-black/40 font-mono text-[#004BFF] border border-[#004BFF]/20 truncate text-[11px]">
                    {sslTxtValue}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground hover:bg-white/5"
                    onClick={() => copyToClipboard(sslTxtValue, "Valor TXT")}
                    aria-label="Copiar valor do TXT de validação SSL"
                  >
                    <Copy className="h-3 w-3" aria-hidden="true" />
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
              <Loader2 className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5 animate-spin" aria-hidden="true" />
              <div className="text-[11px] text-amber-400/90 leading-relaxed">
                Aguardando geração do token de validação SSL pela Cloudflare. Clique em{" "}
                <span className="font-semibold">Verificar agora</span> em alguns segundos para capturar o registro.
              </div>
            </div>
          )}

          {/* Help block — collapsible, explains the proxy asymmetry */}
          <details className="group rounded-md border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/[0.03] transition-colors list-none">
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
              <span className="text-[11px] text-muted-foreground flex-1">
                Por que um registro fica com proxy e o outro não?
              </span>
              <span
                className="text-[10px] text-muted-foreground/60 group-open:rotate-180 transition-transform shrink-0"
                aria-hidden="true"
              >
                ▼
              </span>
            </summary>
            <div className="px-3 pb-3 pt-1 space-y-2 text-[11px] text-muted-foreground leading-relaxed border-t border-white/[0.04]">
              <div className="flex items-start gap-2">
                <Cloud className="h-3 w-3 text-orange-500 fill-orange-500 shrink-0 mt-0.5" aria-hidden="true" />
                <p>
                  <span className="text-foreground font-medium">CNAME de Roteamento (proxy ativado):</span>{" "}
                  precisa estar com a nuvem laranja para que a Cloudflare entregue o tráfego do seu domínio ao CloakerX com SSL, proteção contra bots e cache ativos.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <Cloud className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
                <p>
                  <span className="text-foreground font-medium">CNAME de Validação SSL (DNS only):</span>{" "}
                  precisa estar com a nuvem cinza para que a Autoridade Certificadora consiga ler o registro e emitir o certificado SSL. Se ficar com proxy ativado, a emissão falha.
                </p>
              </div>
              <div className="flex items-start gap-2 pt-1 border-t border-white/[0.04] mt-2">
                <AlertCircle className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-amber-400/90">
                  <span className="font-medium">Importante:</span> configure exatamente como mostrado. Não inverta os estados de proxy entre os dois registros.
                </p>
              </div>
            </div>
          </details>

          {/* Verification Errors */}
          {domain.verification_errors && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/[0.04] p-2.5">
              <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
              <div className="text-[11px] text-destructive/90 leading-relaxed">
                {domain.verification_errors}
              </div>
            </div>
          )}

          {/* SSL Notice */}
          <div className="flex items-start gap-2 text-[11px] text-muted-foreground leading-relaxed pt-1">
            <Clock className="h-3 w-3 shrink-0 mt-0.5" aria-hidden="true" />
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
              disabled={isBusy}
              aria-busy={isDeleting}
              onClick={() => setShowDeleteDialog(true)}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" aria-hidden="true" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="h-3 w-3 mr-1.5" aria-hidden="true" />
                  Excluir
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-[#004BFF]/30 text-[#004BFF] hover:bg-[#004BFF]/10 hover:text-[#004BFF] h-8 text-xs"
              disabled={isBusy}
              aria-busy={isVerifying}
              onClick={handleVerify}
            >
              {isVerifying ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" aria-hidden="true" />
                  Verificando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3 mr-1.5" aria-hidden="true" />
                  Verificar agora
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog — replaces native window.confirm() */}
      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          // Prevent dismiss while the delete is in flight
          if (!open && isDeleting) return;
          setShowDeleteDialog(open);
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0" aria-hidden="true" />
              Excluir domínio
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground pt-2 space-y-2">
              <span className="block">
                Você está prestes a excluir{" "}
                <span className="font-mono text-foreground break-all">{dialogDomainLabel}</span>.
              </span>
              <span className="block text-amber-400/90 text-[13px]">
                Esta ação é <span className="font-semibold">permanente</span>. O domínio será removido da sua conta e do Cloudflare, e qualquer tráfego apontando para ele deixará de funcionar imediatamente.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Prevent default dialog close — we close manually after await
                e.preventDefault();
                handleDeleteConfirm();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" aria-hidden="true" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  Sim, excluir
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}