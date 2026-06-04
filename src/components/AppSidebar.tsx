import {
  LayoutDashboard, Users, ShoppingCart, CheckSquare, Zap, BarChart3, Settings, Bell, LogOut, ChevronDown, FileText, Shield, Package, Receipt, CreditCard, Calculator, UserCog, Undo2, Truck, ClipboardList
} from "lucide-react";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { useOrgRole } from "@/hooks/useOrgRole";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const posItems = [
  { title: "Sell", url: "/pos", icon: ShoppingCart, minRole: "attendant" as const },
  { title: "Today's Sales", url: "/daily-summary", icon: Calculator, minRole: "attendant" as const },
  { title: "Credit (Deni)", url: "/credit-sales", icon: CreditCard, minRole: "staff" as const },
  { title: "Returns", url: "/returns", icon: Undo2, minRole: "staff" as const },
  { title: "Products", url: "/products", icon: Package, minRole: "staff" as const },
];

const manageItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, minRole: "staff" as const },
  { title: "Customers", url: "/customers", icon: Users, minRole: "staff" as const },
  { title: "Orders", url: "/orders", icon: Receipt, minRole: "staff" as const },
  { title: "Tasks", url: "/tasks", icon: CheckSquare, minRole: "staff" as const },
  { title: "Automations", url: "/automations", icon: Zap, minRole: "staff" as const },
  { title: "Documents", url: "/documents", icon: FileText, minRole: "staff" as const },
  { title: "Analytics", url: "/analytics", icon: BarChart3, minRole: "staff" as const },
  { title: "Suppliers", url: "/suppliers", icon: Truck, minRole: "staff" as const },
  { title: "Purchase Orders", url: "/purchases", icon: ClipboardList, minRole: "staff" as const },
];

const secondaryItems = [
  { title: "Notifications", url: "/notifications", icon: Bell, minRole: "staff" as const },
  { title: "Settings", url: "/settings", icon: Settings, minRole: "staff" as const },
];

const ROLE_LEVEL = { admin: 3, staff: 2, attendant: 1 } as const;
type RoleName = keyof typeof ROLE_LEVEL;

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut, user } = useAuth();
  const { currentOrg, organizations, setCurrentOrg } = useOrg();
  const { isPlatformAdmin } = usePlatformAdmin();
  const { role } = useOrgRole();
  const location = useLocation();

  const userLevel = ROLE_LEVEL[role as RoleName] || 1;

  const filterByRole = <T extends { minRole: RoleName }>(items: T[]) =>
    items.filter((item) => userLevel >= ROLE_LEVEL[item.minRole]);

  const visiblePosItems = filterByRole(posItems);
  const visibleManageItems = filterByRole(manageItems);
  const visibleSecondaryItems = filterByRole(secondaryItems);

  const renderNavItems = (items: typeof posItems) =>
    items.map((item) => {
      const active = location.pathname === item.url;
      return (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton asChild isActive={active}>
            <NavLink
              to={item.url}
              end
              activeClassName="bg-primary/10 text-primary font-medium border-l-2 border-primary"
              className="rounded-lg transition-all duration-200 hover:bg-accent"
            >
              <item.icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} />
              {!collapsed && <span>{item.title}</span>}
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-border/50 p-4">
        {!collapsed ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
                <Zap className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-lg tracking-tight text-foreground">SmartOps</span>
            </div>
            {organizations.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-full px-2 py-1.5 rounded-lg hover:bg-accent transition-all duration-200">
                  <span className="truncate">{currentOrg?.name ?? "Select org"}</span>
                  <ChevronDown className="h-3 w-3 ml-auto opacity-50" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[200px]">
                  {organizations.map((org) => (
                    <DropdownMenuItem key={org.id} onClick={() => setCurrentOrg(org)}>
                      {org.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ) : (
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mx-auto shadow-lg shadow-primary/20">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground/70 px-2">POS</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderNavItems(visiblePosItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {visibleManageItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground/70 px-2">Manage</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderNavItems(visibleManageItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Owner-only: Staff Management */}
        {role === "admin" && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground/70 px-2">Business</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.pathname === "/staff"}>
                    <NavLink
                      to="/staff"
                      end
                      activeClassName="bg-primary/10 text-primary font-medium border-l-2 border-primary"
                      className="rounded-lg transition-all duration-200 hover:bg-accent"
                    >
                      <UserCog className={`h-4 w-4 ${location.pathname === "/staff" ? "text-primary" : ""}`} />
                      {!collapsed && <span>Staff Management</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isPlatformAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground/70 px-2">Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.pathname === "/admin"}>
                    <NavLink
                      to="/admin"
                      end
                      activeClassName="bg-primary/10 text-primary font-medium border-l-2 border-primary"
                      className="rounded-lg transition-all duration-200 hover:bg-accent"
                    >
                      <Shield className={`h-4 w-4 ${location.pathname === "/admin" ? "text-primary" : ""}`} />
                      {!collapsed && <span>Platform Admin</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {visibleSecondaryItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground/70 px-2">System</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderNavItems(visibleSecondaryItems)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-border/50 p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={signOut}
              className="text-muted-foreground hover:text-destructive rounded-lg transition-all duration-200"
            >
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Sign out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
