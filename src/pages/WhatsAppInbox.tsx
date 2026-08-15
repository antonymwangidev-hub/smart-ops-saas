import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MessageSquare, Send, Search, Link2, RefreshCw } from "lucide-react";

interface WaMessage {
  id: string;
  customer_id: string | null;
  direction: "inbound" | "outbound";
  channel: string;
  phone: string;
  body: string | null;
  template_name: string | null;
  status: string;
  error: string | null;
  matched: boolean;
  created_at: string;
}

interface Thread {
  key: string;
  phone: string;
  customerId: string | null;
  name: string;
  messages: WaMessage[];
  last: WaMessage;
  unmatched: boolean;
}

export default function WhatsAppInbox() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [linkTarget, setLinkTarget] = useState("");

  const { data: messages, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["whatsapp_messages", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [] as WaMessage[];
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("id, customer_id, direction, channel, phone, body, template_name, status, error, matched, created_at")
        .eq("organization_id", currentOrg.id)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data || []) as unknown as WaMessage[];
    },
    enabled: !!currentOrg,
    refetchInterval: 30_000,
  });

  const { data: customers } = useQuery({
    queryKey: ["whatsapp_customers", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [];
      const { data } = await supabase
        .from("customers")
        .select("id, name, phone, whatsapp_opt_in")
        .eq("organization_id", currentOrg.id)
        .order("name")
        .limit(500);
      return (data || []) as any[];
    },
    enabled: !!currentOrg,
  });

  const threads: Thread[] = useMemo(() => {
    const map = new Map<string, Thread>();
    for (const m of messages || []) {
      const key = m.customer_id || m.phone;
      const cust = (customers || []).find((c) => c.id === m.customer_id);
      const existing = map.get(key);
      if (existing) {
        existing.messages.push(m);
        existing.last = m;
        existing.unmatched = existing.unmatched && !m.customer_id;
      } else {
        map.set(key, {
          key,
          phone: m.phone,
          customerId: m.customer_id,
          name: cust?.name || m.phone,
          messages: [m],
          last: m,
          unmatched: !m.customer_id,
        });
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.last.created_at).getTime() - new Date(a.last.created_at).getTime(),
    );
  }, [messages, customers]);

  const filteredThreads = threads.filter((t) => {
    const q = search.toLowerCase();
    return !q || t.name.toLowerCase().includes(q) || t.phone.includes(q);
  });

  const active = threads.find((t) => t.key === activeKey) || filteredThreads[0] || null;

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrg || !active) throw new Error("No conversation selected");
      const { data, error } = await supabase.functions.invoke("whatsapp-gateway", {
        body: {
          action: "send",
          organization_id: currentOrg.id,
          phone: active.phone,
          customer_id: active.customerId,
          body: draft.trim(),
        },
      });
      if (error) throw new Error((data as any)?.error || error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["whatsapp_messages", currentOrg?.id] });
    },
    onError: (e: any) => toast({ title: "Could not send", description: e.message, variant: "destructive" }),
  });

  const linkMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrg || !active || !linkTarget) throw new Error("Pick a customer");
      for (const m of active.messages.filter((x) => !x.customer_id)) {
        const { data, error } = await supabase.functions.invoke("whatsapp-gateway", {
          body: {
            action: "link_message",
            organization_id: currentOrg.id,
            message_id: m.id,
            customer_id: linkTarget,
          },
        });
        if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      }
    },
    onSuccess: () => {
      setLinkTarget("");
      toast({ title: "Conversation linked" });
      queryClient.invalidateQueries({ queryKey: ["whatsapp_messages", currentOrg?.id] });
    },
    onError: (e: any) => toast({ title: "Could not link", description: e.message, variant: "destructive" }),
  });

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-success" /> WhatsApp Inbox
            </h1>
            <p className="text-muted-foreground text-sm">
              {threads.length} conversation{threads.length === 1 ? "" : "s"} ·{" "}
              {threads.filter((t) => t.unmatched).length} unmatched
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Threads list */}
          <Card className="border-border/60 lg:col-span-1">
            <CardHeader className="pb-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8 h-9"
                  placeholder="Search name or number"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0 max-h-[60vh] overflow-y-auto">
              {isLoading ? (
                <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
              ) : filteredThreads.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10 px-4">
                  No WhatsApp messages yet. Connect the gateway in Settings, then message a customer.
                </p>
              ) : (
                filteredThreads.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setActiveKey(t.key)}
                    className={`w-full text-left px-4 py-3 border-b border-border/50 transition-colors ${
                      active?.key === t.key ? "bg-primary/5" : "hover:bg-accent"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{t.name}</span>
                      {t.unmatched && <Badge variant="outline" className="text-[10px]">Unmatched</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {t.last.direction === "outbound" ? "You: " : ""}
                      {t.last.body || t.last.template_name || "—"}
                    </p>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          {/* Conversation */}
          <Card className="border-border/60 lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                {active ? active.name : "Select a conversation"}
              </CardTitle>
              {active && <p className="text-xs text-muted-foreground">{active.phone}</p>}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
                {active?.messages.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                        m.direction === "outbound"
                          ? "bg-primary/10 text-foreground rounded-br-sm"
                          : "bg-muted text-foreground rounded-bl-sm"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">
                        {m.body || (m.template_name ? `Template: ${m.template_name}` : "—")}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{new Date(m.created_at).toLocaleString("en-KE")}</span>
                        {m.direction === "outbound" && <span className="uppercase">{m.status}</span>}
                      </div>
                      {m.error && <p className="text-[10px] text-destructive mt-0.5">{m.error}</p>}
                    </div>
                  </div>
                ))}
                {active && active.messages.length === 0 && (
                  <p className="text-sm text-muted-foreground">No messages.</p>
                )}
              </div>

              {active?.unmatched && (
                <div className="rounded-xl border border-border p-3 space-y-2">
                  <Label className="text-xs">Link this number to a customer</Label>
                  <div className="flex gap-2">
                    <Select value={linkTarget} onValueChange={setLinkTarget}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Choose customer" /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        {(customers || []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={() => linkMutation.mutate()} disabled={!linkTarget || linkMutation.isPending}>
                      {linkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}

              {active && (
                <div className="flex items-end gap-2">
                  <Textarea
                    rows={2}
                    placeholder="Type a reply…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={4000}
                  />
                  <Button
                    onClick={() => sendMutation.mutate()}
                    disabled={!draft.trim() || sendMutation.isPending}
                  >
                    {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
