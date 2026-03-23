import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, Check, Loader2, AlertTriangle, TrendingUp, DollarSign, Info } from "lucide-react";

function getNotificationIcon(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes("high-value") || lower.includes("revenue")) return <DollarSign className="h-4 w-4 text-success" />;
  if (lower.includes("warning") || lower.includes("no new") || lower.includes("inactive")) return <AlertTriangle className="h-4 w-4 text-warning" />;
  if (lower.includes("growth") || lower.includes("milestone") || lower.includes("momentum")) return <TrendingUp className="h-4 w-4 text-primary" />;
  return <Info className="h-4 w-4 text-info" />;
}

export default function Notifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setNotifications(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchNotifications(); }, [user]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel("notifications-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => fetchNotifications())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    fetchNotifications();
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    fetchNotifications();
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
            <p className="text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up!"}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" onClick={markAllRead} className="rounded-xl">
              <Check className="h-4 w-4 mr-2" />Mark all read
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : notifications.length === 0 ? (
          <Card className="p-12 text-center glass">
            <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground">No notifications</h3>
            <p className="text-muted-foreground mt-1">You're all caught up!</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {notifications.map((n, idx) => (
              <Card
                key={n.id}
                className={`glass transition-all duration-300 hover:border-primary/20 ${n.is_read ? "opacity-50" : ""}`}
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="h-8 w-8 rounded-xl bg-accent flex items-center justify-center flex-shrink-0 mt-0.5">
                    {getNotificationIcon(n.title)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{n.title}</span>
                      {!n.is_read && (
                        <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                      )}
                    </div>
                    {n.message && <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>}
                    <p className="text-xs text-muted-foreground/70 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                  {!n.is_read && (
                    <Button variant="ghost" size="sm" onClick={() => markRead(n.id)} className="rounded-lg flex-shrink-0">
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
