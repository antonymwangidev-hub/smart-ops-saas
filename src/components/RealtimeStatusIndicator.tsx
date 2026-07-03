import { useRealtimeStatus, type OverallStatus } from "@/contexts/RealtimeStatusContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Wifi, WifiOff, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const META: Record<OverallStatus, { label: string; dot: string; icon: React.ComponentType<{ className?: string }> }> = {
  connected:  { label: "Realtime connected",              dot: "bg-success",     icon: Wifi },
  connecting: { label: "Realtime connecting…",            dot: "bg-warning animate-pulse", icon: Loader2 },
  degraded:   { label: "Realtime partially connected",    dot: "bg-warning",     icon: AlertTriangle },
  offline:    { label: "Realtime disconnected",           dot: "bg-destructive", icon: WifiOff },
  idle:       { label: "No realtime channels active",     dot: "bg-muted-foreground/50", icon: Wifi },
};

export function RealtimeStatusIndicator({ compact = false }: { compact?: boolean }) {
  const { overall, channels, reconnectAll } = useRealtimeStatus();
  const meta = META[overall];
  const Icon = meta.icon;
  const perChannel = Object.entries(channels);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={reconnectAll}
          className="h-8 px-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          aria-label={meta.label}
        >
          <span className={cn("h-2 w-2 rounded-full inline-block shrink-0", meta.dot)} />
          {!compact && <Icon className={cn("h-3.5 w-3.5", overall === "connecting" && "animate-spin")} />}
          {!compact && <span className="hidden sm:inline">Live</span>}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end" className="max-w-xs">
        <div className="space-y-1.5">
          <p className="font-medium text-xs">{meta.label}</p>
          {perChannel.length > 0 && (
            <ul className="text-[11px] text-muted-foreground space-y-0.5">
              {perChannel.map(([key, status]) => (
                <li key={key} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      status === "connected" && "bg-success",
                      status === "connecting" && "bg-warning animate-pulse",
                      status === "error" && "bg-destructive",
                      status === "closed" && "bg-muted-foreground",
                    )}
                  />
                  <span className="truncate">{key.split(":").slice(-1)[0]}</span>
                  <span className="ml-auto">{status}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-muted-foreground flex items-center gap-1 pt-1 border-t border-border/50">
            <RefreshCw className="h-3 w-3" /> Click to force reconnect
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
