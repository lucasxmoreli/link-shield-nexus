import { LayoutDashboard, Globe, Megaphone, FileText, Settings, Shield, LogOut, FlaskConical, Ticket } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
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

const baseItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Domains", url: "/domains", icon: Globe },
  { title: "Campaigns", url: "/campaigns", icon: Megaphone },
  { title: "Requests", url: "/requests", icon: FileText },
  { title: "Cloak Test", url: "/cloak-test", icon: FlaskConical },
  { title: "Settings", url: "/settings", icon: Settings },
];

const adminItems = [
  { title: "Convites", url: "/invite-codes", icon: Ticket },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut } = useAuth();
  const { isAdmin } = useAdmin();

  const items = [...baseItems, ...(isAdmin ? adminItems : [])];

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <div className="flex items-center gap-2 px-4 py-5 border-b border-border">
        <Shield className="h-7 w-7 text-primary shrink-0" />
        {!collapsed && (
          <span className="text-lg font-bold tracking-tight text-foreground neon-text">
            CloakGuard
          </span>
        )}
      </div>
      <SidebarContent className="pt-2 flex flex-col justify-between">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-primary/15 text-primary font-semibold neon-glow"
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
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
                    className="flex items-center gap-3 px-3 py-2.5 rounded-md text-destructive hover:bg-destructive/10 transition-colors w-full"
                  >
                    <LogOut className="h-5 w-5 shrink-0" />
                    {!collapsed && <span>Sair</span>}
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
