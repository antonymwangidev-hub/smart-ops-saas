import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useOrg } from "@/contexts/OrgContext";
import { Activity, Loader2 } from "lucide-react";
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

  const statusColor = health
    ? health.score >= 80
      ? "text-success"
      : health.score >= 60
      ? "text-primary"
      : health.score >= 40
      ? "text-warning"
      : "text-destructive"
    : "text-muted-foreground";

  const progressColor = health
    ? health.score >= 80
      ? "bg-success"
      : health.score >= 60
      ? "bg-primary"
      : health.score >= 40
      ? "bg-warning"
      : "bg-destructive"
    : "bg-muted";

  return (
    <Card className="col-span-full lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Business Health Score</CardTitle>
        <Activity className={cn("h-4 w-4", statusColor)} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : health ? (
          <div className="space-y-3">
            <div className="flex items-end gap-2">
              <span className={cn("text-3xl font-bold", statusColor)}>{health.score}</span>
              <span className="text-sm text-muted-foreground mb-1">/ 100</span>
              <span className={cn("text-sm font-medium ml-auto px-2 py-0.5 rounded-full", 
                health.score >= 80 ? "bg-success/10 text-success" :
                health.score >= 60 ? "bg-primary/10 text-primary" :
                health.score >= 40 ? "bg-warning/10 text-warning" :
                "bg-destructive/10 text-destructive"
              )}>
                {health.status}
              </span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full transition-all duration-700 rounded-full", progressColor)}
                style={{ width: `${health.score}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground">{health.summary}</p>
            {health.factors.length > 0 && (
              <ul className="space-y-1">
                {health.factors.slice(0, 4).map((f, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Unable to calculate health score</p>
        )}
      </CardContent>
    </Card>
  );
}
