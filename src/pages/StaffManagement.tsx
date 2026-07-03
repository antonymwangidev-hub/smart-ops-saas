import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { useOrgRole } from "@/hooks/useOrgRole";
import { Navigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Users, UserPlus, Loader2, Trash2, Edit, Copy, Mail, Power, RefreshCw, CheckCircle2, Clock, Ban,
} from "lucide-react";
import { toast } from "sonner";

interface StaffMember {
  id: string;
  user_id: string;
  role: string;
  status: string | null;
  branch_id: string | null;
  created_at: string;
  display_name: string | null;
  email: string | null;
}

interface Invitation {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  branch_id: string | null;
  status: string;
  
  expires_at: string;
  invitation_sent_at: string;
}

interface Branch { id: string; name: string }

const ROLE_OPTIONS = [
  { value: "manager", label: "Manager — Full operational access" },
  { value: "accountant", label: "Accountant — Finance, expenses, debtors" },
  { value: "storekeeper", label: "Storekeeper — Products, stock, purchasing" },
  { value: "staff", label: "Staff — Manage products, orders, reports" },
  { value: "cashier", label: "Cashier — POS, returns, credit" },
  { value: "attendant", label: "Attendant — POS sell screen only" },
];

export default function StaffManagement() {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const { isOwner, isManager } = useOrgRole();
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteRole, setInviteRole] = useState("staff");
  const [inviteBranch, setInviteBranch] = useState<string>("");
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);
  const [editRole, setEditRole] = useState("staff");
  const [editBranch, setEditBranch] = useState<string>("");

  if (!isManager && !isOwner) {
    return <Navigate to="/pos" replace />;
  }

  useEffect(() => {
    if (currentOrg) refresh();
  }, [currentOrg]);

  const refresh = async () => {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const [{ data: membersData }, { data: invitesData }, { data: branchesData }] = await Promise.all([
        supabase.from("organization_members")
          .select("id, user_id, role, status, branch_id, created_at")
          .eq("organization_id", currentOrg.id),
        supabase.from("staff_invitations")
          .select("*")
          .eq("organization_id", currentOrg.id)
          .order("created_at", { ascending: false }),
        supabase.from("branches").select("id, name").eq("organization_id", currentOrg.id),
      ]);

      const userIds = (membersData || []).map((m: any) => m.user_id);
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("user_id, display_name").in("user_id", userIds)
        : { data: [] as any };

      setMembers((membersData || []).map((m: any) => {
        const p = profiles?.find((pp: any) => pp.user_id === m.user_id);
        return {
          ...m,
          status: m.status || "active",
          display_name: p?.display_name || null,
          email: p?.display_name || m.user_id.slice(0, 8) + "…",
        };
      }));
      setInvitations((invitesData || []) as Invitation[]);
      setBranches((branchesData || []) as Branch[]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !currentOrg) return;
    setActionLoading(true);
    setLastInviteLink(null);
    try {
      const res = await supabase.functions.invoke("admin-actions", {
        body: {
          action: "invite_staff",
          org_id: currentOrg.id,
          email: inviteEmail.trim(),
          full_name: inviteName.trim() || null,
          phone: invitePhone.trim() || null,
          role: inviteRole,
          branch_id: inviteBranch || null,
          app_origin: window.location.origin,
        },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      setLastInviteLink(res.data.invite_link);
      toast.success("Invitation created. Share the link with your staff.");
      setInviteName(""); setInviteEmail(""); setInvitePhone(""); setInviteRole("staff"); setInviteBranch("");
      refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to create invitation");
    } finally {
      setActionLoading(false);
    }
  };

  const handleResend = async (inv: Invitation) => {
    setActionLoading(true);
    try {
      const res = await supabase.functions.invoke("admin-actions", {
        body: { action: "resend_invitation", invitation_id: inv.id, app_origin: window.location.origin },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      await navigator.clipboard.writeText(res.data.invite_link).catch(() => {});
      toast.success("New link generated and copied to clipboard");
      refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to resend");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeInvite = async (inv: Invitation) => {
    setActionLoading(true);
    try {
      const res = await supabase.functions.invoke("admin-actions", {
        body: { action: "revoke_invitation", invitation_id: inv.id },
      });
      if (res.error) throw res.error;
      toast.success("Invitation revoked");
      refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke");
    } finally {
      setActionLoading(false);
    }
  };

  const handleStatus = async (m: StaffMember, status: "active" | "suspended") => {
    if (!currentOrg) return;
    if (m.user_id === user?.id) { toast.error("You cannot change your own status"); return; }
    setActionLoading(true);
    try {
      const res = await supabase.functions.invoke("admin-actions", {
        body: { action: "update_member_status", org_id: currentOrg.id, member_id: m.id, status },
      });
      if (res.error) throw res.error;
      toast.success(`Member ${status === "suspended" ? "suspended" : "reactivated"}`);
      refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed");
    } finally {
      setActionLoading(false);
    }
  };

  const openEdit = (m: StaffMember) => {
    setEditingMember(m);
    setEditRole(m.role);
    setEditBranch(m.branch_id || "");
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingMember || !currentOrg) return;
    setActionLoading(true);
    try {
      if (editRole !== editingMember.role) {
        const { error } = await supabase
          .from("organization_members")
          .update({ role: editRole as any })
          .eq("id", editingMember.id)
          .eq("organization_id", currentOrg.id);
        if (error) throw error;
      }
      if ((editBranch || null) !== (editingMember.branch_id || null)) {
        const res = await supabase.functions.invoke("admin-actions", {
          body: { action: "update_member_branch", org_id: currentOrg.id, member_id: editingMember.id, branch_id: editBranch || null },
        });
        if (res.error) throw res.error;
      }
      toast.success("Member updated");
      setEditOpen(false);
      setEditingMember(null);
      refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to update");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemove = async (m: StaffMember) => {
    if (m.user_id === user?.id) { toast.error("You cannot remove yourself"); return; }
    if (!currentOrg) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.from("organization_members")
        .delete().eq("id", m.id).eq("organization_id", currentOrg.id);
      if (error) throw error;
      toast.success("Member removed");
      refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed");
    } finally {
      setActionLoading(false);
    }
  };

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link).then(
      () => toast.success("Link copied"),
      () => toast.error("Copy failed"),
    );
  };

  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name || "—";

  const statusBadge = (s: string) => {
    if (s === "suspended") return <Badge variant="destructive" className="gap-1"><Ban className="h-3 w-3" />Suspended</Badge>;
    return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1"><CheckCircle2 className="h-3 w-3" />Active</Badge>;
  };

  const inviteStatusBadge = (s: string) => {
    if (s === "pending") return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
    if (s === "accepted") return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1"><CheckCircle2 className="h-3 w-3" />Accepted</Badge>;
    if (s === "revoked") return <Badge variant="destructive" className="gap-1"><Ban className="h-3 w-3" />Revoked</Badge>;
    return <Badge variant="outline">{s}</Badge>;
  };

  const activeCount = members.filter((m) => (m.status || "active") === "active").length;
  const suspendedCount = members.filter((m) => m.status === "suspended").length;
  const pendingCount = invitations.filter((i) => i.status === "pending").length;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
              <Users className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Staff Management</h1>
              <p className="text-sm text-muted-foreground">Invite staff, manage roles, branches and permissions</p>
            </div>
          </div>

          <Dialog open={inviteOpen} onOpenChange={(o) => { setInviteOpen(o); if (!o) setLastInviteLink(null); }}>
            <DialogTrigger asChild>
              <Button className="gap-2"><UserPlus className="h-4 w-4" />Invite Staff</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite a staff member</DialogTitle>
                <DialogDescription>
                  We'll create a secure invitation link. Your staff member opens it, sets a password, and joins your business with the role you choose.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2"><Label>Full name</Label>
                  <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Jane Doe" /></div>
                <div className="space-y-2"><Label>Email *</Label>
                  <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="jane@example.com" /></div>
                <div className="space-y-2"><Label>Phone</Label>
                  <Input value={invitePhone} onChange={(e) => setInvitePhone(e.target.value)} placeholder="0712 345 678" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Role *</Label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Branch</Label>
                    <Select value={inviteBranch || "none"} onValueChange={(v) => setInviteBranch(v === "none" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="No branch" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No specific branch</SelectItem>
                        {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {lastInviteLink && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <p className="text-xs text-muted-foreground">Share this link with your staff member:</p>
                    <div className="flex items-center gap-2">
                      <Input readOnly value={lastInviteLink} className="text-xs" />
                      <Button size="sm" variant="outline" onClick={() => copyLink(lastInviteLink)}><Copy className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteOpen(false)}>Close</Button>
                <Button onClick={handleInvite} disabled={actionLoading || !inviteEmail.trim()}>
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                  Create Invitation
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="glass"><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Active Staff</p>
            <p className="text-2xl font-bold text-emerald-500">{activeCount}</p>
          </CardContent></Card>
          <Card className="glass"><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pending Invitations</p>
            <p className="text-2xl font-bold text-amber-500">{pendingCount}</p>
          </CardContent></Card>
          <Card className="glass"><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Suspended</p>
            <p className="text-2xl font-bold text-destructive">{suspendedCount}</p>
          </CardContent></Card>
        </div>

        <Tabs defaultValue="members">
          <TabsList>
            <TabsTrigger value="members">Team Members</TabsTrigger>
            <TabsTrigger value="invitations">Invitations {pendingCount > 0 && <Badge className="ml-2 h-5">{pendingCount}</Badge>}</TabsTrigger>
          </TabsList>

          <TabsContent value="members">
            <Card className="glass">
              <CardHeader>
                <CardTitle className="text-base">Members</CardTitle>
                <CardDescription>{members.length} member{members.length !== 1 ? "s" : ""}</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : members.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No members yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Branch</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {members.map((m) => (
                          <TableRow key={m.id}>
                            <TableCell className="font-medium">
                              {m.display_name || m.email}
                              {m.user_id === user?.id && <Badge variant="outline" className="ml-2 text-[10px]">You</Badge>}
                            </TableCell>
                            <TableCell className="capitalize">{m.role}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{branchName(m.branch_id)}</TableCell>
                            <TableCell>{statusBadge(m.status || "active")}</TableCell>
                            <TableCell className="text-right">
                              {m.user_id !== user?.id && (
                                <div className="flex items-center justify-end gap-1">
                                  <Button size="sm" variant="ghost" onClick={() => openEdit(m)} title="Edit role / branch">
                                    <Edit className="h-3.5 w-3.5" />
                                  </Button>
                                  {(m.status || "active") === "active" ? (
                                    <Button size="sm" variant="ghost" className="text-amber-500" onClick={() => handleStatus(m, "suspended")} title="Suspend">
                                      <Power className="h-3.5 w-3.5" />
                                    </Button>
                                  ) : (
                                    <Button size="sm" variant="ghost" className="text-emerald-500" onClick={() => handleStatus(m, "active")} title="Reactivate">
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {isOwner && (
                                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleRemove(m)} title="Remove">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invitations">
            <Card className="glass">
              <CardHeader>
                <CardTitle className="text-base">Invitations</CardTitle>
                <CardDescription>Pending and historical invites</CardDescription>
              </CardHeader>
              <CardContent>
                {invitations.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No invitations yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Email</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Expires</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invitations.map((inv) => {
                          const link = `${window.location.origin}/invite/${inv.token}`;
                          return (
                            <TableRow key={inv.id}>
                              <TableCell className="font-medium">{inv.email}</TableCell>
                              <TableCell className="text-muted-foreground text-sm">{inv.full_name || "—"}</TableCell>
                              <TableCell className="capitalize">{inv.role}</TableCell>
                              <TableCell>{inviteStatusBadge(inv.status)}</TableCell>
                              <TableCell className="text-muted-foreground text-sm">{new Date(inv.expires_at).toLocaleDateString()}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {inv.status === "pending" && (
                                    <Button size="sm" variant="ghost" onClick={() => copyLink(link)} title="Copy link">
                                      <Copy className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {inv.status !== "accepted" && (
                                    <Button size="sm" variant="ghost" onClick={() => handleResend(inv)} title="Resend / regenerate">
                                      <RefreshCw className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {inv.status === "pending" && (
                                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleRevokeInvite(inv)} title="Revoke">
                                      <Ban className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Edit dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Member</DialogTitle>
              <DialogDescription>Update role and branch for {editingMember?.display_name || editingMember?.email}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2"><Label>Role</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {isOwner && <SelectItem value="admin">Owner — Full access</SelectItem>}
                    {ROLE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Branch</Label>
                <Select value={editBranch || "none"} onValueChange={(v) => setEditBranch(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="No branch" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No specific branch</SelectItem>
                    {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveEdit} disabled={actionLoading}>
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
