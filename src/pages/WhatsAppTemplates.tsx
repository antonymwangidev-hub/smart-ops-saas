import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { useOrgRole } from "@/hooks/useOrgRole";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, FileText, Search } from "lucide-react";
import {
  extractPlaceholders, renderTemplate, WhatsAppTemplate,
} from "@/lib/whatsappTemplates";

const CATEGORIES = ["utility", "marketing", "authentication"] as const;
const STATUSES = ["draft", "submitted", "approved", "rejected"] as const;

const EMPTY = {
  id: "",
  name: "",
  label: "",
  body: "",
  category: "utility",
  status: "draft",
  notes: "",
};

export default function WhatsAppTemplates() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { isOwner } = useOrgRole();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [preview, setPreview] = useState<Record<string, string>>({});

  const canManage = isOwner;

  const { data: templates, isLoading } = useQuery({
    queryKey: ["whatsapp_templates", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return [] as WhatsAppTemplate[];
      const { data, error } = await supabase
        .from("whatsapp_templates")
        .select("id, name, label, body, placeholders, category, status, notes, created_at")
        .eq("organization_id", currentOrg.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as unknown as WhatsAppTemplate[];
    },
    enabled: !!currentOrg,
  });

  const placeholders = useMemo(() => extractPlaceholders(form.body), [form.body]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrg || !user) throw new Error("Not ready");
      const name = form.name.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
      if (!name) throw new Error("Template name is required");
      if (!form.label.trim()) throw new Error("Display label is required");
      if (!form.body.trim()) throw new Error("Message body is required");

      const payload = {
        organization_id: currentOrg.id,
        name,
        label: form.label.trim().slice(0, 120),
        body: form.body.trim().slice(0, 4000),
        placeholders,
        category: form.category,
        status: form.status,
        notes: form.notes.trim().slice(0, 500) || null,
      };

      if (form.id) {
        const { error } = await supabase
          .from("whatsapp_templates")
          .update(payload)
          .eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("whatsapp_templates")
          .insert({ ...payload, created_by: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp_templates", currentOrg?.id] });
      toast({ title: form.id ? "Template updated" : "Template added" });
      setOpen(false);
      setForm({ ...EMPTY });
      setPreview({});
    },
    onError: (e: any) =>
      toast({ title: "Could not save template", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("whatsapp_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp_templates", currentOrg?.id] });
      toast({ title: "Template removed" });
    },
    onError: (e: any) =>
      toast({ title: "Could not delete", description: e.message, variant: "destructive" }),
  });

  const filtered = (templates || []).filter((t) => {
    const q = search.toLowerCase();
    return !q || t.label.toLowerCase().includes(q) || t.name.includes(q) || t.body.toLowerCase().includes(q);
  });

  const startNew = () => {
    setForm({ ...EMPTY });
    setPreview({});
    setOpen(true);
  };

  const startEdit = (t: WhatsAppTemplate) => {
    setForm({
      id: t.id,
      name: t.name,
      label: t.label,
      body: t.body,
      category: t.category,
      status: t.status,
      notes: t.notes || "",
    });
    setPreview({});
    setOpen(true);
  };

  return (
    <AppLayout>
      <h1 className="sr-only">WhatsApp template library</h1>
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> WhatsApp Templates
            </h2>
            <p className="text-sm text-muted-foreground">
              Reusable messages with placeholders like <code>{"{{name}}"}</code>. Staff pick them when sending.
            </p>
          </div>
          {canManage && (
            <Button onClick={startNew}>
              <Plus className="h-4 w-4 mr-2" /> New template
            </Button>
          )}
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search templates"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No templates yet.{canManage ? " Add your first one to speed up replies." : " Ask an admin to add some."}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((t) => (
              <Card key={t.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{t.label}</CardTitle>
                      <p className="text-xs text-muted-foreground font-mono truncate">{t.name}</p>
                    </div>
                    <Badge variant={t.status === "approved" ? "default" : "secondary"}>{t.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{t.body}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline">{t.category}</Badge>
                    {(t.placeholders || []).map((p) => (
                      <Badge key={p} variant="outline" className="font-mono text-xs">{`{{${p}}}`}</Badge>
                    ))}
                  </div>
                  {canManage && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => startEdit(t)}>
                        <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => deleteMutation.mutate(t.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit template" : "New template"}</DialogTitle>
            <DialogDescription>
              Use <code>{"{{placeholder}}"}</code> anywhere in the body. Placeholders are detected automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Display label</Label>
              <Input
                value={form.label}
                maxLength={120}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Order ready for pickup"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Gateway template name</Label>
              <Input
                value={form.name}
                maxLength={80}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="order_ready"
              />
              <p className="text-xs text-muted-foreground">
                Must match the approved template name registered with the WhatsApp gateway.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Message body</Label>
              <Textarea
                rows={4}
                maxLength={4000}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Habari {{name}}, your order {{order_no}} of KES {{amount}} is ready."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Internal notes <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Input
                value={form.notes}
                maxLength={500}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="When to use this message"
              />
            </div>

            {placeholders.length > 0 && (
              <div className="space-y-2 rounded-xl border border-border p-3">
                <p className="text-sm font-medium">Preview</p>
                {placeholders.map((p) => (
                  <Input
                    key={p}
                    value={preview[p] || ""}
                    onChange={(e) => setPreview({ ...preview, [p]: e.target.value })}
                    placeholder={p}
                  />
                ))}
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                  {renderTemplate(form.body, preview)}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
