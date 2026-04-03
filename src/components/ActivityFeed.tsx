import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { formatDistanceToNow } from "date-fns";
import { Activity } from "lucide-react";

interface LogEntry {
  id: string;
  action: string;
  metadata: any;
  created_at: string;
  display_name?: string;
}

export function ActivityFeed() {
  const { currentOrg } = useOrg();
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const fetchLogs = async () => {
    if (!currentOrg) return;
    const { data } = await supabase
      .from("activity_logs")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (data) {
      const userIds = [...new Set(data.filter(l => l.user_id).map(l => l.user_id!))];
      const { data: profiles } = userIds.length > 0
        ? await supabase.from("profiles").select("user_id, display_name").in("user_id", userIds)
        : { data: [] };

      setLogs(data.map(l => ({
        ...l,
        display_name: profiles?.find(p => p.user_id === l.user_id)?.display_name || "System",
      })));
    }
  };

  useEffect(() => {
    fetchLogs();
    if (!currentOrg) return;
    const channel = supabase
      .channel("activity-feed")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "activity_logs",
        filter: `organization_id=eq.${currentOrg.id}`,
      }, () => fetchLogs())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentOrg]);

  const formatAction = (log: LogEntry) => {
    const action = log.action.replace(/_/g, " ");
    return `${log.display_name} ${action}`;
  };

  return (
    <div className="space-y-2">
      {logs.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">No recent activity</p>
      )}
      {logs.map((log) => (
        <div key={log.id} className="flex items-start gap-2 text-xs">
          <Activity className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-foreground">{formatAction(log)}</span>
            <span className="text-muted-foreground ml-1">
              {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
