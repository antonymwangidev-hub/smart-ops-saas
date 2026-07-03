import { ReactNode, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { ThemeToggle } from "./ThemeToggle";
import { CommandPalette } from "./CommandPalette";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { useOrgRole } from "@/hooks/useOrgRole";
import { Navigate, useLocation, Link } from "react-router-dom";
import {
  Loader2, ShoppingCart, Calculator, CreditCard, Package, Menu, X,
  LayoutDashboard, Users, BarChart3, Wallet, Truck, ClipboardCheck,
  Bell, Settings, ClipboardList, TrendingUp, Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PresenceIndicator } from "@/components/PresenceIndicator";
import { RealtimeStatusIndicator } from "@/components/RealtimeStatusIndicator";
import { usePresence } from "@/hooks/usePresence";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// ── Bottom nav: 4 primary tabs every role sees ────────────────────────
const PRIMARY_NAV = [
  { label: "Today", href: "/daily-summary", icon: Calculator },
  { label: "Sell",  href: "/pos",           icon: ShoppingCart },
  { label: "Deni",  href: "/debtors",       icon: CreditCard },
  { label: "Stock", href: "/products",      icon: Package },
];

// ── "More" sheet items grouped by category ───────────────────────────
const MORE_GROUPS = [
  {
    label: "Sales",
    items: [
      { label: "Dashboard",    href: "/dashboard",    icon: LayoutDashboard },
      { label: "Credit Sales", href: "/credit-sales", icon: CreditCard },
      { label: "Returns",      href: "/returns",       icon: Undo2 },
    ],
  },
  {
    label: "Inventory",
    items: [
      { label: "Suppliers",       href: "/suppliers",       icon: Truck },
      { label: "Purchase Orders", href: "/purchases",        icon: ClipboardList },
      { label: "Stock Take",      href: "/stock-take",       icon: ClipboardCheck },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Expenses", href: "/expenses", icon: Wallet },
      { label: "Finance",  href: "/finance",  icon: TrendingUp },
      { label: "Analytics",href: "/analytics",icon: BarChart3 },
    ],
  },
  {
    label: "People",
    items: [
      { label: "Customers", href: "/customers",     icon: Users },
      { label: "Notifications", href: "/notifications", icon: Bell },
      { label: "Settings",  href: "/settings",       icon: Settings },
    ],
  },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { currentOrg, loading: orgLoading } = useOrg();
  const { onlineUsers, onlineCount } = usePresence();
  const { role } = useOrgRole();
  const isMobile = useIsMobile();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  if (authLoading || orgLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
          <span className="text-sm text-muted-foreground">Loading…</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!currentOrg) return <Navigate to="/onboarding" replace />;

  const isMoreActive = MORE_GROUPS
    .flatMap((g) => g.items)
    .some((i) => i.href === location.pathname);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {/* Desktop sidebar — hidden on mobile */}
        {!isMobile && <AppSidebar />}

        <div className="flex-1 flex flex-col min-w-0">
          {/* ── Top header ── */}
          <header className="h-14 flex items-center border-b border-border/50 px-3 sm:px-4 bg-card/80 backdrop-blur-sm sticky top-0 z-30 gap-2">
            {/* Desktop: sidebar toggle */}
            {!isMobile && <SidebarTrigger className="mr-2 shrink-0" />}

            {/* Mobile: org name */}
            {isMobile && (
              <span className="font-semibold text-foreground text-sm truncate flex-1 min-w-0">
                {currentOrg?.name || "SmartOps"}
              </span>
            )}

            {/* Desktop: spacer */}
            {!isMobile && <div className="flex-1" />}

            {/* Online presence — desktop only */}
            {!isMobile && (
              <div className="flex items-center gap-1.5 mr-2 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-success inline-block" />
                <span>{onlineCount} online</span>
                <div className="flex -space-x-1 ml-1">
                  {onlineUsers.filter((u) => u.status === "online").slice(0, 4).map((u) => (
                    <PresenceIndicator key={u.user_id} status="online" name={u.display_name} />
                  ))}
                </div>
              </div>
            )}

            <RealtimeStatusIndicator compact={isMobile} />
            <ThemeToggle />
          </header>

          {/* ── Page content ── */}
          <main className={`flex-1 p-3 sm:p-6 overflow-auto animate-fade-in ${isMobile ? "pb-24" : ""}`}>
            {children}
          </main>

          {/* ── Mobile bottom nav ── */}
          {isMobile && (
            <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 safe-area-bottom">
              <div className="flex items-stretch h-16">
                {PRIMARY_NAV.map((item) => {
                  const active = location.pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      className="flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors active:bg-accent"
                      onClick={() => setMoreOpen(false)}
                    >
                      {/* Active bar indicator at top */}
                      {active && (
                        <span className="absolute top-0 left-1/4 right-1/4 h-0.5 rounded-full bg-primary" />
                      )}
                      <div className={`flex items-center justify-center h-8 w-8 rounded-xl transition-colors ${
                        active ? "bg-primary/10" : ""
                      }`}>
                        <item.icon className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <span className={`text-[11px] font-medium leading-none ${
                        active ? "text-primary" : "text-muted-foreground"
                      }`}>
                        {item.label}
                      </span>
                    </Link>
                  );
                })}

                {/* More button */}
                <button
                  onClick={() => setMoreOpen(true)}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors active:bg-accent ${
                    isMoreActive ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {isMoreActive && (
                    <span className="absolute top-0 left-1/4 right-1/4 h-0.5 rounded-full bg-primary" />
                  )}
                  <div className={`flex items-center justify-center h-8 w-8 rounded-xl transition-colors ${
                    isMoreActive ? "bg-primary/10" : ""
                  }`}>
                    <Menu className={`h-5 w-5 ${isMoreActive ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <span className={`text-[11px] font-medium leading-none ${
                    isMoreActive ? "text-primary" : "text-muted-foreground"
                  }`}>
                    More
                  </span>
                </button>
              </div>
            </nav>
          )}
        </div>
      </div>

      {/* ── "More" slide-up sheet ── */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[75vh] rounded-t-2xl overflow-y-auto pb-8">
          <SheetHeader className="flex-row items-center justify-between pb-2">
            <SheetTitle className="text-base">Menu</SheetTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMoreOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </SheetHeader>

          <div className="space-y-5 pt-2">
            {MORE_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                  {group.label}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {group.items.map((item) => {
                    const active = location.pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        onClick={() => setMoreOpen(false)}
                        className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl border transition-colors active:scale-95 ${
                          active
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "border-border bg-card text-muted-foreground"
                        }`}
                      >
                        <item.icon className="h-5 w-5" />
                        <span className="text-[11px] font-medium text-center leading-tight">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <CommandPalette />
    </SidebarProvider>
  );
}
