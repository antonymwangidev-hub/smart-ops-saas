import { useState, useEffect } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Moon, Sun, Monitor, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/components/ThemeProvider";

export default function AppSettings() {
  const { currentOrg, refreshOrgs } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [orgName, setOrgName] = useState(currentOrg?.name || "");
  const [saving, setSaving] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(() => localStorage.getItem("ai_recommendations") !== "false");
  const [autoEscalate, setAutoEscalate] = useState(() => localStorage.getItem("auto_escalate") !== "false");

  const toggleAI = (v: boolean) => { setAiEnabled(v); localStorage.setItem("ai_recommendations", String(v)); };
  const toggleEscalate = (v: boolean) => { setAutoEscalate(v); localStorage.setItem("auto_escalate", String(v)); };

  const handleSave = async () => {
    if (!currentOrg) return;
    setSaving(true);
    const { error } = await supabase.from("organizations").update({ name: orgName }).eq("id", currentOrg.id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Saved" }); await refreshOrgs(); }
    setSaving(false);
  };

  const themeOptions = [
    { value: "light" as const, label: "Light", icon: Sun },
    { value: "dark" as const, label: "Dark", icon: Moon },
    { value: "system" as const, label: "System", icon: Monitor },
  ];

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground">Manage your organization</p>
        </div>

        <Card className="glass">
          <CardHeader>
            <CardTitle>Organization</CardTitle>
            <CardDescription>Update your organization details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Organization Name</Label>
              <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} className="rounded-xl" />
            </div>
            <div className="flex items-center gap-2">
              <Label>Your Role</Label>
              <Badge variant="outline" className="rounded-lg">{currentOrg?.role}</Badge>
            </div>
            <Button onClick={handleSave} disabled={saving} className="rounded-xl">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Choose your preferred theme</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              {themeOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all duration-200 ${
                    theme === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30 hover:bg-accent"
                  }`}
                >
                  <opt.icon className="h-4 w-4" />
                  {opt.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Features
            </CardTitle>
            <CardDescription>Configure AI-powered task automation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>AI Task Recommendations</Label>
                <p className="text-xs text-muted-foreground">Suggest priority, assignee, and effort when creating tasks</p>
              </div>
              <Switch checked={aiEnabled} onCheckedChange={toggleAI} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Auto-escalate Overdue Tasks</Label>
                <p className="text-xs text-muted-foreground">Notify managers when tasks pass their due date</p>
              </div>
              <Switch checked={autoEscalate} onCheckedChange={toggleEscalate} />
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Your account information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email || ""} disabled className="rounded-xl" />
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
