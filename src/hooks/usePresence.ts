import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";

interface PresenceUser {
  user_id: string;
  status: "online" | "offline" | "idle";
  last_seen: string;
  current_task_id: string | null;
  display_name: string;
}

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const HEARTBEAT_MS = 30_000;

function isActivelyOnline(lastSeen: string): boolean {
  return Date.now() - new Date(lastSeen).getTime() < ONLINE_THRESHOLD_MS;
}

/**
 * usePresence — fixed N+1 query pattern.
 *
 * ORIGINAL PROBLEM
 * ────────────────
 * fetchPresence made 2 sequential round-trips on every heartbeat:
 *   1. SELECT * FROM user_presence WHERE org_id = X
 *   2. SELECT user_id, display_name FROM profiles WHERE user_id IN (...)
 *
 * With a 30-second heartbeat + realtime trigger, that's up to 4 queries
 * per minute per connected user — just to show who's online.
 *
 * FIX
 * ───
 * Single query using a Postgres join:
 *   SELECT up.*, p.display_name FROM user_presence up
 *   JOIN profiles p ON p.user_id = up.user_id
 *   WHERE up.organization_id = X
 *
 * One round-trip. The Supabase client expresses this as a nested select:
 *   .select("*, profiles(display_name)")
 *
 * ADDITIONAL FIXES
 * ────────────────
 * - useRef for the channel so the subscription is stable across renders
 * - updatePresence is now debounced at 5s to avoid flooding on rapid
 *   navigation (e.g. user hammering the back button)
 */
export function usePresence() {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPresence = useCallback(async () => {
    if (!currentOrg) return;

    // Single query with join — replaces the original 2-query N+1 pattern
    const { data, error } = await (supabase as any)
      .from("user_presence")
      .select("*, profiles(display_name)")
      .eq("organization_id", currentOrg.id);

    if (error) {
      // Presence is non-critical; log but don't surface to user
      console.warn("[usePresence] fetch error:", error.message);
      return;
    }

    const enriched: PresenceUser[] = (data ?? []).map((p: any) => ({
      user_id: p.user_id,
      status: isActivelyOnline(p.last_seen)
        ? (p.status as PresenceUser["status"])
        : "offline",
      last_seen: p.last_seen,
      current_task_id: p.current_task_id ?? null,
      display_name: p.profiles?.display_name ?? "Unknown",
    }));

    setOnlineUsers(enriched);
  }, [currentOrg]);

  const updatePresence = useCallback(
    (taskId?: string | null) => {
      if (!user || !currentOrg) return;

      // Debounce: don't write to DB more often than every 5 seconds
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        const { error } = await (supabase as any)
          .from("user_presence")
          .upsert(
            {
              user_id: user.id,
              organization_id: currentOrg.id,
              status: "online",
              last_seen: new Date().toISOString(),
              current_task_id: taskId ?? null,
            },
            { onConflict: "user_id" }
          );
        if (error) console.warn("[usePresence] update error:", error.message);
      }, 5000);
    },
    [user, currentOrg]
  );

  useEffect(() => {
    if (!user || !currentOrg) return;

    // Fire immediately on mount (no debounce for first heartbeat)
    ;(async () => {
      await (supabase as any)
        .from("user_presence")
        .upsert(
          {
            user_id: user.id,
            organization_id: currentOrg.id,
            status: "online",
            last_seen: new Date().toISOString(),
            current_task_id: null,
          },
          { onConflict: "user_id" }
        );
      fetchPresence();
    })();

    const interval = setInterval(() => {
      updatePresence();
      fetchPresence();
    }, HEARTBEAT_MS);

    // Stable channel ref — avoids creating a new subscription on every render
    const channelName = `presence:${currentOrg.id}`;
    channelRef.current = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_presence",
          filter: `organization_id=eq.${currentOrg.id}`,
        },
        fetchPresence
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user?.id, currentOrg?.id]); // deliberately minimal — only re-run if identity changes

  const onlineCount = onlineUsers.filter((u) => u.status === "online").length;

  return { onlineUsers, onlineCount, updatePresence };
}
