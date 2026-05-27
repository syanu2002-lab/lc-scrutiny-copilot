import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({ component: AuthPage });

function AuthPage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"MAKER" | "CHECKER">("MAKER");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (user && profile) {
      navigate({ to: profile.role === "CHECKER" ? "/checker" : "/maker" });
    }
  }, [user, profile, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName, role },
          },
        });
        if (error) throw error;
        toast.success("Account created. You can sign in now.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-secondary/30 px-4">
      <div className="w-full max-w-md bg-card border rounded-md p-8">
        <h1 className="text-2xl font-semibold tracking-tight">LC Scrutiny Copilot</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Trade Finance Document Scrutiny · UCP 600 / ISBP 745
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          {mode === "signup" && (
            <>
              <div>
                <Label htmlFor="name">Full name</Label>
                <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div>
                <Label>Role</Label>
                <div className="flex gap-2 mt-1">
                  {(["MAKER", "CHECKER"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`flex-1 border rounded-md px-3 py-2 text-sm ${
                        role === r ? "bg-primary text-primary-foreground border-primary" : "bg-background"
                      }`}
                    >
                      {r === "MAKER" ? "Maker" : "Checker"}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          {mode === "signin" ? "No account yet?" : "Already registered?"}{" "}
          <button
            className="text-primary underline-offset-2 hover:underline"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "Create one" : "Sign in"}
          </button>
        </p>
      </div>
    </main>
  );
}