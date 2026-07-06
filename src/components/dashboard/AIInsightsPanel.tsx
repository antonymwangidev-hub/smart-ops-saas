import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight, Lightbulb, AlertCircle, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";

export interface AIInsight {
  id: string;
  type: "opportunity" | "warning" | "info";
  message: string;
  action?: { label: string; path: string };
}

interface Props {
  insights: AIInsight[];
  loading?: boolean;
}

const iconFor = (t: AIInsight["type"]) =>
  t === "warning" ? AlertCircle : t === "opportunity" ? TrendingUp : Lightbulb;

const toneFor = (t: AIInsight["type"]) =>
  t === "warning" ? "text-warning bg-warning/10 ring-warning/20"
  : t === "opportunity" ? "text-success bg-success/10 ring-success/20"
  : "text-primary bg-primary/10 ring-primary/20";

export function AIInsightsPanel({ insights, loading }: Props) {
  const navigate = useNavigate();

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.03] via-transparent to-primary/[0.02] overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-sm shadow-primary/30">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold">AI Business Advisor</CardTitle>
            <p className="text-xs text-muted-foreground">Proactive insights from your data</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2.5">
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : insights.length === 0 ? (
          <div className="text-center py-6">
            <Lightbulb className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Everything looks good today.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              I'll surface issues and opportunities here as they arise.
            </p>
          </div>
        ) : (
          insights.map((insight) => {
            const Icon = iconFor(insight.type);
            return (
              <div
                key={insight.id}
                className="group flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-card/50 hover:bg-card hover:border-border transition-all"
              >
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ring-1 shrink-0 ${toneFor(insight.type)}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground leading-snug">{insight.message}</p>
                  {insight.action && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 mt-1 text-xs text-primary hover:text-primary"
                      onClick={() => navigate(insight.action!.path)}
                    >
                      {insight.action.label}
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
