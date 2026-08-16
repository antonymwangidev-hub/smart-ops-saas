import {
  LayoutDashboard, Users, ShoppingCart, CheckSquare, Zap, BarChart3,
  Settings, Bell, LogOut, ChevronDown, FileText, Shield, Package, Receipt,
  CreditCard, Calculator, UserCog, Undo2, Truck, ClipboardList, Wallet,
  AlertCircle, TrendingUp, Building2, ArrowLeftRight, Clock, ClipboardCheck,
  Sparkles, DollarSign, Boxes, Briefcase, ChevronRight, MessageSquare,
} from "lucide-react";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { useOrgRole, ROLE_LEVEL, type OrgRole } from "@/hooks/useOrgRole";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type NavItem = { title: string; url: string; icon: any; minRole: OrgRole };
type NavGroup = { label: string; icon: any; items: NavItem[]; adminOnly?: boolean };

// ── Grouped navigation ─────────────────────────────────────────────────
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Sales", icon: DollarSign, items: [
      { title: "Today's Summary", url: "/daily-summary", icon: Calculator, minRole: "attendant" },
      { title: "POS", url: "/pos", icon: ShoppingCart, minRole: "attendant" },
      { title: "Orders", url: "/orders", icon: Receipt, minRole: "staff" },
      { title: "Credit (Deni)", url: "/credit-sales", icon: CreditCard, minRole: "cashier" },
      { title: "Returns", url: "/returns", icon: Undo2, minRole: "cashier" },
    ],
  },
  {
    label: "Customers", icon: Users, items: [
      { title: "Customers", url: "/customers", icon: Users, minRole: "staff" },
      { title: "WhatsApp Inbox", url: "/whatsapp", icon: MessageSquare, minRole: "staff" },
    ],
  },

  {
    label: "Inventory", icon: Boxes, items: [
      { title: "Products", url: "/products", icon: Package, minRole: "storekeeper" },
      { title: "Batches & Expiry", url: "/batches", icon: ClipboardCheck, minRole: "storekeeper" },
      { title: "Stock Take", url: "/stock-take", icon: ClipboardCheck, minRole: "storekeeper" },
      { title: "Suppliers", url: "/suppliers", icon: Truck, minRole: "storekeeper" },
      { title: "Purchase Orders", url: "/purchases", icon: ClipboardList, minRole: "storekeeper" },
      { title: "Stock Transfers", url: "/stock-transfers", icon: ArrowLeftRight, minRole: "storekeeper" },
    ],
  },
  {
    label: "Finance", icon: Wallet, items: [
      { title: "Expenses", url: "/expenses", icon: Wallet, minRole: "accountant" },
      { title: "Debtors", url: "/debtors", icon: AlertCircle, minRole: "accountant" },
      { title: "Cash Flow", url: "/finance", icon: TrendingUp, minRole: "accountant" },
    ],
  },
  {
    label: "Staff", icon: Briefcase, adminOnly: false, items: [
      { title: "Attendance", url: "/attendance", icon: Clock, minRole: "attendant" },
      { title: "Employees", url: "/staff", icon: UserCog, minRole: "admin" },
      { title: "Branches", url: "/branches", icon: Building2, minRole: "admin" },
    ],
  },
  {
    label: "Reports", icon: BarChart3, items: [
      { title: "Reports Hub", url: "/reports", icon: BarChart3, minRole: "staff" },
      { title: "Analytics", url: "/analytics", icon: BarChart3, minRole: "staff" },
      { title: "Expiry Report", url: "/reports/expiry", icon: AlertCircle, minRole: "staff" },
      { title: "Documents", url: "/documents", icon: FileText, minRole: "staff" },
    ],
  },
  {
    label: "AI Insights", icon: Sparkles, items: [
      { title: "Smart Alerts", url: "/automations", icon: Zap, minRole: "staff" },
      { title: "Tasks", url: "/tasks", icon: CheckSquare, minRole: "staff" },
    ],
  },
];

