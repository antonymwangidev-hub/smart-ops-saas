import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from "react";

export type ChannelStatus = "connecting" | "connected" | "error" | "closed";
export type OverallStatus = "connected" | "connecting" | "degraded" | "offline" | "idle";

interface RealtimeStatusContextType {
  channels: Record<string, ChannelStatus>;
  overall: OverallStatus;
  setChannelStatus: (key: string, status: ChannelStatus) => void;
  unregisterChannel: (key: string) => void;
  /** Bumped to force all registered subscriptions to tear down and re-subscribe. */
  reconnectToken: number;
  reconnectAll: () => void;
}

const RealtimeStatusContext = createContext<RealtimeStatusContextType>({
  channels: {},
  overall: "idle",
  setChannelStatus: () => {},
  unregisterChannel: () => {},
  reconnectToken: 0,
  reconnectAll: () => {},
});

export const useRealtimeStatus = () => useContext(RealtimeStatusContext);

function computeOverall(channels: Record<string, ChannelStatus>): OverallStatus {
  const values = Object.values(channels);
  if (values.length === 0) return "idle";
  if (values.every((s) => s === "connected")) return "connected";
  if (values.some((s) => s === "error" || s === "closed")) {
    return values.some((s) => s === "connected") ? "degraded" : "offline";
  }
  return "connecting";
}

export function RealtimeStatusProvider({ children }: { children: ReactNode }) {
  const [channels, setChannels] = useState<Record<string, ChannelStatus>>({});
  const [reconnectToken, setReconnectToken] = useState(0);

  const setChannelStatus = useCallback((key: string, status: ChannelStatus) => {
    setChannels((prev) => (prev[key] === status ? prev : { ...prev, [key]: status }));
  }, []);

  const unregisterChannel = useCallback((key: string) => {
    setChannels((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const reconnectAll = useCallback(() => setReconnectToken((n) => n + 1), []);

  const overall = useMemo(() => computeOverall(channels), [channels]);

  const value = useMemo(
    () => ({ channels, overall, setChannelStatus, unregisterChannel, reconnectToken, reconnectAll }),
    [channels, overall, setChannelStatus, unregisterChannel, reconnectToken, reconnectAll],
  );

  return <RealtimeStatusContext.Provider value={value}>{children}</RealtimeStatusContext.Provider>;
}
