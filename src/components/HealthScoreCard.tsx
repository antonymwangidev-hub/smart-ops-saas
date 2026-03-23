import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrg } from "@/contexts/OrgContext";
import { Activity, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface HealthData {
  score: number;
  status: string;
  summary: string;
  factors: string[];
}

export function HealthScoreCard() {
  const { currentOrg } = useOrg();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);
    supabase.functions
      .invoke("business-health", { body: { orgId: currentOrg.id } })
      .then(({ data, error }) => {
        if (error) console.error("Health score error:", error);
        else setHealth(data as HealthData);
      })
      .finally(() => setLoading(false));
  }, [currentOrg]);

  useEffect(() => {
    if (!health) return;
    const duration = 1200;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(health.score * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };
    tick();
  }, [health]);

  const getColor = (score: number) => {
    if (score >= 80) return { text: "text-success", bg: "bg-success", ring: "ring-success/20", gradient: "from-success to-success/60" };
    if (score >= 60) return { text: "text-primary", bg: "bg-primary", ring: "ring-primary/20", gradient: "from-primary to-primary/60" };
    if (score >= 40) return { text: "text-warning", bg: "bg-warning", ring: "ring-warning/20", gradient: "from-warning to-warning/60" };
    return { text: "text-destructive", bg: "bg-destructive", ring: "ring-destructive/20", gradient: "from-destructive to-destructive/60" };
  };

  const colors = health ? getColor(health.score) : { text: "text-muted-foreground", bg: "bg-muted", ring: "", gradient: "" };
  const circumference = 2 * Math.PI * 40;
  const strokeDash = health ? (animatedScore / 100) * circumference : 0;

  return (
    <Card className="col-span-full lg:col-span-2 glass glass-hover overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Business Health Score</CardTitle>
        <Activity className={cn("h-4 w-4", colors.text)} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : health ? (
          <div className="flex items-center gap-8">
            {/* Circular progress */}
            <div className="relative flex-shrink-0">
              <svg width="100" height="100" viewBox="0 0 100 100" className="-rotate-90">
                <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="40" fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference - strokeDash}
                  className={cn("transition-all duration-1000", colors.text)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn("text-2xl font-bold", colors.text)}>{animatedScore}</span>
                <span className="text-[10px] text-muted-foreground">/ 100</span>
              </div>
            </div>

            {/* Details */}
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <span className={cn("text-sm font-semibold px-2.5 py-1 rounded-full",
                  health.score >= 60 ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                )}>
                  {health.status}
                </span>
                {health.score >= 60 ? (
                  <TrendingUp className="h-4 w-4 text-success" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-warning" />
                )}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{health.summary}</p>
              {health.factors.length > 0 && (
                <ul className="space-y-1.5">
                  {health.factors.slice(0, 3).map((f, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                      <span className={cn("h-1.5 w-1.5 rounded-full", colors.bg)} />
                      {f}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Unable to calculate health score</p>
        )}
      </CardContent>
    </Card>
  );
}
