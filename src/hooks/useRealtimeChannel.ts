import { useEffect, useRef } from "react";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeStatus, type ChannelStatus } from "@/contexts/RealtimeStatusContext";

type PostgresFilter = {
  event: "*" | "INSERT" | "UPDATE" | "DELETE";
  schema: string;
  table: string;
  filter?: string;
};

interface Options {
  /** Stable channel name — also used as the status key. Include org/user id. */
  channelName: string;
  /** Postgres_changes filter. Skip the subscription entirely when null (e.g. no active org yet). */
  filter: PostgresFilter | null;
  /** Handler invoked on every matching change. */
  onChange: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  /** Extra deps that should force a fresh subscription. */
  deps?: unknown[];
}

const BACKOFF_MS = [1000, 2000, 5000, 10000, 20000];

/**
 * Wraps a Supabase postgres_changes subscription with:
 *   - reports channel status (connecting/connected/error/closed) into RealtimeStatusContext
 *   - exponential-backoff reconnect on CHANNEL_ERROR / TIMED_OUT / CLOSED
 *   - immediate reconnect when the browser goes online or the tab becomes visible
 *   - manual reconnect via reconnectAll() (bumps reconnectToken)
 *   - always tears the channel down on unmount / dep change
 */
export function useRealtimeChannel({ channelName, filter, onChange, deps = [] }: Options) {
  const { setChannelStatus, unregisterChannel, reconnectToken } = useRealtimeStatus();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!filter) {
      unregisterChannel(channelName);
      return;
    }

    let cancelled = false;
    let attempt = 0;
    let retryTimer: number | undefined;
    let channel: RealtimeChannel | null = null;

    const report = (status: ChannelStatus) => {
      if (!cancelled) setChannelStatus(channelName, status);
    };

    const cleanup = () => {
      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    };

    const scheduleRetry = () => {
      if (cancelled) return;
      const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      attempt += 1;
      retryTimer = window.setTimeout(() => {
        cleanup();
        connect();
      }, delay);
    };

    const connect = () => {
      if (cancelled) return;
      report("connecting");
      channel = supabase
        .channel(channelName)
        .on("postgres_changes", filter as any, (payload) => onChangeRef.current(payload as any))
        .subscribe((status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            attempt = 0;
            report("connected");
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            report("error");
            scheduleRetry();
          } else if (status === "CLOSED") {
            report("closed");
            scheduleRetry();
          }
        });
    };

    const handleOnline = () => {
      attempt = 0;
      cleanup();
      connect();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") handleOnline();
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    connect();

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      cleanup();
      unregisterChannel(channelName);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, filter?.table, filter?.filter, filter?.event, reconnectToken, ...deps]);
}
