import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area } from "recharts";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type Tone = "primary" | "success" | "warning" | "destructive" | "muted";

const toneMap: Record<Tone, { icon: string; bg: string; ring: string; accent: string }> = {
  primary:     { icon: "text-primary",     bg: "bg-primary/10",     ring: "ring-primary/20",     accent: "hsl(var(--primary))" },
  success:     { icon: "text-success",     bg: "bg-success/10",     ring: "ring-success/20",     accent: "hsl(var(--success))" },
  warning:     { icon: "text-warning",     bg: "bg-warning/10",     ring: "ring-warning/20",     accent: "hsl(var(--warning))" },
  destructive: { icon: "text-destructive", bg: "bg-destructive/10", ring: "ring-destructive/20", accent: "hsl(var(--destructive))" },
  muted:       { icon: "text-muted-foreground", bg: "bg-muted",     ring: "ring-border",         accent: "hsl(var(--muted-foreground))" },
};

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: Tone;
  delta?: number | null;         // % change vs comparison
  deltaLabel?: string;           // e.g. "vs yesterday"
  sparkline?: number[];
  onClick?: () => void;
  hint?: string;                 // small caption under label
}

export function KpiCard({
  label, value, icon: Icon, tone = "primary",
  delta, deltaLabel = "vs yesterday", sparkline, onClick, hint,
}: KpiCardProps) {
  const t = toneMap[tone];
  const hasDelta = typeof delta === "number";
  const deltaTone =
    !hasDelta ? "text-muted-foreground"
    : delta! > 0 ? "text-success"
    : delta! < 0 ? "text-destructive"
    : "text-muted-foreground";
  const DeltaIcon = !hasDelta ? Minus : delta! > 0 ? TrendingUp : delta! < 0 ? TrendingDown : Minus;

  const sparkData = (sparkline ?? []).map((v, i) => ({ i, v }));

  return (
    <Card
      onClick={onClick}
      className={cn(
        "relative overflow-hidden border-border/60 transition-all duration-200",
        onClick && "cursor-pointer hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5",
      )}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className="text-2xl sm:text-3xl font-bold text-foreground mt-1.5 tracking-tight tabular-nums">
              {value}
            </p>
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </div>
          <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center ring-1", t.bg, t.ring)}>
            <Icon className={cn("h-5 w-5", t.icon)} />
          </div>
        </div>

        <div className="mt-3 flex items-end justify-between gap-3">
          <div className={cn("flex items-center gap-1 text-xs font-medium", deltaTone)}>
            <DeltaIcon className="h-3.5 w-3.5" />
            <span>{hasDelta ? `${delta! > 0 ? "+" : ""}${delta}%` : "—"}</span>
            <span className="text-muted-foreground font-normal ml-1">{deltaLabel}</span>
          </div>
          {sparkData.length > 1 && (
            <div className="h-8 w-20 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparkData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={t.accent} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={t.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke={t.accent}
                    strokeWidth={1.5}
                    fill={`url(#spark-${label})`}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
