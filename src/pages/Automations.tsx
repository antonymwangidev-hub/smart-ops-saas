import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, Zap, Sparkles, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const triggers = [
  { value: "customer_created", label: "Customer Created" },
  { value: "order_created", label: "Order Created" },
  { value: "order_completed", label: "Order Completed" },
  { value: "order_cancelled", label: "Order Cancelled" },
  { value: "task_created", label: "Task Created" },
  { value: "task_completed", label: "Task Completed" },
  { value: "document_uploaded", label: "Document Uploaded" },
  { value: "payment_received", label: "Payment Received" },
  { value: "payment_failed", label: "Payment Failed" },
];

const actions = [
  { value: "create_task", label: "Create Task" },
  { value: "send_notification", label: "Send Notification" },
  { value: "log_event", label: "Log Event" },
  { value: "update_order_status", label: "Update Order Status" },
  { value: "assign_task", label: "Assign Task to Team" },
  { value: "generate_report", label: "Generate AI Report" },
  { value: "tag_customer", label: "Tag Customer" },
];

interface AISuggestion {
  name: string;
  trigger: string;
  actionType: string;
  actionValue: string;
  reason: string;
}

export default function Automations() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", trigger: "", actionType: "", actionValue: "" });
  const [submitting, setSubmitting] = useState(false);

  // AI suggestions state
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [addingSuggestion, setAddingSuggestion] = useState<number | null>(null);

  const fetchRules = async () => {
    if (!currentOrg) return;
    const { data } = await supabase.from("automation_rules").select("*").eq("organization_id", currentOrg.id).order("created_at", { ascending: false });
    setRules(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchRules(); }, [currentOrg]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    setSubmitting(true);
    const { error } = await supabase.from("automation_rules").insert({
      organization_id: currentOrg.id,
      name: form.name,
      trigger: form.trigger,
      action: { type: form.actionType, value: form.actionValue },
    });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { setDialogOpen(false); setForm({ name: "", trigger: "", actionType: "", actionValue: "" }); fetchRules(); }
    setSubmitting(false);
  };

  const toggleRule = async (id: string, isActive: boolean) => {
    await supabase.from("automation_rules").update({ is_active: !isActive }).eq("id", id);
    fetchRules();
  };

  const fetchAISuggestions = async () => {
    if (!currentOrg) return;
    setAiLoading(true);
    setShowSuggestions(true);
    setSuggestions([]);
    try {
      const { data, error } = await supabase.functions.invoke("ai-automation-suggestions", {
        body: { orgId: currentOrg.id },
      });
      if (error) throw error;
      setSuggestions(data?.suggestions || []);
    } catch (err: any) {
      console.error("AI suggestion error:", err);
      toast({ title: "AI Error", description: err.message || "Could not get suggestions", variant: "destructive" });
      setShowSuggestions(false);
    } finally {
      setAiLoading(false);
    }
  };

  const addSuggestion = async (suggestion: AISuggestion, index: number) => {
    if (!currentOrg) return;
    setAddingSuggestion(index);
    const { error } = await supabase.from("automation_rules").insert({
      organization_id: currentOrg.id,
      name: suggestion.name,
      trigger: suggestion.trigger,
      action: { type: suggestion.actionType, value: suggestion.actionValue },
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Rule added", description: `"${suggestion.name}" has been created.` });
      setSuggestions(prev => prev.filter((_, i) => i !== index));
      fetchRules();
    }
    setAddingSuggestion(null);
  };

  const dismissSuggestion = (index: number) => {
    setSuggestions(prev => prev.filter((_, i) => i !== index));
    if (suggestions.length <= 1) setShowSuggestions(false);
  };

  const triggerLabel = (val: string) => triggers.find(t => t.value === val)?.label || val.replace(/_/g, " ");
  const actionLabel = (val: string) => actions.find(a => a.value === val)?.label || val.replace(/_/g, " ");

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Automations</h1>
            <p className="text-muted-foreground">Create rules to automate your workflows</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchAISuggestions} disabled={aiLoading}>
              {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              AI Suggest
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />New Rule</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Automation Rule</DialogTitle></DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Rule Name</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>When this happens (Trigger)</Label>
                    <Select value={form.trigger} onValueChange={(v) => setForm({ ...form, trigger: v })}>
                      <SelectTrigger><SelectValue placeholder="Select trigger" /></SelectTrigger>
                      <SelectContent>
                        {triggers.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Do this (Action)</Label>
                    <Select value={form.actionType} onValueChange={(v) => setForm({ ...form, actionType: v })}>
                      <SelectTrigger><SelectValue placeholder="Select action" /></SelectTrigger>
                      <SelectContent>
                        {actions.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {form.actionType === "create_task" && (
                    <div className="space-y-2">
                      <Label>Task Title</Label>
                      <Input value={form.actionValue} onChange={(e) => setForm({ ...form, actionValue: e.target.value })} placeholder="Follow up with customer" />
                    </div>
                  )}
                  {form.actionType === "send_notification" && (
                    <div className="space-y-2">
                      <Label>Notification Message</Label>
                      <Input value={form.actionValue} onChange={(e) => setForm({ ...form, actionValue: e.target.value })} placeholder="New customer added!" />
                    </div>
                  )}
                  {form.actionType === "assign_task" && (
                    <div className="space-y-2">
                      <Label>Task Title to Assign</Label>
                      <Input value={form.actionValue} onChange={(e) => setForm({ ...form, actionValue: e.target.value })} placeholder="Review and process order" />
                    </div>
                  )}
                  {form.actionType === "update_order_status" && (
                    <div className="space-y-2">
                      <Label>New Status</Label>
                      <Select value={form.actionValue} onValueChange={(v) => setForm({ ...form, actionValue: v })}>
                        <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {form.actionType === "tag_customer" && (
                    <div className="space-y-2">
                      <Label>Tag / Note</Label>
                      <Input value={form.actionValue} onChange={(e) => setForm({ ...form, actionValue: e.target.value })} placeholder="VIP, High-value, etc." />
                    </div>
                  )}
                  {form.actionType === "generate_report" && (
                    <div className="space-y-2">
                      <Label>Report Focus</Label>
                      <Input value={form.actionValue} onChange={(e) => setForm({ ...form, actionValue: e.target.value })} placeholder="Weekly sales summary" />
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Rule
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* AI Suggestions Panel */}
        {showSuggestions && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">AI-Suggested Automations</CardTitle>
              </div>
              <CardDescription>Based on your business data, here are recommended automation rules</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {aiLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
                  <span className="text-muted-foreground">Analyzing your business data…</span>
                </div>
              ) : suggestions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No new suggestions — your automations look solid!</p>
              ) : (
                suggestions.map((s, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg border bg-background p-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground">{s.name}</div>
                      <div className="text-sm text-muted-foreground mt-0.5">
                        <Badge variant="outline" className="mr-1">{triggerLabel(s.trigger)}</Badge>
                        → <Badge variant="outline" className="ml-1">{actionLabel(s.actionType)}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{s.reason}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => dismissSuggestion(i)} className="h-8 w-8 p-0">
                        <X className="h-4 w-4" />
                      </Button>
                      <Button size="sm" onClick={() => addSuggestion(s, i)} disabled={addingSuggestion === i} className="h-8">
                        {addingSuggestion === i ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" />Add</>}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : rules.length === 0 ? (
          <Card className="p-12 text-center">
            <Zap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground">No automation rules yet</h3>
            <p className="text-muted-foreground mt-1">Create your first rule or let AI suggest some</p>
            <Button variant="outline" className="mt-4" onClick={fetchAISuggestions} disabled={aiLoading}>
              <Sparkles className="h-4 w-4 mr-2" />Get AI Suggestions
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4">
            {rules.map((rule) => (
              <Card key={rule.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
                      <Zap className="h-5 w-5 text-accent-foreground" />
                    </div>
                    <div>
                      <div className="font-medium text-foreground">{rule.name}</div>
                      <div className="text-sm text-muted-foreground">
                        When <Badge variant="outline" className="mx-1">{rule.trigger.replace(/_/g, " ")}</Badge>
                        → <Badge variant="outline" className="mx-1">{(rule.action as any)?.type?.replace(/_/g, " ") || "action"}</Badge>
                      </div>
                    </div>
                  </div>
                  <Switch checked={rule.is_active} onCheckedChange={() => toggleRule(rule.id, rule.is_active)} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
