import { LayoutDashboard, Globe, Megaphone, FileText, Settings, Shield, LogOut, Ticket, CreditCard, ShieldAlert, BarChart2, Zap } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { useProfile } from "@/hooks/useProfile";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { calculateOverageCost } from "@/lib/plan-config";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut } = useAuth();
  const { isAdmin } = useAdmin();
  const { profile, planConfig, planName, isLoading: profileLoading } = useProfile();
  const { t } = useTranslation();

  const baseItems = [
    { title: t("nav.dashboard"), url: "/dashboard", icon: LayoutDashboard },
    { title: t("nav.domains"), url: "/domains", icon: Globe },
    { title: t("nav.campaigns"), url: "/campaigns", icon: Megaphone },
    { title: t("nav.requests"), url: "/requests", icon: FileText },
    { title: t("nav.analytics"), url: "/analytics", icon: BarChart2 },
    { title: t("nav.billing"), url: "/billing", icon: CreditCard },
    { title: t("nav.settings"), url: "/settings", icon: Settings },
  ];

  const adminItems = [
  { title: t("nav.adminCommandCenter"), url: "/admin", icon: ShieldAlert },
];

  const items = [...baseItems, ...(isAdmin ? adminItems : [])];

  // ── Cockpit de Consumo ──
  const currentClicks = profile?.current_clicks ?? 0;
  const maxClicks = profile?.max_clicks ?? 0;
  const isFreePlan = planConfig.isFree;
  const hasQuota = maxClicks > 0;
  const usagePercent = hasQuota ? Math.round((currentClicks / maxClicks) * 100) : 0;
  const isOverlimit = hasQuota && currentClicks > maxClicks;
  const progressValue = isOverlimit ? 100 : Math.min(usagePercent, 100);
  const { extraClicks, cost: overageCost } = calculateOverageCost(currentClicks, maxClicks, planConfig);

  const formatClicks = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border/30 bg-[hsl(222,20%,2%)]">
      {/* Logo */}
      <div className="flex items-center justify-center py-5 border-b border-border/30">
        <Shield className="h-7 w-7 text-primary shrink-0 drop-shadow-[0_0_8px_hsl(222,100%,50%,0.5)]" />
        {!collapsed && (
          <span className="ml-2 text-lg font-bold tracking-tight text-foreground neon-text">
            CloakerX
          </span>
        )}
      </div>

      <SidebarContent className="pt-2 flex flex-col justify-between">
        {/* Nav Items */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <TooltipProvider delayDuration={0}>
                {items.map((item) => (
                  <SidebarMenuItem key={item.url} className="px-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton asChild>
                          <NavLink
                            to={item.url}
                            end={item.url === "/"}
                            className={`flex items-center gap-3 rounded-md text-sidebar-foreground hover:bg-primary/10 hover:text-primary transition-all duration-200 ${
                              collapsed ? "justify-center px-0 py-2.5" : "justify-start px-3 py-2"
                            }`}
                            activeClassName="bg-primary/15 text-primary font-semibold shadow-[0_0_12px_hsl(222,100%,50%,0.15)]"
                          >
                            <item.icon className="h-[18px] w-[18px] shrink-0" />
                            {!collapsed && <span className="text-[13px] tracking-tight">{item.title}</span>}
                          </NavLink>
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      {collapsed && (
                        <TooltipContent side="right" className="bg-card border-border text-foreground">
                          {item.title}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </SidebarMenuItem>
                ))}
              </TooltipProvider>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Bottom Section: Cockpit + Logout */}
        <SidebarGroup>
          <SidebarGroupContent>
            {/* ── Cockpit Skeleton (enquanto carrega) ── */}
            {!collapsed && !profile && profileLoading && (
              <div className="mx-2 mb-3 rounded-lg border border-white/[0.04] bg-white/[0.01] p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="h-4 w-16 rounded bg-white/[0.04] animate-pulse" />
                  <div className="h-3 w-8 rounded bg-white/[0.04] animate-pulse" />
                </div>
                <div className="h-[3px] w-full rounded-full bg-white/[0.04]" />
                <div className="flex items-center justify-between">
                  <div className="h-3 w-12 rounded bg-white/[0.04] animate-pulse" />
                  <div className="h-3 w-10 rounded bg-white/[0.04] animate-pulse" />
                </div>
              </div>
            )}

            {/* ── Cockpit Financeiro (Expanded) ── */}
            {!collapsed && profile && (
              <div className="mx-2 mb-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-2.5">
                {/* Plan Badge + Usage % / OVERLIMIT badge */}
                <div className="flex items-center justify-between">
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-semibold uppercase tracking-[0.15em] px-2 py-0.5 ${
                      isOverlimit
                        ? "border-destructive/40 text-destructive bg-destructive/[0.06]"
                        : "border-[#004BFF]/40 text-[#004BFF] bg-[#004BFF]/[0.06]"
                    }`}
                  >
                    {planName}
                  </Badge>
                  {hasQuota && (
                    isOverlimit ? (
                      <Badge className="text-[10px] font-bold uppercase tracking-wider bg-destructive/20 text-destructive border border-destructive/30 px-1.5 py-0">
                        OVERLIMIT
                      </Badge>
                    ) : (
                      <span className="text-[10px] font-mono text-white/40">{usagePercent}%</span>
                    )
                  )}
                </div>

                {/* Progress Bar — azul normal / vermelho overlimit */}
                {hasQuota && (
                  <Progress
                    value={progressValue}
                    className="h-[3px] bg-white/[0.06] rounded-full"
                    indicatorClassName={`rounded-full transition-all duration-500 ${
                      isOverlimit
                        ? "bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.4)]"
                        : "bg-[#004BFF] shadow-[0_0_6px_rgba(0,75,255,0.3)]"
                    }`}
                  />
                )}

                {/* Linha 1: contador padrão clicks / max */}
                {hasQuota && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Zap className={`h-3 w-3 ${isOverlimit ? "text-destructive/60" : "text-white/20"}`} />
                      <span className="text-[11px] font-mono text-white/50 tracking-wide">
                        {formatClicks(currentClicks)}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-white/25">
                      / {formatClicks(maxClicks)}
                    </span>
                  </div>
                )}

                {/* Linha 2 (sutil): aviso de excedente */}
                {isOverlimit && extraClicks > 0 && (
                  <div className="text-[10px] font-mono text-muted-foreground leading-relaxed pt-0.5 border-t border-white/[0.04]">
                    Excedente: <span className="text-destructive/80">+{formatClicks(extraClicks)}</span>
                    <span className="text-white/30"> · </span>
                    Est. <span className="text-destructive/80">${overageCost.toFixed(2)}</span>
                  </div>
                )}

                {/* Free plan: CTA upgrade */}
                {isFreePlan && !hasQuota && (
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-3 w-3 text-white/20" />
                    <span className="text-[11px] font-mono text-white/30">upgrade required</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Cockpit Colapsado: dot pulsante quando overlimit ── */}
            {collapsed && hasQuota && (
              <div className="flex justify-center mb-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    {isOverlimit ? (
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive"></span>
                      </span>
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-[#004BFF]" />
                    )}
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-card border-border text-foreground font-mono text-xs">
                    {isOverlimit ? (
                      <div className="space-y-0.5">
                        <div className="text-destructive font-bold">OVERLIMIT</div>
                        <div>{formatClicks(currentClicks)} / {formatClicks(maxClicks)}</div>
                        <div className="text-destructive/80">+{formatClicks(extraClicks)} · ${overageCost.toFixed(2)}</div>
                      </div>
                    ) : (
                      <span>{formatClicks(currentClicks)} / {formatClicks(maxClicks)}</span>
                    )}
                  </TooltipContent>
                </Tooltip>
              </div>
            )}

            {/* Logout */}
            <SidebarMenu>
              <SidebarMenuItem className="px-2">
                <SidebarMenuButton asChild>
                  <button
                    onClick={signOut}
                    className={`flex items-center gap-3 rounded-md text-destructive/70 hover:bg-destructive/10 hover:text-destructive transition-all duration-200 w-full ${
                      collapsed ? "justify-center px-0 py-2.5" : "justify-start px-3 py-2"
                    }`}
                  >
                    <LogOut className="h-[18px] w-[18px] shrink-0" />
                    {!collapsed && <span className="text-[13px] tracking-tight">{t("common.signOut")}</span>}
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
