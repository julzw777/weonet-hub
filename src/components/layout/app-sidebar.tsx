import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  Package, 
  Ticket, 
  Network, 
  Archive, 
  Wifi, 
  BarChart3, 
  Settings 
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const menuItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
    group: "Overview"
  },
  {
    title: "Customers",
    url: "/customers",
    icon: Users,
    group: "Business"
  },
  {
    title: "Billing",
    url: "/billing",
    icon: CreditCard,
    group: "Business"
  },
  {
    title: "Plans",
    url: "/plans",
    icon: Package,
    group: "Business"
  },
  {
    title: "Tickets",
    url: "/tickets",
    icon: Ticket,
    group: "Operations"
  },
  {
    title: "Network",
    url: "/network",
    icon: Network,
    group: "Operations"
  },
  {
    title: "Inventory",
    url: "/inventory",
    icon: Archive,
    group: "Operations"
  },
  {
    title: "Hotspot",
    url: "/hotspot",
    icon: Wifi,
    group: "Services"
  },
  {
    title: "Reports",
    url: "/reports",
    icon: BarChart3,
    group: "Analytics"
  },
  {
    title: "Admin",
    url: "/admin",
    icon: Settings,
    group: "System"
  },
];

const groupedItems = menuItems.reduce((acc, item) => {
  if (!acc[item.group]) {
    acc[item.group] = [];
  }
  acc[item.group].push(item);
  return acc;
}, {} as Record<string, typeof menuItems>);

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;
  const collapsed = state === "collapsed";

  const isActive = (path: string) => {
    if (path === "/") {
      return currentPath === "/";
    }
    return currentPath.startsWith(path);
  };

  const getNavCls = (isActiveRoute: boolean) =>
    isActiveRoute 
      ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold border-l-2 border-primary" 
      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {/* Logo/Brand */}
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Network className="w-4 h-4 text-primary-foreground" />
            </div>
            {!collapsed && (
              <div>
                <h2 className="text-lg font-semibold text-sidebar-foreground">Weonet</h2>
                <p className="text-xs text-sidebar-foreground/70">Admin Dashboard</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Groups */}
        {Object.entries(groupedItems).map(([groupName, items]) => (
          <SidebarGroup key={groupName}>
            {!collapsed && (
              <SidebarGroupLabel className="text-[10px] font-medium text-sidebar-foreground/50 uppercase">
                {groupName}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink 
                        to={item.url}
                        className={getNavCls(isActive(item.url))}
                        title={collapsed ? item.title : undefined}
                      >
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}