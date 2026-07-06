import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CreditCard, Package, ArrowRight, Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";

export interface SmartAlert {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail?: string;
  icon: "stock" | "credit" | "expense" | "bell";
  path: string;
  count?: number;
}

const ICON_MAP = {
  stock: Package,
  credit: CreditCard,
  expense: AlertTriangle,
  bell: Bell,
};

const SEV_TONE = {
  high: "text-destructive bg-destructive/10 ring-destructive/20",
  medium: "text-warning bg-warning/10 ring-warning/20",
  low: "text-primary bg-primary/10 ring-primary/20",
};

export function SmartAlertsPanel({ alerts }: { alerts: SmartAlert[] }) {
  const navigate = useNavigate();

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            Smart Alerts
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Issues that need your attention</p>
        </div>
        {alerts.length > 0 && (
          <Badge variant="destructive" className="rounded-full">{alerts.length}</Badge>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {alerts.length === 0 ? (
          <div className="text-center py-6">
            <div className="h-10 w-10 rounded-full bg-success/10 mx-auto flex items-center justify-center mb-2">
              <Bell className="h-5 w-5 text-success" />
            </div>
            <p className="text-sm text-foreground font-medium">All clear</p>
            <p className="text-xs text-muted-foreground mt-0.5">No urgent issues right now.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((a) => {
              const Icon = ICON_MAP[a.icon];
              return (
                <button
                  key={a.id}
                  onClick={() => navigate(a.path)}
                  className="w-full group flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card/50 hover:bg-accent hover:border-border transition-all text-left"
                >
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center ring-1 shrink-0 ${SEV_TONE[a.severity]}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{a.title}</p>
                    {a.detail && <p className="text-xs text-muted-foreground truncate">{a.detail}</p>}
                  </div>
                  {typeof a.count === "number" && (
                    <Badge variant="outline" className="rounded-full shrink-0">{a.count}</Badge>
                  )}
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
