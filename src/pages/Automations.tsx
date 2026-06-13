import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Loader2, Zap, Play, Trash2, BellRing, CheckSquare, FileText, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Supported triggers (map to engine trigger_type values) ─────────────
const TRIGGERS = [
  { value: "stock_low",      label: "⚠️ Stock goes low",           description: "Fires when a product falls below its minimum threshold" },
  { value: "credit_overdue", label: "💳 Credit sale overdue",      description: "Fires when a customer hasn't paid their deni balance" },
  { value: "daily_summary",  label: "📊 Daily summary (9am)",      description: "Fires once per day with today's sales summary" },
];

// ── Supported actions ──────────────────────────────────────────────────
const ACTIONS = [
  { value: "send_notification", label: "🔔 Send in-app notification", icon: BellRing },
  { value: "create_task",       label: "✅ Create a task",            icon: CheckSquare },
  { value: "log_event",         label: "📝 Log to activity log",      icon: FileText },
];

export default function Automations() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();

  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", trigger: "", actionType: "send_notification", thresholdDays: "30" });
  const [submitting, setSubmitting] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const fetchRules = async () => {
    if (!currentOrg) return;
    const { data } = await (supabase as any)
      .from("automation_rules")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .order("created_at", { ascending: false });
    setRules(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchRules(); }, [currentOrg]);

  const handleCreate = async () => {
    if (!currentOrg || !form.name || !form.trigger) return;
    setSubmitting(true);
    const actionPayload: Record<string, any> = { type: form.actionType };
    if (form.trigger === "credit_overdue") actionPayload.threshold_days = parseInt(form.thresholdDays) || 30;

    const { error } = await (supabase as any).from("automation_rules").insert({
      organization_id: currentOrg.id,
      name: form.name,
      trigger: form.trigger,
      action: actionPayload,
      is_active: true,
    });
    setSubmitting(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Smart Alert created", description: "It will run automatically when triggered." });
    setOpen(false);
    setForm({ name: "", trigger: "", actionType: "send_notification", thresholdDays: "30" });
    fetchRules();
  };

  const toggleActive = async (rule: any) => {
    await (supabase as any).from("automation_rules").update({ is_active: !rule.is_active }).eq("id", rule.id);
    fetchRules();
  };

  const deleteRule = async (id: string) => {
    await (supabase as any).from("automation_rules").delete().eq("id", id);
    fetchRules();
    toast({ title: "Alert deleted" });
  };

  // Manually fire the edge function for this specific rule's trigger
  const testRule = async (rule: any) => {
    setTestingId(rule.id);
    try {
      const { error } = await supabase.functions.invoke("smart-alerts-engine", {
        body: { organization_id: currentOrg?.id, trigger_type: rule.trigger },
      });
      if (error) throw error;
      toast({ title: "Test fired", description: "Check your notifications and tasks for results." });
    } catch (err: any) {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    }
    setTestingId(null);
  };

  const getTriggerInfo = (v: string) => TRIGGERS.find((t) => t.value === v);
  const getActionInfo = (v: string) => ACTIONS.find((a) => a.value === v);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Zap className="h-6 w-6 text-primary" /> Smart Alerts</h1>
            <p className="text-sm text-muted-foreground">Automated rules that run when your business conditions change</p>
          </div>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" /> New Alert Rule</Button>
        </div>

        {/* How it works */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 flex items-start gap-3">
            <Zap className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-foreground">How Smart Alerts work</p>
              <p className="text-muted-foreground mt-0.5">
                Each rule monitors a specific condition (e.g. low stock, overdue deni) and fires an action automatically —
                in-app notification, task, or log. Rules run on a server schedule — no manual checking needed.
                Use the <strong>Test</strong> button to fire a rule immediately.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Deployment note */}
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              <strong>For full automation:</strong> Deploy the <code className="bg-muted px-1 rounded">smart-alerts-engine</code> Edge Function
              (<code className="bg-muted px-1 rounded">supabase functions deploy smart-alerts-engine</code>) and set up a
              pg_cron job: <code className="bg-muted px-1 rounded">select cron.schedule('smart-alerts', '0 * * * *', $$select net.http_post(...)$$);</code>
            </p>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : rules.length === 0 ? (
          <Card className="p-12 text-center">
            <Zap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium">No alerts set up yet</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Create your first Smart Alert — try "Stock goes low → Send notification" to get started
            </p>
            <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Create First Alert</Button>
          </Card>
        ) : (
          <div className="grid gap-3">
            {rules.map((rule) => {
              const trigger = getTriggerInfo(rule.trigger);
              const action = getActionInfo(rule.action?.type);
              return (
                <Card key={rule.id} className={!rule.is_active ? "opacity-60" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-foreground">{rule.name}</span>
                          <Badge variant={rule.is_active ? "default" : "secondary"}>
                            {rule.is_active ? "Active" : "Paused"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground flex-wrap">
                          <span className="bg-muted rounded px-2 py-0.5 text-xs">
                            WHEN: {trigger?.label || rule.trigger}
                          </span>
                          {rule.trigger === "credit_overdue" && rule.action?.threshold_days && (
                            <span className="bg-muted rounded px-2 py-0.5 text-xs">after {rule.action.threshold_days} days</span>
                          )}
                          <span className="text-muted-foreground">→</span>
                          <span className="bg-muted rounded px-2 py-0.5 text-xs">
                            THEN: {action?.label || rule.action?.type}
                          </span>
                        </div>
                        {trigger?.description && (
                          <p className="text-xs text-muted-foreground mt-1">{trigger.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1"
                          onClick={() => testRule(rule)}
                          disabled={testingId === rule.id}
                        >
                          {testingId === rule.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                          Test
                        </Button>
                        <Switch checked={rule.is_active} onCheckedChange={() => toggleActive(rule)} />
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteRule(rule.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Create dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary" /> New Smart Alert</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Alert Name</Label>
                <Input
                  placeholder="e.g. Notify when cement runs low"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Trigger — When should this fire?</Label>
                <Select value={form.trigger} onValueChange={(v) => setForm({ ...form, trigger: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select a trigger…" /></SelectTrigger>
                  <SelectContent>
                    {TRIGGERS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        <div>
                          <div className="font-medium">{t.label}</div>
                          <div className="text-xs text-muted-foreground">{t.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {form.trigger === "credit_overdue" && (
                <div>
                  <Label>Overdue after (days)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.thresholdDays}
                    onChange={(e) => setForm({ ...form, thresholdDays: e.target.value })}
                    className="mt-1 w-28"
                  />
                </div>
              )}

              <div>
                <Label>Action — What should happen?</Label>
                <Select value={form.actionType} onValueChange={(v) => setForm({ ...form, actionType: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTIONS.map((a) => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                className="w-full"
                onClick={handleCreate}
                disabled={submitting || !form.name || !form.trigger}
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Alert Rule
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
