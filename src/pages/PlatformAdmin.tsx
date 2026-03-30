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
  CheckSquare, TrendingUp, Activity, Eye
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useTheme } from "@/components/ThemeProvider";

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

  useEffect(() => {
    if (!isPlatformAdmin || adminLoading) return;
    fetchAllData();
  }, [isPlatformAdmin, adminLoading]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      // Fetch all data in parallel
      const [orgsRes, membersRes, ordersRes, customersRes, tasksRes, profilesRes] = await Promise.all([
        supabase.from("organizations").select("*"),
        supabase.from("organization_members").select("*"),
        supabase.from("orders").select("*"),
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("tasks").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("*"),
      ]);

      const allOrgs = orgsRes.data || [];
      const allMembers = membersRes.data || [];
      const allOrders = ordersRes.data || [];
      const allProfiles = profilesRes.data || [];

      const totalRevenue = allOrders
        .filter(o => o.status === "completed")
        .reduce((s, o) => s + Number(o.amount), 0);

      // Unique user count from members
      const uniqueUserIds = new Set(allMembers.map(m => m.user_id));

      setStats({
        totalUsers: uniqueUserIds.size,
        totalOrgs: allOrgs.length,
        totalOrders: allOrders.length,
        totalCustomers: customersRes.count || 0,
        totalTasks: tasksRes.count || 0,
        totalRevenue,
      });

      // Org details
      const orgDetails: OrgDetail[] = allOrgs.map(org => {
        const orgMembers = allMembers.filter(m => m.organization_id === org.id);
        const orgOrders = allOrders.filter(o => o.organization_id === org.id);
        const rev = orgOrders.filter(o => o.status === "completed").reduce((s, o) => s + Number(o.amount), 0);
        return {
          id: org.id,
          name: org.name,
          created_at: org.created_at,
          memberCount: orgMembers.length,
          orderCount: orgOrders.length,
          revenue: rev,
        };
      });
      setOrgs(orgDetails);

      // User details
      const userDetails: UserDetail[] = Array.from(uniqueUserIds).map(uid => {
        const profile = allProfiles.find(p => p.user_id === uid);
        const userOrgs = allMembers.filter(m => m.user_id === uid);
        return {
          id: uid,
          email: profile?.display_name || uid.slice(0, 8) + "…",
          created_at: profile?.created_at || "",
          last_sign_in_at: null,
          display_name: profile?.display_name || null,
          orgCount: userOrgs.length,
        };
      });
      setUsers(userDetails);

      // Org growth chart (by month)
      const monthMap: Record<string, number> = {};
      allOrgs.forEach(org => {
        const month = new Date(org.created_at).toLocaleDateString("en", { year: "numeric", month: "short" });
        monthMap[month] = (monthMap[month] || 0) + 1;
      });
      const growth = Object.entries(monthMap).map(([month, count]) => ({ month, count }));
      setOrgGrowth(growth);

    } catch (err) {
      console.error("Admin fetch error:", err);
    } finally {
      setLoading(false);
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
        {/* Header */}
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
            {/* Stats Grid */}
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

              {/* Analytics Tab */}
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
                            <Pie
                              data={orgPieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={100}
                              paddingAngle={3}
                              dataKey="value"
                              label={({ name }) => name.slice(0, 12)}
                            >
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

              {/* Organizations Tab */}
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
                          <TableHead>Members</TableHead>
                          <TableHead>Orders</TableHead>
                          <TableHead>Revenue</TableHead>
                          <TableHead>Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orgs.map(org => (
                          <TableRow key={org.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-muted-foreground" />
                                {org.name}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{org.memberCount}</Badge>
                            </TableCell>
                            <TableCell>{org.orderCount}</TableCell>
                            <TableCell className="font-medium text-success">${org.revenue.toLocaleString()}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {new Date(org.created_at).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                        {orgs.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                              No organizations found
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Users Tab */}
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
                          <TableHead>Organizations</TableHead>
                          <TableHead>Joined</TableHead>
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
                                <div>
                                  <div className="font-medium text-sm">{u.display_name || "User"}</div>
                                  <div className="text-xs text-muted-foreground">{u.id.slice(0, 8)}…</div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{u.orgCount} org{u.orgCount !== 1 ? "s" : ""}</Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                        {users.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
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
    </AppLayout>
  );
}
