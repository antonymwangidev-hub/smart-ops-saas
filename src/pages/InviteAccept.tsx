import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Zap, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface Invitation {
  id: string;
  organization_id: string;
  organization_name: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  expires_at: string;
}

export default function InviteAccept() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    async function load() {
      if (!token) {
        setError("Missing invitation token");
        setLoading(false);
        return;
      }
      const { data, error: rpcError } = await supabase.rpc("get_invitation_by_token", { _token: token });
      if (rpcError || !data || (Array.isArray(data) && data.length === 0)) {
        setError("Invitation link expired or invalid. Contact your administrator.");
        setLoading(false);
        return;
      }
      const inv = Array.isArray(data) ? data[0] : data;
      if (inv.status !== "pending") {
        setError(`This invitation is ${inv.status}. Contact your administrator.`);
      } else if (new Date(inv.expires_at) < new Date()) {
        setError("Invitation link expired. Contact your administrator.");
      } else {
        setInvitation(inv as Invitation);
        setFullName((inv as Invitation).full_name || "");
      }
      setLoading(false);
    }
    load();
  }, [token]);

  const acceptForCurrentUser = async () => {
    const { data, error } = await supabase.rpc("accept_invitation", { _token: token });
    if (error) throw error;
    if (data && (data as any).success === false) {
      throw new Error((data as any).error || "Could not accept invitation");
    }
    return data;
  };

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitation) return;
    setSubmitting(true);
    try {
      if (user) {
        if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
          throw new Error(`You are signed in as ${user.email}. Please sign out and accept this invite as ${invitation.email}.`);
        }
        await acceptForCurrentUser();
        setAccepted(true);
        toast.success("Welcome aboard!");
        setTimeout(() => navigate("/pos"), 1200);
        return;
      }

      if (password.length < 6) throw new Error("Password must be at least 6 characters");
      if (password !== confirmPassword) throw new Error("Passwords do not match");

      const { data: signUp, error: signErr } = await supabase.auth.signUp({
        email: invitation.email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/invite/${token}`,
        },
      });
      if (signErr) {
        // If user already exists, try sign-in
        const { error: loginErr } = await supabase.auth.signInWithPassword({
          email: invitation.email,
          password,
        });
        if (loginErr) throw new Error(signErr.message);
      }

      // Wait briefly for session, then accept
      await new Promise((r) => setTimeout(r, 400));
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.success("Account created. Please check your email to confirm, then revisit this link to finish.");
        setSubmitting(false);
        return;
      }
      await acceptForCurrentUser();
      setAccepted(true);
      toast.success("Welcome aboard!");
      setTimeout(() => navigate("/pos"), 1200);
    } catch (err: any) {
      toast.error(err.message || "Could not accept invitation");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <h1 className="sr-only">Accept your SmartOps invitation</h1>
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-2xl font-bold text-foreground">SmartOps</span>
        </div>

        <Card>
          {loading ? (
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </CardContent>
          ) : error ? (
            <>
              <CardHeader className="text-center">
                <div className="mx-auto h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <CardTitle>Invitation unavailable</CardTitle>
                <CardDescription>{error}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link to="/auth">
                  <Button variant="outline" className="w-full">Go to login</Button>
                </Link>
              </CardContent>
            </>
          ) : accepted ? (
            <CardHeader className="text-center py-12">
              <div className="mx-auto h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-2">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              </div>
              <CardTitle>You're in!</CardTitle>
              <CardDescription>Redirecting to your workspace…</CardDescription>
            </CardHeader>
          ) : invitation ? (
            <>
              <CardHeader className="text-center">
                <CardTitle>Join {invitation.organization_name}</CardTitle>
                <CardDescription>
                  You've been invited as <span className="font-medium text-foreground capitalize">{invitation.role}</span>.
                  {user ? " Accept to add this workspace to your account." : " Create your password to activate your account."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAccept} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input value={invitation.email} disabled />
                  </div>
                  {!user && (
                    <>
                      <div className="space-y-2">
                        <Label>Full name</Label>
                        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Create password</Label>
                        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                      </div>
                      <div className="space-y-2">
                        <Label>Confirm password</Label>
                        <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} />
                      </div>
                    </>
                  )}
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {user ? "Accept invitation" : "Activate account"}
                  </Button>
                </form>
              </CardContent>
            </>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
