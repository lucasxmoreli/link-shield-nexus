import { LayoutDashboard, Globe, Megaphone, FileText, Settings, Shield, LogOut, FlaskConical, Ticket, CreditCard, ShieldAlert, BarChart2 } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();

  const baseItems = [
    { title: t("nav.dashboard"), url: "/dashboard", icon: LayoutDashboard },
    { title: t("nav.domains"), url: "/domains", icon: Globe },
    { title: t("nav.campaigns"), url: "/campaigns", icon: Megaphone },
    { title: t("nav.requests"), url: "/requests", icon: FileText },
    { title: t("nav.analytics"), url: "/analytics", icon: BarChart2 },
    { title: t("nav.cloakTest"), url: "/cloak-test", icon: FlaskConical },
    { title: t("nav.billing"), url: "/billing", icon: CreditCard },
    { title: t("nav.settings"), url: "/settings", icon: Settings },
  ];

  const adminItems = [
    { title: t("nav.adminUsers"), url: "/invite-codes", icon: Ticket },
    { title: "Admin Panel", url: "/admin", icon: ShieldAlert },
  ];

  const items = [...baseItems, ...(isAdmin ? adminItems : [])];

  return (
    <Sidebar collapsible="icon" className="border-r border-border/30 bg-[hsl(222,20%,2%)]">
      <div className="flex items-center justify-center py-5 border-b border-border/30">
        <Shield className="h-7 w-7 text-primary shrink-0 drop-shadow-[0_0_8px_hsl(222,100%,50%,0.5)]" />
        {!collapsed && (
          <span className="ml-2 text-lg font-bold tracking-tight text-foreground neon-text">
            CloakerX
          </span>
        )}
      </div>
      <SidebarContent className="pt-2 flex flex-col justify-between">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <TooltipProvider delayDuration={0}>
                {items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton asChild>
                          <NavLink
                            to={item.url}
                            end={item.url === "/"}
                            className="flex items-center justify-center gap-3 px-3 py-2.5 rounded-md text-sidebar-foreground hover:bg-primary/10 hover:text-primary transition-all duration-200"
                            activeClassName="bg-primary/15 text-primary font-semibold shadow-[0_0_12px_hsl(222,100%,50%,0.15)]"
                          >
                            <item.icon className="h-5 w-5 shrink-0" />
                            {!collapsed && <span className="text-sm">{item.title}</span>}
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
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <button
                    onClick={signOut}
                    className="flex items-center justify-center gap-3 px-3 py-2.5 rounded-md text-destructive/70 hover:bg-destructive/10 hover:text-destructive transition-all duration-200 w-full"
                  >
                    <LogOut className="h-5 w-5 shrink-0" />
                    {!collapsed && <span className="text-sm">{t("common.signOut")}</span>}
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
