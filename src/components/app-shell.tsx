import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useEffect, type ReactNode } from "react";

export function AppShell({
  children,
  requiredRole,
}: {
  children: ReactNode;
  requiredRole: "MAKER" | "CHECKER";
}) {
  const { user, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/auth" });
    else if (profile && profile.role !== requiredRole) {
      navigate({ to: profile.role === "CHECKER" ? "/checker" : "/maker" });
    }
  }, [loading, user, profile, requiredRole, navigate]);

  if (loading || !profile) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (profile.role !== requiredRole) return null;

  const isMaker = profile.role === "MAKER";
  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="bg-card border-b">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 h-14">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded bg-primary text-primary-foreground grid place-items-center font-semibold text-xs">LC</div>
            <div>
              <h1 className="text-sm font-semibold leading-tight">LC Scrutiny Copilot</h1>
              <p className="text-[10px] text-muted-foreground leading-tight">UCP 600 / ISBP 745</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-foreground">{profile.full_name || profile.email}</span>
            <span
              className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                isMaker
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-rose-100 text-rose-800"
              }`}
            >
              {isMaker ? "Maker" : "Checker"}
            </span>
            <Button variant="outline" size="sm" onClick={async () => { await signOut(); navigate({ to: "/auth" }); }}>
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-6">{children}</main>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: "bg-slate-100 text-slate-700",
    PENDING_CHECKER: "bg-blue-100 text-blue-800",
    AUTHORIZED: "bg-emerald-100 text-emerald-800",
    REJECTED: "bg-rose-100 text-rose-800",
  };
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${map[status] ?? "bg-slate-100 text-slate-700"}`}>{status.replace("_", " ")}</span>;
}

export function CheckDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    PASS: "bg-emerald-500",
    FAIL: "bg-rose-600",
    WARNING: "bg-amber-500",
    PENDING: "bg-slate-300",
  };
  return <span className={`inline-block h-2.5 w-2.5 rounded-full mt-1.5 shrink-0 ${map[status] ?? "bg-slate-300"}`} />;
}