// =============================================================================
// Sprint 2 — Funil de Conversão · Item 2.3
// =============================================================================
// Diagrama visual do caminho que o tráfego faz: Visitante → Domínio do user
// → CNAME (DNS) → Cloudflare Edge → Motor CloakerX. Cada nó acende de acordo
// com o estado real da verificação, permitindo ao usuário ver *onde* está o
// problema sem ler a tabela de registros DNS.
//
// Design notes:
//   • Horizontal no desktop (≥ md), vertical no mobile — flex-col md:flex-row.
//   • Três estados por nó: "done" (verde), "current" (âmbar pulsante),
//     "pending" (cinza). Derivados de cnameOk + sslStatus + isVerified.
//   • Pure presentational — sem side-effects, sem fetch, recebe estado por prop.
//   • Sem novas libs: lucide-react + Tailwind apenas.
// =============================================================================

import { Globe, Link2, Cloud, ShieldCheck, Zap, Check, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

type NodeState = "done" | "current" | "pending";

interface DnsFlowDiagramProps {
  /** Domínio do usuário (ex: "links.minhaempresa.com") */
  domain: string;
  /** CNAME já resolve para cname.cloakerx.com? (from verify-domain response) */
  cnameOk: boolean;
  /** Status SSL do Cloudflare Custom Hostname */
  sslStatus: string | null;
  /** Domínio totalmente verificado e ativo? */
  isVerified: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Máquina de estados: deriva o "current step" da verificação.
//
// Ordem do fluxo (5 nós):
//   0 Visitante   → sempre "done" (simbólico)
//   1 Domínio     → "done" se o user cadastrou o domínio (sempre true aqui)
//   2 CNAME       → "done" se cnameOk, "current" caso contrário
//   3 Cloudflare  → "done" se ssl=active, "current" se pending_*, senão "pending"
//   4 CloakerX    → "done" se isVerified, "pending" caso contrário
// ─────────────────────────────────────────────────────────────────────────────
function computeNodeStates(
  cnameOk: boolean,
  sslStatus: string | null,
  isVerified: boolean,
): [NodeState, NodeState, NodeState, NodeState, NodeState] {
  // Visitante + Domínio cadastrado: sempre OK (o fato de existir o card prova)
  const visitor: NodeState = "done";
  const userDomain: NodeState = "done";

  // CNAME: done quando resolve corretamente
  const cname: NodeState = cnameOk ? "done" : "current";

  // Cloudflare: precisa do CNAME resolvido + SSL ativo
  let cloudflare: NodeState;
  if (!cnameOk) {
    cloudflare = "pending";
  } else if (sslStatus === "active") {
    cloudflare = "done";
  } else if (sslStatus && sslStatus.startsWith("pending_")) {
    cloudflare = "current";
  } else {
    cloudflare = "pending";
  }

  // CloakerX Engine: só fica verde quando TUDO verificado
  const cloakerx: NodeState = isVerified ? "done" : "pending";

  return [visitor, userDomain, cname, cloudflare, cloakerx];
}

// ─────────────────────────────────────────────────────────────────────────────
// Nó individual — responsivo, acessível, status-aware
// ─────────────────────────────────────────────────────────────────────────────

interface NodeProps {
  state: NodeState;
  icon: typeof Globe;
  label: string;
  subtitle?: string;
}

const STATE_STYLES: Record<
  NodeState,
  { ring: string; bg: string; icon: string; label: string; badge: string }
> = {
  done: {
    ring: "ring-emerald-500/40 ring-2",
    bg: "bg-emerald-500/10",
    icon: "text-emerald-400",
    label: "text-emerald-300",
    badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  },
  current: {
    ring: "ring-amber-500/50 ring-2 animate-pulse",
    bg: "bg-amber-500/10",
    icon: "text-amber-400",
    label: "text-amber-300",
    badge: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  },
  pending: {
    ring: "ring-white/[0.08] ring-1",
    bg: "bg-white/[0.02]",
    icon: "text-muted-foreground/50",
    label: "text-muted-foreground/70",
    badge: "bg-white/[0.04] text-muted-foreground/60 border-white/[0.06]",
  },
};

function FlowNode({ state, icon: Icon, label, subtitle }: NodeProps) {
  const s = STATE_STYLES[state];

  return (
    <div className="flex md:flex-col items-center md:text-center gap-3 md:gap-2 min-w-0 md:flex-1">
      {/* Círculo com ícone + badge de status sobreposto */}
      <div className="relative shrink-0">
        <div
          className={`flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-full ${s.bg} ${s.ring} transition-all duration-300`}
        >
          <Icon className={`h-5 w-5 md:h-6 md:w-6 ${s.icon}`} aria-hidden="true" />
        </div>
        {/* Status dot no canto inferior direito do círculo */}
        <span
          className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background ${
            state === "done"
              ? "bg-emerald-500"
              : state === "current"
                ? "bg-amber-500"
                : "bg-muted-foreground/30"
          }`}
          aria-label={state}
        >
          {state === "done" && <Check className="h-2.5 w-2.5 text-background" strokeWidth={3} aria-hidden="true" />}
          {state === "current" && (
            <Loader2 className="h-2.5 w-2.5 text-background animate-spin" strokeWidth={3} aria-hidden="true" />
          )}
        </span>
      </div>

      {/* Label + subtitle */}
      <div className="min-w-0 flex-1 md:flex-initial">
        <p className={`text-[11px] md:text-xs font-semibold uppercase tracking-wider ${s.label}`}>
          {label}
        </p>
        {subtitle && (
          <p className="text-[10px] md:text-[10px] text-muted-foreground/70 mt-0.5 md:truncate">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Conector entre nós — animação sutil quando o fluxo está "fluindo"
// ─────────────────────────────────────────────────────────────────────────────

function Connector({ active }: { active: boolean }) {
  return (
    <div
      className="flex items-center justify-center shrink-0 md:flex-1"
      aria-hidden="true"
    >
      {/* Mobile: linha vertical curta entre ícones */}
      <div className="md:hidden h-6 w-px bg-gradient-to-b from-white/[0.08] to-transparent" />

      {/* Desktop: linha horizontal com gradient e ponto "fluindo" quando ativo */}
      <div className="hidden md:block relative w-full h-px">
        <div
          className={`h-px w-full ${
            active
              ? "bg-gradient-to-r from-emerald-500/40 via-emerald-500/60 to-emerald-500/40"
              : "bg-white/[0.06]"
          }`}
        />
        {active && (
          <span className="absolute -top-[3px] left-0 h-[7px] w-[7px] rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-[flow_2.5s_ease-in-out_infinite]" />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

export function DnsFlowDiagram({ domain, cnameOk, sslStatus, isVerified }: DnsFlowDiagramProps) {
  const { t } = useTranslation();
  const [visitor, userDomain, cname, cloudflare, cloakerx] = computeNodeStates(
    cnameOk,
    sslStatus,
    isVerified,
  );

  // Nó "conectado" = ambos os lados done → linha animada com ponto correndo
  const conn1 = visitor === "done" && userDomain === "done";
  const conn2 = userDomain === "done" && cname === "done";
  const conn3 = cname === "done" && cloudflare === "done";
  const conn4 = cloudflare === "done" && cloakerx === "done";

  // Truncamento defensivo — domínios longos quebrariam o layout
  const displayDomain = domain.length > 28 ? `${domain.slice(0, 25)}…` : domain;

  // Copy textual abaixo do diagrama, contextual ao estado atual
  let summary: string;
  let summaryClass: string;
  if (isVerified) {
    summary = t("domains.flowDiagram.summaryVerified");
    summaryClass = "text-emerald-400/90";
  } else if (!cnameOk) {
    summary = t("domains.flowDiagram.summaryCnameMissing");
    summaryClass = "text-amber-400/90";
  } else if (sslStatus && sslStatus.startsWith("pending")) {
    summary = t("domains.flowDiagram.summarySslPending");
    summaryClass = "text-amber-400/90";
  } else {
    summary = t("domains.flowDiagram.summaryWaiting");
    summaryClass = "text-muted-foreground";
  }

  return (
    <div className="rounded-lg border border-white/[0.06] bg-gradient-to-br from-white/[0.02] to-transparent p-4 md:p-5">
      {/* Header */}
      <div className="mb-4 md:mb-5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
          {t("domains.flowDiagram.title")}
        </h4>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {t("domains.flowDiagram.subtitle")}
        </p>
      </div>

      {/* Flow: responsive layout */}
      <div
        className="flex flex-col md:flex-row md:items-center gap-2 md:gap-0"
        role="img"
        aria-label={t("domains.flowDiagram.ariaLabel")}
      >
        <FlowNode
          state={visitor}
          icon={Globe}
          label={t("domains.flowDiagram.nodeVisitor")}
          subtitle={t("domains.flowDiagram.nodeVisitorSub")}
        />
        <Connector active={conn1} />

        <FlowNode
          state={userDomain}
          icon={Link2}
          label={t("domains.flowDiagram.nodeDomain")}
          subtitle={displayDomain}
        />
        <Connector active={conn2} />

        <FlowNode
          state={cname}
          icon={ShieldCheck}
          label={t("domains.flowDiagram.nodeCname")}
          subtitle="cname.cloakerx.com"
        />
        <Connector active={conn3} />

        <FlowNode
          state={cloudflare}
          icon={Cloud}
          label={t("domains.flowDiagram.nodeCloudflare")}
          subtitle={t("domains.flowDiagram.nodeCloudflareSub")}
        />
        <Connector active={conn4} />

        <FlowNode
          state={cloakerx}
          icon={Zap}
          label={t("domains.flowDiagram.nodeEngine")}
          subtitle={t("domains.flowDiagram.nodeEngineSub")}
        />
      </div>

      {/* Summary contextual */}
      <p className={`text-[11px] leading-relaxed mt-4 md:mt-5 ${summaryClass}`}>{summary}</p>

      {/* Keyframes inline — animação do ponto "fluindo" na linha conectora */}
      <style>{`
        @keyframes flow {
          0%   { left: 0%;   opacity: 0; }
          10%  {              opacity: 1; }
          90%  {              opacity: 1; }
          100% { left: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
