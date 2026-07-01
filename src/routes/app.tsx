import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/draflio/Header";
import { UploadZone } from "@/components/draflio/UploadZone";
import { AICommandBar } from "@/components/draflio/AICommandBar";
import { useEffect, useState, useTransition } from "react";
import { useServerFn } from "@tanstack/react-start";
import { analyzeDocument } from "@/lib/ai.functions";
import { DRAFLIO_TOOLS, TOOL_BY_ID } from "@/lib/draflio-tools";
import { toast } from "sonner";
import {
  Activity, CheckCircle2, FileText, Languages, Loader2, ScanText,
  Table, Signature, Image as ImageIcon, Timer, Gauge, Sparkles, Plus,
} from "lucide-react";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Workspace · Draflio" },
      { name: "description", content: "Your premium AI document workspace." },
    ],
  }),
  component: Workspace,
});

type FileMeta = { name: string; size: number; type: string };
type Health = Awaited<ReturnType<typeof analyzeDocument>>;

function Workspace() {
  const analyze = useServerFn(analyzeDocument);
  const [file, setFile] = useState<FileMeta | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("draflio_pending_file");
      if (raw) {
        const meta = JSON.parse(raw) as FileMeta;
        sessionStorage.removeItem("draflio_pending_file");
        setFile(meta);
      }
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    if (!file) return;
    setHealth(null);
    startTransition(async () => {
      try {
        const res = await analyze({ data: { fileName: file.name, fileSize: file.size, mimeType: file.type } });
        setHealth(res);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Analysis failed");
      }
    });
  }, [file, analyze]);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-2">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary-glow">
            <Sparkles className="h-3.5 w-3.5" /> AI Workspace
          </span>
          <h1 className="text-3xl font-bold gradient-text sm:text-4xl">
            {file ? file.name : "Welcome to your Draflio workspace"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {file ? "Draflio analyzed your document. Ask the AI, or pick a tool below."
                  : "Drop a document to get instant AI analysis, or ask the command bar what you'd like to do."}
          </p>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {!file && <UploadZone variant="workspace" onFile={(f) => setFile({ name: f.name, size: f.size, type: f.type })} />}

            {file && (
              <HealthCard file={file} health={health} pending={pending} onReset={() => { setFile(null); setHealth(null); }} />
            )}

            <div className="glass-strong rounded-2xl p-5">
              <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <Activity className="h-3.5 w-3.5" /> AI Command Bar
              </div>
              <AICommandBar compact />
            </div>
          </div>

          <aside className="space-y-4">
            <div className="glass-strong rounded-2xl p-5">
              <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Recommended tools
              </div>
              <div className="space-y-2">
                {(health?.recommendedTools ?? DRAFLIO_TOOLS.filter(t => t.featured).map(t => t.id))
                  .slice(0, 5)
                  .map((id) => {
                    const t = TOOL_BY_ID[id];
                    if (!t) return null;
                    return (
                      <Link
                        key={id}
                        to="/tools/$toolId"
                        params={{ toolId: id }}
                        className="group flex items-center gap-3 rounded-xl border border-glass-border bg-card/40 p-3 transition hover:border-primary/40 hover:shadow-glow"
                      >
                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${t.gradient}`}>
                          <t.icon className="h-4 w-4 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-semibold">{t.name}</div>
                          <div className="text-xs text-muted-foreground line-clamp-1">{t.description}</div>
                        </div>
                        <Plus className="h-4 w-4 text-muted-foreground transition group-hover:text-primary-glow" />
                      </Link>
                    );
                  })}
              </div>
            </div>

            <div className="glass rounded-2xl p-5">
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Innovation Vault</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Handwriting recognition, table extraction, signature & stamp detection, multi-language OCR — the next wave lands here.
              </p>
              <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-accent-glow">
                Approved · Coming soon
              </span>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function HealthCard({ file, health, pending, onReset }: {
  file: FileMeta; health: Health | null; pending: boolean; onReset: () => void;
}) {
  const mb = (file.size / (1024 * 1024)).toFixed(2);
  const inLimit = file.size <= 100 * 1024 * 1024;
  const inMid = file.size > 100 * 1024 * 1024 && file.size <= 500 * 1024 * 1024;

  return (
    <div className="relative overflow-hidden rounded-2xl glass-strong p-6 shadow-glow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-brand shadow-glow">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Document Health Check</div>
            <div className="text-lg font-semibold">{file.name}</div>
          </div>
        </div>
        <button
          onClick={onReset}
          className="rounded-lg border border-glass-border bg-card/50 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          Change file
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Size" value={`${mb} MB`} status={inLimit ? "ok" : inMid ? "warn" : "bad"} />
        <Stat label="Type" value={file.type || "unknown"} />
        <Stat label="Plan" value={inLimit ? "Free ready" : "Pro required"} status={inLimit ? "ok" : "warn"} />
      </div>

      <div className="mt-6 rounded-xl border border-glass-border bg-secondary/40 p-4">
        {pending || !health ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary-glow" />
            Analyzing your document…
            <ProcessSteps />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Meta icon={Languages} label="Language" value={health.language} />
            <Meta icon={ScanText} label="Type" value={health.documentType === "digital" ? "Digital PDF" : health.documentType === "scanned" ? "Scanned" : health.documentType} />
            <Meta icon={FileText} label="Pages" value={String(health.estimatedPages)} />
            <Meta icon={Gauge} label="Est. accuracy" value={`${health.estimatedAccuracy}%`} />
            <Meta icon={Timer} label="Est. processing" value={`${health.estimatedProcessingSeconds}s`} />
            <Meta icon={ImageIcon} label="Images" value={health.hasImages ? "Yes" : "No"} />
            <Meta icon={Table} label="Tables" value={health.hasTables ? "Yes" : "No"} />
            <Meta icon={Signature} label="Signatures" value={health.hasSignatures ? "Detected" : "None"} />
            <div className="sm:col-span-2 flex items-start gap-2 rounded-lg bg-primary/10 p-3 text-sm text-foreground/90">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary-glow" />
              {health.summary}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, status }: { label: string; value: string; status?: "ok" | "warn" | "bad" }) {
  const color = status === "ok" ? "text-success" : status === "warn" ? "text-warning" : status === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-xl border border-glass-border bg-card/40 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${color}`}>{value}</div>
    </div>
  );
}
function Meta({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
        <Icon className="h-4 w-4 text-primary-glow" />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="text-sm font-semibold">{value}</div>
      </div>
    </div>
  );
}

const STEPS = ["Uploading", "Analyzing", "Detecting language", "Extracting text", "Recovering formatting", "Generating output"];
function ProcessSteps() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % STEPS.length), 900);
    return () => clearInterval(t);
  }, []);
  return <span className="text-xs text-primary-glow">{STEPS[i]}…</span>;
}
