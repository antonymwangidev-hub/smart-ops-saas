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
import { Loader2, Moon, Sun, Monitor, Sparkles, Phone, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/components/ThemeProvider";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useQuery } from "@tanstack/react-query";

export default function AppSettings() {
  const { currentOrg, refreshOrgs } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [orgName, setOrgName] = useState(currentOrg?.name || "");
  const [saving, setSaving] = useState(false);
  const { aiEnabled, autoEscalate, loading: prefsLoading, updatePreference } = useUserPreferences();

  // M-Pesa config (per-org)
  const { data: orgRow, refetch: refetchOrg } = useQuery({
    queryKey: ["org_full", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg) return null;
      const { data } = await supabase.from("organizations").select("*").eq("id", currentOrg.id).maybeSingle();
      return data as any;
    },
    enabled: !!currentOrg,
  });
  const [mpesaShortcode, setMpesaShortcode] = useState("");
  const [mpesaType, setMpesaType] = useState<"paybill" | "till">("paybill");
  const [mpesaAccountRef, setMpesaAccountRef] = useState("");
  const [savingMpesa, setSavingMpesa] = useState(false);
  useEffect(() => {
    if (!orgRow) return;
    setMpesaShortcode(orgRow.mpesa_shortcode || "");
    setMpesaType((orgRow.mpesa_shortcode_type as any) || "paybill");
    setMpesaAccountRef(orgRow.mpesa_account_reference || "");
  }, [orgRow]);

  const handleSaveMpesa = async () => {
    if (!currentOrg) return;
    setSavingMpesa(true);
    const { error } = await supabase.from("organizations").update({
      mpesa_shortcode: mpesaShortcode.trim() || null,
      mpesa_shortcode_type: mpesaType,
      mpesa_account_reference: mpesaAccountRef.trim() || null,
    } as any).eq("id", currentOrg.id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "M-Pesa settings saved" }); await refetchOrg(); }
    setSavingMpesa(false);
  };

  const currentPhone = user?.phone || (user?.user_metadata as any)?.phone || "";
  const [newPhone, setNewPhone] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneSubmitting, setPhoneSubmitting] = useState(false);

  const normalizePhone = (raw: string) => {
    const trimmed = raw.trim().replace(/\s+/g, "");
    if (trimmed.startsWith("+")) return trimmed;
    if (trimmed.startsWith("0")) return "+254" + trimmed.slice(1);
    if (trimmed.startsWith("254")) return "+" + trimmed;
    return "+" + trimmed;
  };

  const handleRequestPhoneOtp = async () => {
    if (!newPhone) {
      toast({ title: "Enter a phone number", variant: "destructive" });
      return;
    }
    setPhoneSubmitting(true);
    const { error } = await supabase.auth.updateUser({ phone: normalizePhone(newPhone) });
    if (error) {
      toast({ title: "Failed to send code", description: error.message, variant: "destructive" });
    } else {
      setPhoneOtpSent(true);
      toast({ title: "Code sent", description: "Check your SMS for the verification code." });
    }
    setPhoneSubmitting(false);
  };

  const handleVerifyPhoneChange = async () => {
    setPhoneSubmitting(true);
    const { error } = await supabase.auth.verifyOtp({
      phone: normalizePhone(newPhone),
      token: phoneOtp,
      type: "phone_change",
    });
    if (error) {
      toast({ title: "Verification failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Phone updated", description: "Your linked phone number has been changed." });
      setPhoneOtpSent(false);
      setPhoneOtp("");
      setNewPhone("");
    }
    setPhoneSubmitting(false);
  };

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
              <Switch
                checked={aiEnabled}
                onCheckedChange={(v) => updatePreference({ ai_recommendations: v })}
                disabled={prefsLoading}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Auto-escalate Overdue Tasks</Label>
                <p className="text-xs text-muted-foreground">Notify managers when tasks pass their due date</p>
              </div>
              <Switch
                checked={autoEscalate}
                onCheckedChange={(v) => updatePreference({ auto_escalate: v })}
                disabled={prefsLoading}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              Profile — Phone Number
            </CardTitle>
            <CardDescription>View your linked phone number and request an OTP to change it</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Linked phone number</Label>
              <Input
                value={currentPhone || "No phone linked"}
                disabled
                className="rounded-xl"
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <Label>{currentPhone ? "Change to new number" : "Add a phone number"}</Label>
              <Input
                type="tel"
                placeholder="0712345678"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                disabled={phoneOtpSent}
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">Kenyan numbers auto-prefixed with +254.</p>
            </div>

            {!phoneOtpSent ? (
              <Button
                onClick={handleRequestPhoneOtp}
                disabled={phoneSubmitting || !newPhone}
                className="rounded-xl"
              >
                {phoneSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Send verification code
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Verification code</Label>
                  <Input
                    inputMode="numeric"
                    value={phoneOtp}
                    onChange={(e) => setPhoneOtp(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleVerifyPhoneChange}
                    disabled={phoneSubmitting || !phoneOtp}
                    className="rounded-xl"
                  >
                    {phoneSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Verify & save
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleRequestPhoneOtp}
                    disabled={phoneSubmitting}
                    className="rounded-xl"
                  >
                    Resend code
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => { setPhoneOtpSent(false); setPhoneOtp(""); }}
                    className="rounded-xl"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
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
