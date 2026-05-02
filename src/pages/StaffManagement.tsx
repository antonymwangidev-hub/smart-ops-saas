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
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import { Users, UserPlus, Shield, ShieldCheck, Store, Loader2, Trash2, Edit } from "lucide-react";
import { toast } from "sonner";

interface StaffMember {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  display_name: string | null;
  email: string | null;
}

export default function StaffManagement() {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const { isOwner } = useOrgRole();
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<string>("staff");
  const [editRole, setEditRole] = useState<string>("staff");
  const [actionLoading, setActionLoading] = useState(false);

  if (!isOwner) {
    return <Navigate to="/pos" replace />;
  }

  useEffect(() => {
    if (currentOrg) fetchMembers();
  }, [currentOrg]);

  const fetchMembers = async () => {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const { data: membersData } = await supabase
        .from("organization_members")
        .select("id, user_id, role, created_at")
        .eq("organization_id", currentOrg.id);

      if (!membersData) {
        setMembers([]);
        setLoading(false);
        return;
      }

      const userIds = membersData.map(m => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", userIds);

      const enriched: StaffMember[] = membersData.map(m => {
        const profile = profiles?.find(p => p.user_id === m.user_id);
        return {
          ...m,
          display_name: profile?.display_name || null,
          email: profile?.display_name || m.user_id.slice(0, 8) + "…",
        };
      });

      setMembers(enriched);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStaff = async () => {
    if (!newEmail.trim() || !currentOrg) return;
    setActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await supabase.functions.invoke("admin-actions", {
        body: {
          action: "add_staff_to_org",
          email: newEmail.trim(),
          org_id: currentOrg.id,
          role: newRole,
        },
      });

      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);

      toast.success(`Staff member added as ${newRole}`);
      setNewEmail("");
      setNewRole("staff");
      setAddDialogOpen(false);
      fetchMembers();
    } catch (err: any) {
      toast.error(err.message || "Failed to add staff member");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!editingMember || !currentOrg) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("organization_members")
        .update({ role: editRole as "admin" | "staff" | "attendant" })
        .eq("id", editingMember.id)
        .eq("organization_id", currentOrg.id);

      if (error) throw error;
      toast.success(`Role updated to ${editRole}`);
      setEditDialogOpen(false);
      setEditingMember(null);
      fetchMembers();
    } catch (err: any) {
      toast.error(err.message || "Failed to update role");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveMember = async (member: StaffMember) => {
    if (member.user_id === user?.id) {
      toast.error("You cannot remove yourself");
      return;
    }
    if (!currentOrg) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("organization_members")
        .delete()
        .eq("id", member.id)
        .eq("organization_id", currentOrg.id);

      if (error) throw error;
      toast.success("Member removed");
      fetchMembers();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove member");
    } finally {
      setActionLoading(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return <Badge className="bg-primary/10 text-primary border-primary/20"><Shield className="h-3 w-3 mr-1" />Owner</Badge>;
      case "staff":
        return <Badge className="bg-secondary/10 text-secondary border-secondary/20"><ShieldCheck className="h-3 w-3 mr-1" />Staff</Badge>;
      case "attendant":
        return <Badge variant="outline"><Store className="h-3 w-3 mr-1" />Attendant</Badge>;
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  const getRoleDescription = (role: string) => {
    switch (role) {
      case "admin": return "Full access to everything including staff management";
      case "staff": return "Access to POS, products, orders, customers, and reports";
      case "attendant": return "POS sell screen and daily summary only";
      default: return "";
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
              <Users className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Staff Management</h1>
              <p className="text-sm text-muted-foreground">Manage your team and their access levels</p>
            </div>
          </div>

          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <UserPlus className="h-4 w-4" />
                Add Staff
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Staff Member</DialogTitle>
                <DialogDescription>
                  The person must already have a SmartOps account. Enter their email to add them to your business.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Email address</Label>
                  <Input
                    type="email"
                    placeholder="staff@example.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={newRole} onValueChange={setNewRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staff">Staff — Manage products, orders, reports</SelectItem>
                      <SelectItem value="attendant">Attendant — POS sell screen only</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{getRoleDescription(newRole)}</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleAddStaff} disabled={actionLoading || !newEmail.trim()}>
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Add Member
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Role legend */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { role: "admin", label: "Owner", desc: "Full access + staff management", icon: Shield, color: "from-primary/10 to-primary/5" },
            { role: "staff", label: "Staff", desc: "POS, products, orders, reports", icon: ShieldCheck, color: "from-secondary/10 to-secondary/5" },
            { role: "attendant", label: "Attendant", desc: "POS sell screen only", icon: Store, color: "from-muted/50 to-muted/20" },
          ].map((r) => (
            <Card key={r.role} className="glass">
              <CardContent className="p-4 flex items-start gap-3">
                <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${r.color} flex items-center justify-center shrink-0`}>
                  <r.icon className="h-4 w-4 text-foreground" />
                </div>
                <div>
                  <p className="font-medium text-sm text-foreground">{r.label}</p>
                  <p className="text-xs text-muted-foreground">{r.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Members table */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">Team Members</CardTitle>
            <CardDescription>{members.length} member{members.length !== 1 ? "s" : ""}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : members.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No members found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">
                        {member.display_name || member.email}
                        {member.user_id === user?.id && (
                          <Badge variant="outline" className="ml-2 text-[10px]">You</Badge>
                        )}
                      </TableCell>
                      <TableCell>{getRoleBadge(member.role)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(member.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {member.user_id !== user?.id && (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingMember(member);
                                setEditRole(member.role);
                                setEditDialogOpen(true);
                              }}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleRemoveMember(member)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Edit role dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change Role</DialogTitle>
              <DialogDescription>
                Update the role for {editingMember?.display_name || editingMember?.email}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Owner — Full access</SelectItem>
                  <SelectItem value="staff">Staff — Manage products, orders, reports</SelectItem>
                  <SelectItem value="attendant">Attendant — POS sell screen only</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{getRoleDescription(editRole)}</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleUpdateRole} disabled={actionLoading}>
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Update Role
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
