import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppLayout } from "@/components/AppLayout";
import {
  Shield, Users, Building2, BarChart3, Loader2, UserCheck, ShoppingCart,
  CheckSquare, TrendingUp, Activity, KeyRound, Power, PowerOff, Copy, Check,
  Trash2, UserMinus
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useTheme } from "@/components/ThemeProvider";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from "@/components/ui/dialog";

interface PlatformStats {
  totalUsers: number;
  totalOrgs: number;
  totalOrders: number;
  totalCustomers: number;
  totalTasks: number;
  totalRevenue: number;
}

interface OrgDetail {
  id: string;
  name: string;
  created_at: string;
  is_active: boolean;
  memberCount: number;
  orderCount: number;
  revenue: number;
}

interface UserDetail {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  display_name: string | null;
  orgCount: number;
  orgs: { id: string; name: string }[];
}

const PIE_COLORS = [
  "hsl(239, 84%, 67%)",
  "hsl(160, 84%, 39%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 84%, 60%)",
  "hsl(280, 67%, 55%)",
  "hsl(200, 80%, 50%)",
];

export default function PlatformAdmin() {
  const { user, loading: authLoading } = useAuth();
  const { isPlatformAdmin, loading: adminLoading } = usePlatformAdmin();
  const { resolvedTheme } = useTheme();

  const [stats, setStats] = useState<PlatformStats>({
    totalUsers: 0, totalOrgs: 0, totalOrders: 0,
    totalCustomers: 0, totalTasks: 0, totalRevenue: 0,
  });
  const [orgs, setOrgs] = useState<OrgDetail[]>([]);
  const [users, setUsers] = useState<UserDetail[]>([]);
  const [orgGrowth, setOrgGrowth] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [resetDialog, setResetDialog] = useState<{ open: boolean; tempPassword?: string; email?: string }>({ open: false });
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; description: string; onConfirm: () => void }>({
    open: false, title: "", description: "", onConfirm: () => {},
  });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isPlatformAdmin || adminLoading) return;
    fetchAllData();
  }, [isPlatformAdmin, adminLoading]);

  const invokeAdminAction = async (body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");
    const res = await supabase.functions.invoke("admin-actions", { body });
    if (res.error) throw res.error;
    return res.data;
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [orgsRes, membersRes, ordersRes, customersRes, tasksRes, profilesRes, authUsersRes] = await Promise.all([
        supabase.from("organizations").select("*"),
        supabase.from("organization_members").select("*"),
        supabase.from("orders").select("*"),
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("tasks").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("*"),
        invokeAdminAction({ action: "list_users" }).catch(() => ({ users: [] })),
      ]);

      const allOrgs = orgsRes.data || [];
      const allMembers = membersRes.data || [];
      const allOrders = ordersRes.data || [];
      const allProfiles = profilesRes.data || [];
      const authUsers: { id: string; email: string; created_at: string; last_sign_in_at: string | null }[] = authUsersRes.users || [];

      const totalRevenue = allOrders
        .filter(o => o.status === "completed")
        .reduce((s, o) => s + Number(o.amount), 0);

      const uniqueUserIds = new Set(allMembers.map(m => m.user_id));

      setStats({
        totalUsers: Math.max(uniqueUserIds.size, authUsers.length),
        totalOrgs: allOrgs.length,
        totalOrders: allOrders.length,
        totalCustomers: customersRes.count || 0,
        totalTasks: tasksRes.count || 0,
        totalRevenue,
      });

      const orgDetails: OrgDetail[] = allOrgs.map(org => {
        const orgMembers = allMembers.filter(m => m.organization_id === org.id);
        const orgOrders = allOrders.filter(o => o.organization_id === org.id);
        const rev = orgOrders.filter(o => o.status === "completed").reduce((s, o) => s + Number(o.amount), 0);
        return {
          id: org.id,
          name: org.name,
          created_at: org.created_at,
          is_active: (org as any).is_active !== false,
          memberCount: orgMembers.length,
          orderCount: orgOrders.length,
          revenue: rev,
        };
      });
      setOrgs(orgDetails);

      // Build user details from auth users (more complete) merged with profiles
      const userDetails: UserDetail[] = authUsers.map(au => {
        const profile = allProfiles.find(p => p.user_id === au.id);
        const userOrgs = allMembers.filter(m => m.user_id === au.id);
        const userOrgDetails = userOrgs.map(m => {
          const org = allOrgs.find(o => o.id === m.organization_id);
          return { id: m.organization_id, name: org?.name || "Unknown" };
        });
        return {
          id: au.id,
          email: au.email || au.id.slice(0, 8) + "…",
          created_at: au.created_at || "",
          last_sign_in_at: au.last_sign_in_at,
          display_name: profile?.display_name || null,
          orgCount: userOrgs.length,
          orgs: userOrgDetails,
        };
      });
      if (userDetails.length === 0) {
        Array.from(uniqueUserIds).forEach(uid => {
          const profile = allProfiles.find(p => p.user_id === uid);
          const userOrgs = allMembers.filter(m => m.user_id === uid);
          const userOrgDetails = userOrgs.map(m => {
            const org = allOrgs.find(o => o.id === m.organization_id);
            return { id: m.organization_id, name: org?.name || "Unknown" };
          });
          userDetails.push({
            id: uid,
            email: profile?.display_name || uid.slice(0, 8) + "…",
            created_at: profile?.created_at || "",
            last_sign_in_at: null,
            display_name: profile?.display_name || null,
            orgCount: userOrgs.length,
            orgs: userOrgDetails,
          });
        });
      }
      setUsers(userDetails);

      const monthMap: Record<string, number> = {};
      allOrgs.forEach(org => {
        const month = new Date(org.created_at).toLocaleDateString("en", { year: "numeric", month: "short" });
        monthMap[month] = (monthMap[month] || 0) + 1;
      });
      setOrgGrowth(Object.entries(monthMap).map(([month, count]) => ({ month, count })));
    } catch (err) {
      console.error("Admin fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleOrg = (org: OrgDetail) => {
    const newState = !org.is_active;
    setConfirmDialog({
      open: true,
      title: newState ? "Activate Organization" : "Deactivate Organization",
      description: newState
        ? `Activate "${org.name}"? Members will regain access.`
        : `Deactivate "${org.name}"? Members will lose access until reactivated.`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        setActionLoading(org.id);
        try {
          await invokeAdminAction({ action: "toggle_org_active", org_id: org.id, is_active: newState });
          toast.success(`Organization ${newState ? "activated" : "deactivated"}`);
          setOrgs(prev => prev.map(o => o.id === org.id ? { ...o, is_active: newState } : o));
        } catch (err: any) {
          toast.error(err.message || "Failed to update organization");
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const handleResetPassword = (u: UserDetail) => {
    setConfirmDialog({
      open: true,
      title: "Reset User Password",
      description: `Generate a new temporary password for "${u.display_name || u.email}"? They will need to change it on next login.`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        setActionLoading(u.id);
        try {
          const result = await invokeAdminAction({ action: "reset_user_password", user_id: u.id });
          setResetDialog({ open: true, tempPassword: result.temp_password, email: result.email });
        } catch (err: any) {
          toast.error(err.message || "Failed to reset password");
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const handleDeleteUser = (u: UserDetail) => {
    if (u.id === user?.id) {
      toast.error("You cannot delete your own account");
      return;
    }
    setConfirmDialog({
      open: true,
      title: "Delete User",
      description: `Permanently delete "${u.display_name || u.email}"? This will remove them from all organizations and cannot be undone.`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        setActionLoading(u.id);
        try {
          await invokeAdminAction({ action: "delete_user", user_id: u.id });
          toast.success("User deleted");
          setUsers(prev => prev.filter(x => x.id !== u.id));
          setStats(prev => ({ ...prev, totalUsers: prev.totalUsers - 1 }));
        } catch (err: any) {
          toast.error(err.message || "Failed to delete user");
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const handleRemoveFromOrg = (u: UserDetail, orgId: string, orgName: string) => {
    setConfirmDialog({
      open: true,
      title: "Remove from Organization",
      description: `Remove "${u.display_name || u.email}" from "${orgName}"?`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        setActionLoading(`${u.id}-${orgId}`);
        try {
          await invokeAdminAction({ action: "remove_user_from_org", user_id: u.id, org_id: orgId });
          toast.success("User removed from organization");
          setUsers(prev => prev.map(x => x.id === u.id ? { ...x, orgCount: x.orgCount - 1 } : x));
          setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, memberCount: o.memberCount - 1 } : o));
        } catch (err: any) {
          toast.error(err.message || "Failed to remove user");
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const copyPassword = async () => {
    if (resetDialog.tempPassword) {
      await navigator.clipboard.writeText(resetDialog.tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (authLoading || adminLoading) {
    return (
      <AppLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!user || !isPlatformAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const chartColors = resolvedTheme === "dark"
    ? { grid: "#1F2937", text: "#9CA3AF", bar: "hsl(239, 84%, 67%)" }
    : { grid: "#E5E7EB", text: "#6B7280", bar: "hsl(239, 84%, 67%)" };

  const orgPieData = orgs.slice(0, 6).map(o => ({ name: o.name, value: o.revenue || 1 }));

  const statCards = [
    { title: "Total Users", value: stats.totalUsers, icon: Users, color: "text-primary", bg: "from-primary/10 to-primary/5" },
    { title: "Organizations", value: stats.totalOrgs, icon: Building2, color: "text-secondary", bg: "from-secondary/10 to-secondary/5" },
    { title: "Total Orders", value: stats.totalOrders, icon: ShoppingCart, color: "text-warning", bg: "from-warning/10 to-warning/5" },
    { title: "Total Revenue", value: `$${stats.totalRevenue.toLocaleString()}`, icon: TrendingUp, color: "text-success", bg: "from-success/10 to-success/5" },
    { title: "Customers", value: stats.totalCustomers, icon: UserCheck, color: "text-accent-foreground", bg: "from-accent/40 to-accent/20" },
    { title: "Tasks", value: stats.totalTasks, icon: CheckSquare, color: "text-primary", bg: "from-primary/10 to-primary/5" },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Platform Admin</h1>
            <p className="text-sm text-muted-foreground">Manage the entire platform from here</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {statCards.map((stat, idx) => (
                <Card key={stat.title} className="glass glass-hover" style={{ animationDelay: `${idx * 60}ms` }}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className={`h-8 w-8 rounded-xl bg-gradient-to-br ${stat.bg} flex items-center justify-center`}>
                        <stat.icon className={`h-4 w-4 ${stat.color}`} />
                      </div>
                    </div>
                    <div className="text-xl font-bold text-foreground">{stat.value}</div>
                    <div className="text-xs text-muted-foreground">{stat.title}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Tabs defaultValue="analytics" className="space-y-4">
              <TabsList className="bg-muted/50">
                <TabsTrigger value="analytics" className="gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5" /> Analytics
                </TabsTrigger>
                <TabsTrigger value="organizations" className="gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> Organizations
                </TabsTrigger>
                <TabsTrigger value="users" className="gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Users
                </TabsTrigger>
              </TabsList>

              <TabsContent value="analytics" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card className="glass">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Activity className="h-4 w-4 text-primary" />
                        Organization Growth
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {orgGrowth.length > 0 ? (
                        <ResponsiveContainer width="100%" height={260}>
                          <BarChart data={orgGrowth}>
                            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                            <XAxis dataKey="month" stroke={chartColors.text} fontSize={11} />
                            <YAxis stroke={chartColors.text} fontSize={11} allowDecimals={false} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: resolvedTheme === "dark" ? "#111827" : "#fff",
                                border: `1px solid ${resolvedTheme === "dark" ? "#1F2937" : "#E5E7EB"}`,
                                borderRadius: "12px",
                              }}
                            />
                            <Bar dataKey="count" fill={chartColors.bar} radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <p className="text-muted-foreground text-center py-8">No data yet</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="glass">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-secondary" />
                        Revenue by Organization
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {orgPieData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={260}>
                          <PieChart>
                            <Pie data={orgPieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value" label={({ name }) => name.slice(0, 12)}>
                              {orgPieData.map((_, i) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <p className="text-muted-foreground text-center py-8">No data yet</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="organizations">
                <Card className="glass">
                  <CardHeader>
                    <CardTitle className="text-base">All Organizations</CardTitle>
                    <CardDescription>{orgs.length} organizations registered</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Members</TableHead>
                          <TableHead>Orders</TableHead>
                          <TableHead>Revenue</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orgs.map(org => (
                          <TableRow key={org.id} className={!org.is_active ? "opacity-60" : ""}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-muted-foreground" />
                                {org.name}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={org.is_active ? "default" : "destructive"} className="text-xs">
                                {org.is_active ? "Active" : "Deactivated"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{org.memberCount}</Badge>
                            </TableCell>
                            <TableCell>{org.orderCount}</TableCell>
                            <TableCell className="font-medium text-success">${org.revenue.toLocaleString()}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {new Date(org.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant={org.is_active ? "destructive" : "default"}
                                size="sm"
                                disabled={actionLoading === org.id}
                                onClick={() => handleToggleOrg(org)}
                              >
                                {actionLoading === org.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : org.is_active ? (
                                  <><PowerOff className="h-3.5 w-3.5 mr-1" /> Deactivate</>
                                ) : (
                                  <><Power className="h-3.5 w-3.5 mr-1" /> Activate</>
                                )}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {orgs.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                              No organizations found
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="users">
                <Card className="glass">
                  <CardHeader>
                    <CardTitle className="text-base">All Users</CardTitle>
                    <CardDescription>{users.length} users across the platform</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Organizations</TableHead>
                          <TableHead>Last Sign In</TableHead>
                          <TableHead>Joined</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map(u => (
                          <TableRow key={u.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                                  <Users className="h-3.5 w-3.5 text-primary" />
                                </div>
                                <span className="font-medium text-sm">{u.display_name || "User"}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {u.orgs.map(org => (
                                  <Badge key={org.id} variant="outline" className="gap-1 pr-1">
                                    {org.name}
                                    <button
                                      className="ml-0.5 rounded-full hover:bg-destructive/20 p-0.5"
                                      disabled={actionLoading === `${u.id}-${org.id}`}
                                      onClick={() => handleRemoveFromOrg(u, org.id, org.name)}
                                      title={`Remove from ${org.name}`}
                                    >
                                      {actionLoading === `${u.id}-${org.id}` ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <UserMinus className="h-3 w-3 text-destructive" />
                                      )}
                                    </button>
                                  </Badge>
                                ))}
                                {u.orgs.length === 0 && <span className="text-muted-foreground text-xs">None</span>}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : "Never"}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={actionLoading === u.id}
                                  onClick={() => handleResetPassword(u)}
                                >
                                  {actionLoading === u.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <><KeyRound className="h-3.5 w-3.5 mr-1" /> Reset</>
                                  )}
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  disabled={actionLoading === u.id || u.id === user?.id}
                                  onClick={() => handleDeleteUser(u)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {users.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                              No users found
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDialog.title}</DialogTitle>
            <DialogDescription>{confirmDialog.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>
              Cancel
            </Button>
            <Button onClick={confirmDialog.onConfirm}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Reset Result Dialog */}
      <Dialog open={resetDialog.open} onOpenChange={(open) => setResetDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password Reset Successful</DialogTitle>
            <DialogDescription>
              A temporary password has been generated for <strong>{resetDialog.email}</strong>. Share it securely with the user.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted font-mono text-sm">
            <span className="flex-1 select-all">{resetDialog.tempPassword}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copyPassword}>
              {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setResetDialog({ open: false })}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