const secondaryItems: NavItem[] = [
  { title: "Notifications", url: "/notifications", icon: Bell, minRole: "cashier" },
  { title: "Settings", url: "/settings", icon: Settings, minRole: "cashier" },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut } = useAuth();
  const { currentOrg, organizations, setCurrentOrg } = useOrg();
  const { isPlatformAdmin } = usePlatformAdmin();
  const { role } = useOrgRole();
  const location = useLocation();

  const userLevel = ROLE_LEVEL[role as OrgRole] || 1;
  const canSee = (item: NavItem) => userLevel >= ROLE_LEVEL[item.minRole];

  // Track open state per group; auto-open the group containing the active route
  const activeGroup = NAV_GROUPS.find((g) => g.items.some((i) => i.url === location.pathname))?.label;
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    NAV_GROUPS.forEach((g) => (init[g.label] = g.label === "Sales" || g.label === activeGroup));
    return init;
  });
  useEffect(() => {
    if (activeGroup) setOpenGroups((prev) => ({ ...prev, [activeGroup]: true }));
  }, [activeGroup]);

  const renderItem = (item: NavItem) => {
    const active = location.pathname === item.url;
    return (
      <SidebarMenuItem key={item.url}>
        <SidebarMenuButton asChild isActive={active}>
          <NavLink
            to={item.url}
            end
            activeClassName="bg-primary/10 text-primary font-medium"
            className="rounded-lg transition-all duration-200 hover:bg-accent pl-6"
          >
            <item.icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} />
            {!collapsed && <span>{item.title}</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-border/50 p-4">
        {!collapsed ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/20">
                <Zap className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-base tracking-tight text-foreground leading-none">SmartOps</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Business OS</span>
              </div>
            </div>
            {organizations.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-full px-2.5 py-2 rounded-lg hover:bg-accent transition-all duration-200 border border-border/40">
                  <span className="truncate flex-1 text-left">{currentOrg?.name ?? "Select org"}</span>
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[220px]">
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
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center mx-auto shadow-lg shadow-primary/20">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-1 py-2">
        {/* Dashboard — top level */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.pathname === "/dashboard"}>
                  <NavLink
                    to="/dashboard"
                    end
                    activeClassName="bg-primary/10 text-primary font-medium"
                    className="rounded-lg transition-all duration-200 hover:bg-accent"
                  >
                    <LayoutDashboard className={`h-4 w-4 ${location.pathname === "/dashboard" ? "text-primary" : ""}`} />
                    {!collapsed && <span className="font-medium">Dashboard</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Collapsible groups */}
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter(canSee);
          if (visibleItems.length === 0) return null;

          // When collapsed sidebar, render as flat icon list
          if (collapsed) {
            return (
              <SidebarGroup key={group.label}>
                <SidebarGroupContent>
                  <SidebarMenu>{visibleItems.map(renderItem)}</SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          }

          const isOpen = openGroups[group.label] ?? false;
          const GroupIcon = group.icon;
          return (
            <SidebarGroup key={group.label} className="py-0">
              <Collapsible
                open={isOpen}
                onOpenChange={(o) => setOpenGroups((prev) => ({ ...prev, [group.label]: o }))}
              >
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-2 w-full px-2 py-1.5 text-xs uppercase tracking-wider text-muted-foreground/70 hover:text-foreground rounded-md transition-colors group">
                    <GroupIcon className="h-3.5 w-3.5" />
                    <span className="flex-1 text-left">{group.label}</span>
                    <ChevronRight
                      className={`h-3 w-3 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>{visibleItems.map(renderItem)}</SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </Collapsible>
            </SidebarGroup>
          );
        })}

        {/* Platform Admin */}
        {isPlatformAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground/70 px-2">Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.pathname === "/admin"}>
                    <NavLink to="/admin" end activeClassName="bg-primary/10 text-primary font-medium" className="rounded-lg transition-all duration-200 hover:bg-accent">
                      <Shield className={`h-4 w-4 ${location.pathname === "/admin" ? "text-primary" : ""}`} />
                      {!collapsed && <span>Platform Admin</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* System (Notifications + Settings) */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryItems.filter(canSee).map((item) => {
                const active = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active}>
                      <NavLink
                        to={item.url}
                        end
                        activeClassName="bg-primary/10 text-primary font-medium"
                        className="rounded-lg transition-all duration-200 hover:bg-accent"
                      >
                        <item.icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
