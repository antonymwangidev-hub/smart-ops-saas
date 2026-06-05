import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { useOrgRole } from "@/hooks/useOrgRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Clock, LogIn, LogOut } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Branch { id: string; name: string; }
interface AttendanceRow {
  id: string; user_id: string; branch_id: string | null;
  clock_in: string; clock_out: string | null; notes: string | null;
  display_name?: string; branch_name?: string;
}

export default function Attendance() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { isOwner } = useOrgRole();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [openShift, setOpenShift] = useState<AttendanceRow | null>(null);
  const [branchId, setBranchId] = useState<string>("");
  const [notes, setNotes] = useState("");

  const load = async () => {
    if (!currentOrg || !user) return;
    const { data: bData } = await supabase.from("branches" as any).select("id, name").eq("organization_id", currentOrg.id).eq("is_active", true);
    setBranches((bData as any) || []);

    let query = supabase.from("staff_attendance" as any).select("*").eq("organization_id", currentOrg.id).order("clock_in", { ascending: false }).limit(50);
    const { data } = await query;
    const arr = (data as any[]) || [];

    const userIds = [...new Set(arr.map(r => r.user_id))];
    const { data: profiles } = userIds.length ? await supabase.from("profiles").select("user_id, display_name").in("user_id", userIds) : { data: [] };

    const enriched: AttendanceRow[] = arr.map(r => ({
      ...r,
      display_name: profiles?.find(p => p.user_id === r.user_id)?.display_name || "Unknown",
      branch_name: (bData as any)?.find((b: any) => b.id === r.branch_id)?.name || "—",
    }));
    setRows(enriched);
    setOpenShift(enriched.find(r => r.user_id === user.id && !r.clock_out) || null);
  };

  useEffect(() => { load(); }, [currentOrg, user]);

  const clockIn = async () => {
    if (!currentOrg || !user) return;
    const { error } = await supabase.from("staff_attendance" as any).insert({
      organization_id: currentOrg.id, user_id: user.id,
      branch_id: branchId || null, notes: notes || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Clocked in");
    setNotes("");
    load();
  };

  const clockOut = async () => {
    if (!openShift) return;
    const { error } = await supabase.from("staff_attendance" as any).update({
      clock_out: new Date().toISOString(),
      notes: notes ? `${openShift.notes || ""}\n${notes}`.trim() : openShift.notes,
    }).eq("id", openShift.id);
    if (error) return toast.error(error.message);
    toast.success("Clocked out");
    setNotes("");
    load();
  };

  const duration = (a: string, b: string | null) => {
    const end = b ? new Date(b) : new Date();
    const mins = Math.round((end.getTime() - new Date(a).getTime()) / 60000);
    const h = Math.floor(mins / 60); const m = mins % 60;
    return `${h}h ${m}m`;
  };

  const myRows = rows.filter(r => r.user_id === user?.id);
  const visibleRows = isOwner ? rows : myRows;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Clock className="h-6 w-6" /> Attendance</h1>
          <p className="text-sm text-muted-foreground">Clock in/out and track work hours</p>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">{openShift ? "Active shift" : "Clock in"}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {openShift ? (
              <>
                <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                  <div>
                    <p className="text-sm font-medium">Working at {openShift.branch_name}</p>
                    <p className="text-xs text-muted-foreground">Started {formatDistanceToNow(new Date(openShift.clock_in), { addSuffix: true })} · {duration(openShift.clock_in, null)}</p>
                  </div>
                  <Badge className="bg-emerald-500/20 text-emerald-300">Active</Badge>
                </div>
                <div><Label>Close-out notes (optional)</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything notable about this shift?" /></div>
                <Button onClick={clockOut} className="w-full" variant="destructive"><LogOut className="h-4 w-4 mr-2" /> Clock out</Button>
              </>
            ) : (
              <>
                <div><Label>Branch (optional)</Label>
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                    <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Notes (optional)</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
                <Button onClick={clockIn} className="w-full"><LogIn className="h-4 w-4 mr-2" /> Clock in now</Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">{isOwner ? "Team activity" : "My recent shifts"}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {visibleRows.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No records yet.</p>}
            {visibleRows.map(r => (
              <div key={r.id} className="flex items-center justify-between text-sm p-2 rounded border border-border/50">
                <div>
                  <p className="font-medium">{r.display_name} {r.branch_name && <span className="text-xs text-muted-foreground">· {r.branch_name}</span>}</p>
                  <p className="text-xs text-muted-foreground">{new Date(r.clock_in).toLocaleString()} {r.clock_out ? `→ ${new Date(r.clock_out).toLocaleTimeString()}` : "(active)"}</p>
                </div>
                <Badge variant={r.clock_out ? "outline" : "secondary"}>{duration(r.clock_in, r.clock_out)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
