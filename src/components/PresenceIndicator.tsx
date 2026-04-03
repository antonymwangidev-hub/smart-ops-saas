import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface PresenceIndicatorProps {
  status: "online" | "offline" | "idle";
  name?: string;
  className?: string;
  showTooltip?: boolean;
}

const statusColors: Record<string, string> = {
  online: "bg-emerald-500",
  idle: "bg-amber-500",
  offline: "bg-muted-foreground/40",
};

export function PresenceIndicator({ status, name, className, showTooltip = true }: PresenceIndicatorProps) {
  const dot = (
    <span
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full ring-2 ring-background",
        statusColors[status],
        status === "online" && "animate-pulse",
        className
      )}
    />
  );

  if (!showTooltip || !name) return dot;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{dot}</TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {name} — {status}
      </TooltipContent>
    </Tooltip>
  );
}
