import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  title: string;
  message: string;
  actionLabel?: string;
  actionPath?: string;
}

export function EmptyState({ icon: Icon, title, message, actionLabel, actionPath }: Props) {
  const navigate = useNavigate();
  return (
    <Card className="border-dashed border-border/60 bg-muted/20">
      <CardContent className="p-8 text-center">
        <div className="h-12 w-12 rounded-2xl bg-primary/10 mx-auto flex items-center justify-center mb-3">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">{message}</p>
        {actionLabel && actionPath && (
          <Button size="sm" className="mt-4" onClick={() => navigate(actionPath)}>
            {actionLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
