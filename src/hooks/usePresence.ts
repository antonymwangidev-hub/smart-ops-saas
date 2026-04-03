import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";

interface PresenceUser {
  user_id: string;
  status: "online" | "offline" | "idle";
  last_seen: string;
  current_task_id: string | null;
  display_name?: string;
}

export function usePresence() {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);

  const fetchPresence = useCallback(async () => {
    if (!currentOrg) return;
    const { data } = await supabase
      .from("user_presence" as any)
      .select("*")
      .eq("organization_id", currentOrg.id);

    if (data) {
      const userIds = (data as any[]).map((p: any) => p.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", userIds);

      const enriched = (data as any[]).map((p: any) => ({
        ...p,
        display_name: profiles?.find((pr) => pr.user_id === p.user_id)?.display_name || "Unknown",
        status: isOnline(p.last_seen) ? (p.status as any) : "offline",
      }));
      setOnlineUsers(enriched);
    }
  }, [currentOrg]);

  const isOnline = (lastSeen: string) => {
    return Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000; // 5 min
  };

  const updatePresence = useCallback(async (taskId?: string | null) => {
    if (!user || !currentOrg) return;
    // Upsert presence
    const { error } = await supabase.from("user_presence" as any).upsert({
      user_id: user.id,
      organization_id: currentOrg.id,
      status: "online",
      last_seen: new Date().toISOString(),
      current_task_id: taskId ?? null,
    } as any, { onConflict: "user_id" });
    if (error) console.error("Presence update error:", error);
  }, [user, currentOrg]);

  useEffect(() => {
    if (!user || !currentOrg) return;

    updatePresence();
    fetchPresence();

    // Heartbeat every 30s
    const interval = setInterval(() => {
      updatePresence();
      fetchPresence();
    }, 30000);

    // Realtime subscription
    const channel = supabase
      .channel("presence-updates")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "user_presence",
        filter: `organization_id=eq.${currentOrg.id}`,
      }, () => fetchPresence())
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [user, currentOrg, updatePresence, fetchPresence]);

  const onlineCount = onlineUsers.filter(u => u.status === "online").length;

  return { onlineUsers, onlineCount, updatePresence };
}
