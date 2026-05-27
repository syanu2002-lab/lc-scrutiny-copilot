import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, StatusBadge, CheckDot } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChevronRight, ArrowLeft, Copy } from "lucide-react";
import { callCheckerWebhook } from "@/lib/n8n";

export const Route = createFileRoute("/checker")({ component: () => <AppShell requiredRole="CHECKER"><CheckerDashboard /></AppShell> });

type Check = { field: string; description: string; status: string; detail?: string };
type Case = {
  id: string; lc_reference: string; status: string; ai_analysis_raw: any;
  maker_id: string; maker_notes: string | null; created_at: string;
  maker?: { full_name: string | null; email: string | null };
};
type Swift = { id: string; mt_type: string; message_body: string };

function CheckerDashboard() {
  const { user } = useAuth();
  const [pending, setPending] = useState<Case[]>([]);
  const [completed, setCompleted] = useState<Case[]>([]);
  const [open, setOpen] = useState<Case | null>(null);
  const [swift, setSwift] = useState<Swift | null>(null);
  const [acting, setActing] = useState(false);

  const load = async () => {
    const { data: p } = await supabase
      .from("scrutiny_cases")
      .select("*, maker:profiles!scrutiny_cases_maker_id_fkey(full_name,email)")
      .eq("status", "PENDING_CHECKER")
      .order("created_at", { ascending: false });
    setPending((p as any[]) ?? []);
    const { data: c } = await supabase
      .from("scrutiny_cases")
      .select("*, maker:profiles!scrutiny_cases_maker_id_fkey(full_name,email)")
      .in("status", ["AUTHORIZED", "REJECTED"])
      .order("updated_at", { ascending: false });
    setCompleted((c as any[]) ?? []);
  };

  useEffect(() => { load(); }, []);

  const openCase = async (c: Case) => {
    setOpen(c);
    const { data } = await supabase.from("swift_drafts").select("*").eq("case_id", c.id).order("generated_at", { ascending: false }).limit(1).maybeSingle();
    setSwift((data as Swift) ?? null);
  };

  const act = async (action: "AUTHORIZE" | "REJECT") => {
    if (!open || !user) return;
    if (open.maker_id === user.id) { toast.error("A maker cannot approve their own case."); return; }
    setActing(true);
    try {
      const checks: Check[] = open.ai_analysis_raw?.checks ?? [];
      const fallbackMtType = checks.some((c) => c.status === "FAIL") ? "MT734" : "MT754";
      const mtType = swift?.mt_type ?? open.ai_analysis_raw?.suggested_mt ?? fallbackMtType;

      if (action === "AUTHORIZE") {
        await callCheckerWebhook({
          action,
          case_id: open.id,
          lc_reference: open.lc_reference,
          mt_type: mtType,
        });
      }

      const { error } = await supabase
        .from("scrutiny_cases")
        .update({ status: action === "AUTHORIZE" ? "AUTHORIZED" : "REJECTED", checker_id: user.id })
        .eq("id", open.id);
      if (error) throw error;
      toast.success(action === "AUTHORIZE" ? "Case authorised" : "Case rejected");
      setOpen(null); setSwift(null); load();
    } catch (e: any) {
      toast.error(e.message ?? "Action failed");
    } finally {
      setActing(false);
    }
  };

  if (open) {
    const checks: Check[] = open.ai_analysis_raw?.checks ?? [];
    const cantReview = open.maker_id === user?.id;
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => { setOpen(null); setSwift(null); }}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to queue
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{open.lc_reference}</h2>
            <p className="text-xs text-muted-foreground">Submitted by {open.maker?.full_name || open.maker?.email} · {new Date(open.created_at).toLocaleString()}</p>
          </div>
          <StatusBadge status={open.status} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-card border rounded-md p-5 space-y-4">
            <h3 className="font-medium text-sm">Scrutiny result (read-only)</h3>
            <ul className="space-y-3">
              {checks.map((c, i) => (
                <li key={i} className="flex gap-3 border-b last:border-b-0 pb-3 last:pb-0">
                  <CheckDot status={c.status} />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{c.field}</div>
                    <div className="text-xs text-muted-foreground">{c.description}</div>
                    {c.status === "FAIL" && c.detail && <div className="text-xs text-destructive mt-1">{c.detail}</div>}
                    {c.status === "WARNING" && c.detail && <div className="text-xs text-amber-700 mt-1">{c.detail}</div>}
                  </div>
                </li>
              ))}
            </ul>
            {open.maker_notes && (
              <div className="bg-secondary/60 border rounded-md p-3 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Maker notes</div>
                {open.maker_notes}
              </div>
            )}
          </section>

          <section className="bg-card border rounded-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-sm">SWIFT draft</h3>
                <p className="text-xs text-muted-foreground">{swift?.mt_type ?? "—"}</p>
              </div>
              {swift && (
                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(swift.message_body); toast.success("Copied to clipboard"); }}>
                  <Copy className="h-4 w-4 mr-1" /> Copy
                </Button>
              )}
            </div>
            <pre className="bg-slate-950 text-slate-100 text-xs font-mono p-4 rounded-md whitespace-pre-wrap overflow-x-auto min-h-[200px]">
              {swift?.message_body ?? "No SWIFT draft generated."}
            </pre>
            {cantReview && (
              <p className="text-xs text-destructive">You are the Maker of this case and cannot authorise it (dual-control).</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Button onClick={() => act("AUTHORIZE")} disabled={acting || cantReview} className="bg-emerald-600 hover:bg-emerald-700 text-white">Authorise</Button>
              <Button onClick={() => act("REJECT")} disabled={acting || cantReview} variant="destructive">Reject</Button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Checker Queue</h2>

      <section className="bg-card border rounded-md">
        <div className="px-5 py-4 border-b">
          <h3 className="font-medium text-sm">Pending review</h3>
        </div>
        <ul className="divide-y">
          {pending.length === 0 && <li className="px-5 py-6 text-sm text-muted-foreground text-center">Queue is empty.</li>}
          {pending.map((c) => {
            const fails = (c.ai_analysis_raw?.checks ?? []).filter((x: Check) => x.status === "FAIL").length;
            return (
              <li key={c.id} className="px-5 py-4 flex items-center gap-4 hover:bg-secondary/40 cursor-pointer" onClick={() => openCase(c)}>
                <div className="flex-1">
                  <div className="font-medium text-sm">{c.lc_reference}</div>
                  <div className="text-xs text-muted-foreground">{c.maker?.full_name || c.maker?.email} · {new Date(c.created_at).toLocaleString()}</div>
                </div>
                <StatusBadge status={c.status} />
                {fails > 0
                  ? <span className="text-destructive text-sm font-medium">{fails} discrepancies</span>
                  : <span className="text-emerald-700 text-sm font-medium">Compliant</span>}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </li>
            );
          })}
        </ul>
      </section>

      <section className="bg-card border rounded-md">
        <div className="px-5 py-4 border-b">
          <h3 className="font-medium text-sm">Completed cases</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-5 py-2">LC Reference</th>
              <th className="text-left font-medium px-5 py-2">Maker</th>
              <th className="text-left font-medium px-5 py-2">Status</th>
              <th className="text-left font-medium px-5 py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {completed.length === 0 && <tr><td colSpan={4} className="px-5 py-6 text-center text-muted-foreground">No completed cases.</td></tr>}
            {completed.map((c) => (
              <tr key={c.id} className="border-t hover:bg-secondary/40 cursor-pointer" onClick={() => openCase(c)}>
                <td className="px-5 py-3 font-medium">{c.lc_reference}</td>
                <td className="px-5 py-3">{c.maker?.full_name || c.maker?.email}</td>
                <td className="px-5 py-3"><StatusBadge status={c.status} /></td>
                <td className="px-5 py-3 text-muted-foreground">{new Date(c.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
