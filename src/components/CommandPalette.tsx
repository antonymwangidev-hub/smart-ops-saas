import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  BarChart3, Users, ShoppingCart, CheckSquare, FileText, Bell,
  Settings, Zap, Bot, Search, LayoutDashboard, Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SearchResult {
  id: string;
  type: "customer" | "order" | "task" | "document";
  title: string;
  subtitle?: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();
  const { currentOrg } = useOrg();

  // Cmd+K / Ctrl+K to open
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Cross-entity search
  const search = useCallback(
    async (q: string) => {
      if (!q.trim() || !currentOrg) {
        setResults([]);
        return;
      }
      setSearching(true);
      const term = `%${q}%`;

      const [customers, orders, tasks, docs] = await Promise.all([
        supabase
          .from("customers")
          .select("id, name, email")
          .eq("organization_id", currentOrg.id)
          .or(`name.ilike.${term},email.ilike.${term}`)
          .limit(5),
        supabase
          .from("orders")
          .select("id, amount, status, notes")
          .eq("organization_id", currentOrg.id)
          .or(`status.ilike.${term},notes.ilike.${term}`)
          .limit(5),
        supabase
          .from("tasks")
          .select("id, title, status")
          .eq("organization_id", currentOrg.id)
          .ilike("title", term)
          .limit(5),
        supabase
          .from("file_attachments")
          .select("id, file_name, entity_type")
          .eq("organization_id", currentOrg.id)
          .eq("entity_type", "business_document")
          .ilike("file_name", term)
          .limit(5),
      ]);

      const r: SearchResult[] = [
        ...(customers.data?.map((c) => ({
          id: c.id,
          type: "customer" as const,
          title: c.name,
          subtitle: c.email || undefined,
        })) || []),
        ...(orders.data?.map((o) => ({
          id: o.id,
          type: "order" as const,
          title: `Order — ${o.status}`,
          subtitle: `$${o.amount}`,
        })) || []),
        ...(tasks.data?.map((t) => ({
          id: t.id,
          type: "task" as const,
          title: t.title,
          subtitle: t.status,
        })) || []),
        ...(docs.data?.map((d) => ({
          id: d.id,
          type: "document" as const,
          title: d.file_name,
          subtitle: "Business Document",
        })) || []),
      ];

      setResults(r);
      setSearching(false);
    },
    [currentOrg]
  );

  useEffect(() => {
    const timer = setTimeout(() => search(query), 250);
    return () => clearTimeout(timer);
  }, [query, search]);

  const goTo = (path: string) => {
    setOpen(false);
    setQuery("");
    navigate(path);
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case "customer": return <Users className="h-4 w-4 text-primary" />;
      case "order": return <ShoppingCart className="h-4 w-4 text-accent-foreground" />;
      case "task": return <CheckSquare className="h-4 w-4 text-muted-foreground" />;
      case "document": return <FileText className="h-4 w-4 text-muted-foreground" />;
      default: return <Search className="h-4 w-4" />;
    }
  };

  const typeColor = (type: string): "default" | "secondary" | "outline" => {
    switch (type) {
      case "customer": return "default";
      case "order": return "secondary";
      default: return "outline";
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search customers, orders, tasks, docs… or jump to a page"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {searching ? "Searching…" : "No results found. Try a different search."}
        </CommandEmpty>

        {/* Quick Navigation */}
        {!query && (
          <>
            <CommandGroup heading="Navigate">
              <CommandItem onSelect={() => goTo("/dashboard")}>
                <LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard
              </CommandItem>
              <CommandItem onSelect={() => goTo("/customers")}>
                <Users className="mr-2 h-4 w-4" /> Customers
              </CommandItem>
              <CommandItem onSelect={() => goTo("/orders")}>
                <ShoppingCart className="mr-2 h-4 w-4" /> Orders
              </CommandItem>
              <CommandItem onSelect={() => goTo("/tasks")}>
                <CheckSquare className="mr-2 h-4 w-4" /> Tasks
              </CommandItem>
              <CommandItem onSelect={() => goTo("/documents")}>
                <FileText className="mr-2 h-4 w-4" /> Documents
              </CommandItem>
              <CommandItem onSelect={() => goTo("/analytics")}>
                <BarChart3 className="mr-2 h-4 w-4" /> Analytics
              </CommandItem>
              <CommandItem onSelect={() => goTo("/automations")}>
                <Zap className="mr-2 h-4 w-4" /> Automations
              </CommandItem>
              <CommandItem onSelect={() => goTo("/notifications")}>
                <Bell className="mr-2 h-4 w-4" /> Notifications
              </CommandItem>
              <CommandItem onSelect={() => goTo("/settings")}>
                <Settings className="mr-2 h-4 w-4" /> Settings
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Quick Actions">
              <CommandItem onSelect={() => goTo("/customers")}>
                <Plus className="mr-2 h-4 w-4" /> Add Customer
              </CommandItem>
              <CommandItem onSelect={() => goTo("/orders")}>
                <Plus className="mr-2 h-4 w-4" /> Create Order
              </CommandItem>
              <CommandItem onSelect={() => goTo("/tasks")}>
                <Plus className="mr-2 h-4 w-4" /> New Task
              </CommandItem>
              <CommandItem onSelect={() => goTo("/documents")}>
                <Plus className="mr-2 h-4 w-4" /> Upload Document
              </CommandItem>
            </CommandGroup>
          </>
        )}

        {/* Search Results */}
        {query && results.length > 0 && (
          <CommandGroup heading="Results">
            {results.map((r) => (
              <CommandItem
                key={`${r.type}-${r.id}`}
                onSelect={() => {
                  const paths: Record<string, string> = {
                    customer: "/customers",
                    order: "/orders",
                    task: "/tasks",
                    document: "/documents",
                  };
                  goTo(paths[r.type] || "/dashboard");
                }}
              >
                {typeIcon(r.type)}
                <span className="ml-2 flex-1">{r.title}</span>
                {r.subtitle && (
                  <span className="text-xs text-muted-foreground mr-2">{r.subtitle}</span>
                )}
                <Badge variant={typeColor(r.type)} className="text-[10px] px-1.5 py-0">
                  {r.type}
                </Badge>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
