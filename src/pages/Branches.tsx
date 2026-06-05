import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Building2, Plus, Trash2, Pencil } from "lucide-react";

interface Branch {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  is_default: boolean;
  is_active: boolean;
}

export default function Branches() {
  const { currentOrg } = useOrg();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState({ name: "", code: "", address: "", phone: "", is_default: false, is_active: true });

  const load = async () => {
    if (!currentOrg) return;
    const { data } = await supabase.from("branches" as any).select("*").eq("organization_id", currentOrg.id).order("created_at");
    setBranches((data as any) || []);
  };

  useEffect(() => { load(); }, [currentOrg]);

  const reset = () => { setForm({ name: "", code: "", address: "", phone: "", is_default: false, is_active: true }); setEditing(null); };

  const save = async () => {
    if (!currentOrg || !form.name.trim()) return;
    const payload = { ...form, organization_id: currentOrg.id };
    if (editing) {
      const { error } = await supabase.from("branches" as any).update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Branch updated");
    } else {
      const { error } = await supabase.from("branches" as any).insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Branch created");
    }
    setOpen(false); reset(); load();
  };

  const edit = (b: Branch) => {
    setEditing(b);
    setForm({ name: b.name, code: b.code || "", address: b.address || "", phone: b.phone || "", is_default: b.is_default, is_active: b.is_active });
    setOpen(true);
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this branch?")) return;
    const { error } = await supabase.from("branches" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); load();
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="h-6 w-6" /> Branches</h1>
            <p className="text-sm text-muted-foreground">Manage all your business locations</p>
          </div>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New branch</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit branch" : "New branch"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Westlands Store" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="WST-01" /></div>
                  <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                </div>
                <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                <div className="flex items-center justify-between"><Label>Default branch</Label><Switch checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} /></div>
                <div className="flex items-center justify-between"><Label>Active</Label><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /></div>
                <Button onClick={save} className="w-full">{editing ? "Update" : "Create"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {branches.map((b) => (
            <Card key={b.id}>
              <CardHeader className="pb-2 flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-base">{b.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">{b.code || "—"}</p>
                </div>
                <div className="flex gap-1">
                  {b.is_default && <Badge variant="secondary">Default</Badge>}
                  {!b.is_active && <Badge variant="outline">Inactive</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {b.address && <p className="text-sm text-muted-foreground">{b.address}</p>}
                {b.phone && <p className="text-sm">{b.phone}</p>}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => edit(b)}><Pencil className="h-3 w-3 mr-1" /> Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(b.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {branches.length === 0 && <p className="text-sm text-muted-foreground col-span-full text-center py-8">No branches yet. Create your first location.</p>}
        </div>
      </div>
    </AppLayout>
  );
}
