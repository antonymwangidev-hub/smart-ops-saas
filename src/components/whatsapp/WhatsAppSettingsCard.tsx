import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useOrgRole } from "@/hooks/useOrgRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MessageSquare, RefreshCw, Unplug, AlertTriangle, CheckCircle2 } from "lucide-react";

interface ConnectionStatus {
  configured: boolean;
  base_url: string | null;
  business_name: string | null;
  whatsapp_connected: boolean | null;
  receiving_active: boolean | null;
  webhook_url: string | null;
  templates: any;
  last_error: string | null;
  updated_at: string | null;
}

function templateNames(templates: any): string[] {
  if (!templates) return [];
  const arr = Array.isArray(templates) ? templates : templates?.templates ?? [];
  return (Array.isArray(arr) ? arr : [])
    .map((t: any) => (typeof t === "string" ? t : t?.name || t?.templateName))
    .filter(Boolean);
}

export function WhatsAppSettingsCard() {
  const { currentOrg } = useOrg();
  const { isOwner } = useOrgRole();
  const { toast } = useToast();
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<null | "connect" | "refresh" | "disconnect">(null);

  const { data: status, refetch } = useQuery({
    queryKey: ["whatsapp_status", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return null;
      const { data } = await supabase.rpc("whatsapp_connection_status", { _org_id: currentOrg.id });
      const row = Array.isArray(data) ? data[0] : data;
      return (row || null) as ConnectionStatus | null;
    },
    enabled: !!currentOrg && isOwner,
  });

  useEffect(() => {
    if (status?.base_url) setBaseUrl(status.base_url);
  }, [status?.base_url]);

  if (!isOwner) return null;

  const call = async (action: "connect" | "refresh" | "disconnect") => {
    if (!currentOrg) return;
    setBusy(action);
    const { data, error } = await supabase.functions.invoke("whatsapp-gateway", {
      body: action === "connect"
        ? { action, organization_id: currentOrg.id, base_url: baseUrl.trim(), api_key: apiKey.trim() }
        : { action, organization_id: currentOrg.id },
    });
    const errMsg = (data as any)?.error || error?.message;
    if (errMsg) {
      toast({ title: "WhatsApp", description: errMsg, variant: "destructive" });
    } else {
      if (action === "connect") setApiKey("");
      if (action === "disconnect") setBaseUrl("");
      const warning = (data as any)?.data?.webhook_warning;
      toast({
        title: action === "disconnect" ? "Disconnected" : action === "refresh" ? "Refreshed" : "Connected",
        description: warning || undefined,
      });
      await refetch();
    }
    setBusy(null);
  };

  const templates = templateNames(status?.templates);
  const connected = !!status?.configured;

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-success" />
          WhatsApp (Nexus Gateway)
        </CardTitle>
        <CardDescription>
          Connect your Nexus WhatsApp Gateway account to message customers and receive replies in the inbox.
          Your API key is stored on the server and never shown again.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {connected && (
          <div className="space-y-2 rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-lg">
                {status?.business_name || "Connected"}
              </Badge>
              {status?.whatsapp_connected ? (
                <Badge className="rounded-lg bg-success/15 text-success hover:bg-success/15">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> WhatsApp linked
                </Badge>
              ) : (
                <Badge variant="destructive" className="rounded-lg">
                  <AlertTriangle className="h-3 w-3 mr-1" /> WhatsApp not linked — scan the QR in your gateway
                </Badge>
              )}
              <Badge variant={status?.receiving_active ? "secondary" : "outline"} className="rounded-lg">
                {status?.receiving_active ? "Receiving live" : "Receiving inactive"}
              </Badge>
            </div>
            {status?.last_error && (
              <p className="text-xs text-destructive">{status.last_error}</p>
            )}
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Approved templates ({templates.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {templates.length === 0
                  ? <span className="text-xs text-muted-foreground">None yet</span>
                  : templates.map((t) => (
                      <Badge key={t} variant="outline" className="rounded-lg font-mono text-[10px]">{t}</Badge>
                    ))}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label>Gateway Base URL</Label>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://your-gateway.example.com"
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label>API Key</Label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={connected ? "Enter a new key to replace the stored one" : "nx_live_..."}
            autoComplete="off"
            className="rounded-xl"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => call("connect")}
            disabled={busy !== null || !baseUrl.trim() || !apiKey.trim()}
            className="rounded-xl"
          >
            {busy === "connect" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save &amp; Connect
          </Button>
          {connected && (
            <>
              <Button variant="outline" onClick={() => call("refresh")} disabled={busy !== null} className="rounded-xl">
                {busy === "refresh" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Refresh status
              </Button>
              <Button variant="ghost" onClick={() => call("disconnect")} disabled={busy !== null} className="rounded-xl text-destructive">
                {busy === "disconnect" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Unplug className="h-4 w-4 mr-2" />}
                Disconnect
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
