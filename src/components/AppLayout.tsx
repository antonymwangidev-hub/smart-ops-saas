import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { ThemeToggle } from "./ThemeToggle";
import { CommandPalette } from "./CommandPalette";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { Navigate, useLocation, Link } from "react-router-dom";
import { Loader2, Search, Users, ShoppingCart, Calculator, CreditCard, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PresenceIndicator } from "@/components/PresenceIndicator";
import { usePresence } from "@/hooks/usePresence";
import { useIsMobile } from "@/hooks/use-mobile";

const mobileNavItems = [
  { label: "Sell", href: "/pos", icon: ShoppingCart },
  { label: "Today", href: "/daily-summary", icon: Calculator },
  { label: "Deni", href: "/credit-sales", icon: CreditCard },
  { label: "Stock", href: "/products", icon: Package },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { currentOrg, loading: orgLoading } = useOrg();
  const { onlineUsers, onlineCount } = usePresence();
  const isMobile = useIsMobile();
  const location = useLocation();

  if (authLoading || orgLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center premium-glow">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
          <span className="text-sm text-muted-foreground">Loading…</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!currentOrg) return <Navigate to="/onboarding" replace />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b border-border/50 px-4 bg-card/50 backdrop-blur-sm sticky top-0 z-30">
            <SidebarTrigger className="mr-4" />
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:flex items-center gap-2 text-muted-foreground h-8 px-3"
              onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            >
              <Search className="h-3.5 w-3.5" />
              <span className="text-xs">Search…</span>
              <kbd className="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                ⌘K
              </kbd>
            </Button>
            <div className="flex-1" />
            <div className="flex items-center gap-1.5 mr-3 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span>{onlineCount}</span>
              <div className="flex -space-x-1 ml-1">
                {onlineUsers.filter(u => u.status === "online").slice(0, 4).map(u => (
                  <PresenceIndicator key={u.user_id} status="online" name={u.display_name} />
                ))}
              </div>
            </div>
            <ThemeToggle />
          </header>
          <main className={`flex-1 p-4 sm:p-6 overflow-auto animate-fade-in ${isMobile ? "pb-20" : ""}`}>
            {children}
          </main>

          {/* Mobile bottom navigation */}
          {isMobile && (
            <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 safe-area-bottom">
              <div className="flex items-center justify-around h-16">
                {mobileNavItems.map((item) => {
                  const active = location.pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
                        active ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      <item.icon className="h-5 w-5" />
                      <span className="text-[10px] font-medium">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </nav>
          )}
        </div>
      </div>
      <CommandPalette />
    </SidebarProvider>
  );
}
