import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell, StatusBadge, CheckDot } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { callN8n } from "@/lib/n8n";
import { toast } from "sonner";
import { Loader2, FileText, Upload } from "lucide-react";

export const Route = createFileRoute("/maker")({ component: () => <AppShell requiredRole="MAKER"><MakerDashboard /></AppShell> });

type Check = { field: string; description: string; status: "PASS" | "FAIL" | "WARNING" | "PENDING"; detail?: string };
type Analysis = { checks: Check[]; suggested_mt?: "MT734" | "MT752" | "MT754"; suggested_swift?: string } | null;

type Case = {
  id: string;
  lc_reference: string;
  lc_text: string | null;
  status: string;
  ai_analysis_raw: any;
  maker_notes: string | null;
  created_at: string;
};

function MakerDashboard() {
  const { user } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lcRef, setLcRef] = useState("");
  const [lcText, setLcText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis>(null);
  const [status, setStatus] = useState<string>("DRAFT");
  const [makerNotes, setMakerNotes] = useState("");

  const loadCases = async () => {
    const { data } = await supabase
      .from("scrutiny_cases")
      .select("*")
      .order("created_at", { ascending: false });
    setCases((data as any[]) ?? []);
  };

  useEffect(() => { loadCases(); }, []);

  const loadCase = (c: Case) => {
    setActiveId(c.id);
    setLcRef(c.lc_reference);
    setLcText(c.lc_text ?? "");
    setAnalysis((c.ai_analysis_raw as Analysis) ?? null);
    setStatus(c.status);
    setMakerNotes(c.maker_notes ?? "");
  };

  const resetForm = () => {
    setActiveId(null); setLcRef(""); setLcText(""); setFile(null);
    setAnalysis(null); setStatus("DRAFT"); setMakerNotes("");
  };

  const fileToBase64 = (f: File) => new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(f);
  });

  const runScrutiny = async () => {
    if (!user) return;
    if (!lcRef || !lcText) { toast.error("LC reference and MT700 text are required"); return; }
    setRunning(true);
    try {
      let caseId = activeId;
      if (!caseId) {
        const { data, error } = await supabase
          .from("scrutiny_cases")
          .insert({ lc_reference: lcRef, lc_text: lcText, maker_id: user.id, status: "DRAFT" })
          .select().single();
        if (error) throw error;
        caseId = data.id;
        setActiveId(caseId);
      } else {
        await supabase.from("scrutiny_cases").update({ lc_reference: lcRef, lc_text: lcText }).eq("id", caseId);
      }
      const documents_base64 = file ? await fileToBase64(file) : null;
      const result = await callN8n({ case_id: caseId, lc_reference: lcRef, lc_text: lcText, documents_base64 });
      await supabase.from("scrutiny_cases").update({ ai_analysis_raw: result }).eq("id", caseId);
      setAnalysis(result);
      // create swift draft
      if (result?.suggested_swift && result?.suggested_mt) {
        await supabase.from("swift_drafts").insert({
          case_id: caseId, lc_reference: lcRef, mt_type: result.suggested_mt,
          message_body: result.suggested_swift, generated_by: user.id,
        });
      }
      toast.success("AI scrutiny complete");
      loadCases();
    } catch (e: any) {
      toast.error(e.message ?? "Scrutiny failed");
    } finally {
      setRunning(false);
    }
  };

  const sendToChecker = async () => {
    if (!activeId) return;
    const { error } = await supabase
      .from("scrutiny_cases")
      .update({ status: "PENDING_CHECKER", maker_notes: makerNotes })
      .eq("id", activeId);
    if (error) { toast.error(error.message); return; }
    setStatus("PENDING_CHECKER");
    toast.success("Sent to Checker queue");
    loadCases();
  };

  const failCount = useMemo(() => analysis?.checks?.filter(c => c.status === "FAIL").length ?? 0, [analysis]);
  const locked = status !== "DRAFT";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Maker Dashboard</h2>
        <Button variant="outline" size="sm" onClick={resetForm}>+ New case</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Input panel */}
        <section className="bg-card border rounded-md p-5 space-y-4">
          <h3 className="font-medium text-sm">LC & Documents</h3>
          <div>
            <Label htmlFor="lcref">LC reference</Label>
            <Input id="lcref" value={lcRef} onChange={(e) => setLcRef(e.target.value)} disabled={locked} placeholder="LC2026/000123" />
          </div>
          <div>
            <Label htmlFor="lctext">LC terms — paste MT700 text</Label>
            <Textarea id="lctext" value={lcText} onChange={(e) => setLcText(e.target.value)} disabled={locked} rows={10} className="font-mono text-xs" />
          </div>
          <div>
            <Label>Import documents — Bill of Lading, Invoice, Packing List</Label>
            <label className={`mt-1 flex items-center justify-center gap-2 border border-dashed rounded-md py-6 text-sm text-muted-foreground cursor-pointer hover:bg-secondary/50 ${locked ? "pointer-events-none opacity-60" : ""}`}>
              <Upload className="h-4 w-4" />
              {file ? <span className="flex items-center gap-1 text-foreground"><FileText className="h-4 w-4" /> {file.name}</span> : <span>Click to upload PDF</span>}
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={locked} />
            </label>
          </div>
          <Button onClick={runScrutiny} disabled={running || locked} className="w-full">
            {running ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> AI is checking documents against LC terms (UCP 600 / ISBP 745)…</> : "Run AI scrutiny"}
          </Button>
        </section>

        {/* RIGHT: Checklist */}
        <section className="bg-card border rounded-md p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-sm">Scrutiny checklist</h3>
              <p className="text-xs text-muted-foreground">UCP 600 / ISBP 745 field checks</p>
            </div>
            <StatusBadge status={status} />
          </div>

          {!analysis ? (
            <div className="text-sm text-muted-foreground border border-dashed rounded-md py-10 text-center">
              Run AI scrutiny to populate the checklist.
            </div>
          ) : (
            <ul className="space-y-3">
              {analysis.checks.map((c, i) => (
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
          )}

          <div>
            <Label htmlFor="notes">Maker notes for checker</Label>
            <Textarea id="notes" rows={3} value={makerNotes} onChange={(e) => setMakerNotes(e.target.value)} disabled={locked} />
          </div>

          <Button variant="outline" className="w-full border-blue-600 text-blue-700 hover:bg-blue-50" onClick={sendToChecker} disabled={!analysis || locked || !activeId}>
            Send to checker queue
          </Button>
        </section>
      </div>

      {/* My cases */}
      <section className="bg-card border rounded-md">
        <div className="px-5 py-4 border-b">
          <h3 className="font-medium text-sm">My cases</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-5 py-2">LC Reference</th>
              <th className="text-left font-medium px-5 py-2">Date</th>
              <th className="text-left font-medium px-5 py-2">Status</th>
              <th className="text-left font-medium px-5 py-2">Discrepancies</th>
            </tr>
          </thead>
          <tbody>
            {cases.length === 0 && (
              <tr><td colSpan={4} className="px-5 py-6 text-center text-muted-foreground">No cases yet.</td></tr>
            )}
            {cases.map((c) => {
              const fails = (c.ai_analysis_raw?.checks ?? []).filter((x: Check) => x.status === "FAIL").length;
              return (
                <tr key={c.id} className="border-t hover:bg-secondary/40 cursor-pointer" onClick={() => loadCase(c)}>
                  <td className="px-5 py-3 font-medium">{c.lc_reference}</td>
                  <td className="px-5 py-3 text-muted-foreground">{new Date(c.created_at).toLocaleString()}</td>
                  <td className="px-5 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-5 py-3">{fails > 0 ? <span className="text-destructive font-medium">{fails}</span> : <span className="text-emerald-700">Compliant</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      {/* Counterpart marker used in failCount memo */}
      <input type="hidden" value={failCount} />
    </div>
  );
}