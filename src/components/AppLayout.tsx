import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { ThemeToggle } from "./ThemeToggle";
import { CommandPalette } from "./CommandPalette";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { Navigate } from "react-router-dom";
import { Loader2, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PresenceIndicator } from "@/components/PresenceIndicator";
import { usePresence } from "@/hooks/usePresence";

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { currentOrg, loading: orgLoading } = useOrg();
  const { onlineUsers, onlineCount } = usePresence();

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
            <ThemeToggle />
          </header>
          <main className="flex-1 p-6 overflow-auto animate-fade-in">
            {children}
          </main>
        </div>
      </div>
      <CommandPalette />
    </SidebarProvider>
  );
}
