import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Onboarding() {
  const { user, loading } = useAuth();
  const { currentOrg, refreshOrgs } = useOrg();
  const { toast } = useToast();
  const [orgName, setOrgName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (currentOrg) return <Navigate to="/dashboard" replace />;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;
    setSubmitting(true);

    const { data, error } = await supabase.rpc("create_organization_with_admin", {
      org_name: orgName.trim(),
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      await refreshOrgs();
    }
    setSubmitting(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-2xl font-bold text-foreground">SmartOps</span>
        </div>
        <Card>
          <CardHeader className="text-center">
            <CardTitle>Create Your Organization</CardTitle>
            <CardDescription>Set up your business workspace to get started</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">Organization Name</Label>
                <Input id="org-name" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Acme Inc." required />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Organization
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
