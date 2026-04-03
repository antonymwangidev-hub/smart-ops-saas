import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, User, Clock, Tag, CheckCircle, X, Loader2 } from "lucide-react";

export interface AIRecommendation {
  priority: "high" | "medium" | "low";
  priority_reason: string;
  suggested_assignee_id: string | null;
  suggested_assignee_name?: string;
  assignee_reason: string;
  estimated_hours: number;
  category: string;
  confidence: number;
}

interface AIRecommendationCardProps {
  recommendation: AIRecommendation | null;
  loading: boolean;
  onAccept: (rec: AIRecommendation) => void;
  onDismiss: () => void;
}

const priorityColors: Record<string, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/20",
  medium: "bg-warning/10 text-warning border-warning/20",
  low: "bg-muted text-muted-foreground border-border",
};

export function AIRecommendationCard({ recommendation, loading, onAccept, onDismiss }: AIRecommendationCardProps) {
  if (loading) {
    return (
      <Card className="border-primary/20 bg-primary/5 animate-pulse">
        <CardContent className="flex items-center gap-3 py-4">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">AI is analyzing your task…</span>
        </CardContent>
      </Card>
    );
  }

  if (!recommendation) return null;

  const confidence = Math.round(recommendation.confidence * 100);

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Recommendations
          <Badge variant="outline" className="ml-auto text-[10px]">{confidence}% confidence</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <Tag className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Priority:</span>
            <Badge variant="outline" className={`text-[10px] px-1.5 ${priorityColors[recommendation.priority]}`}>
              {recommendation.priority}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Effort:</span>
            <span className="font-medium">{recommendation.estimated_hours}h</span>
          </div>
          {recommendation.suggested_assignee_name && (
            <div className="flex items-center gap-1.5">
              <User className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Assign:</span>
              <span className="font-medium truncate">{recommendation.suggested_assignee_name}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Tag className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Category:</span>
            <span className="font-medium">{recommendation.category}</span>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground italic">{recommendation.priority_reason}</p>
        <div className="flex gap-2">
          <Button size="sm" className="h-7 text-xs flex-1" onClick={() => onAccept(recommendation)}>
            <CheckCircle className="h-3 w-3 mr-1" /> Accept
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onDismiss}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
