import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft, ArrowRight, CheckCircle2, Download, FileText, Loader2,
  Settings2, Sparkles, X, type LucideIcon,
} from "lucide-react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { UploadZone } from "./UploadZone";
import type { DraflioTool } from "@/lib/draflio-tools";
import { DRAFLIO_TOOLS } from "@/lib/draflio-tools";

export type ToolStatus = "idle" | "ready" | "processing" | "done" | "error";

export type ToolFileMeta = { name: string; size: number; type: string };

export type ToolLayoutProps = {
  tool: DraflioTool;
  /** Selected file (controlled). If omitted, ToolLayout manages its own state. */
  file?: ToolFileMeta | null;
  onFileChange?: (file: ToolFileMeta | null) => void;
  status?: ToolStatus;
  /** 0–100 processing progress. */
  progress?: number;
  /** Right-column settings/options panel (rendered inside a glass card). */
  settings?: ReactNode;
  /** Center document preview slot. Falls back to a generic file card. */
  preview?: ReactNode;
  /** Result section rendered when status === "done". */
  result?: ReactNode;
  /** Optional CTA text for the primary action button. */
  actionLabel?: string;
  onAction?: () => void;
  /** Optional secondary content below settings (e.g. tips, related tools). */
  aside?: ReactNode;
};

const STEPS: { key: ToolStatus; label: string }[] = [
  { key: "ready", label: "Uploaded" },
  { key: "processing", label: "Processing" },
  { key: "done", label: "Ready to download" },
];

export function ToolLayout({
  tool,
  file: fileProp,
  onFileChange,
  status: statusProp,
  progress = 0,
  settings,
  preview,
  result,
  actionLabel,
  onAction,
  aside,
}: ToolLayoutProps) {
  const [innerFile, setInnerFile] = useState<ToolFileMeta | null>(null);
  const file = fileProp !== undefined ? fileProp : innerFile;
  const status: ToolStatus = statusProp ?? (file ? "ready" : "idle");

  const setFile = (f: ToolFileMeta | null) => {
    onFileChange?.(f);
    if (fileProp === undefined) setInnerFile(f);
  };

  const related = DRAFLIO_TOOLS.filter(
    (t) => t.category === tool.category && t.id !== tool.id,
  ).slice(0, 4);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <ToolHeader tool={tool} />

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {/* Main column */}
          <div className="space-y-6 lg:col-span-2 min-w-0">
            {!file && (
              <UploadZone
                variant="workspace"
                onFile={(f) =>
                  setFile({ name: f.name, size: f.size, type: f.type })
                }
              />
            )}

            {file && (
              <DocumentPreview
                file={file}
                onReset={() => setFile(null)}
                custom={preview}
              />
            )}

            {file && (
              <StatusStrip
                status={status}
                progress={progress}
                actionLabel={actionLabel ?? `Run ${tool.name}`}
                onAction={onAction}
                tool={tool}
              />
            )}

            {status === "done" && (
              <ResultCard tool={tool} custom={result} />
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-4 min-w-0">
            <div className="glass-strong rounded-2xl p-5">
              <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <Settings2 className="h-3.5 w-3.5" /> Options
              </div>
              {settings ?? <DefaultSettings />}
            </div>

            {aside}

            {related.length > 0 && (
              <div className="glass rounded-2xl p-5">
                <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Also in {tool.category}
                </div>
                <div className="mt-3 space-y-2">
                  {related.map((t) => (
                    <Link
                      key={t.id}
                      to="/tools/$toolId"
                      params={{ toolId: t.id }}
                      className="flex items-center gap-3 rounded-xl border border-glass-border bg-card/40 p-3 transition hover:border-primary/40"
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${t.gradient}`}
                      >
                        <t.icon className="h-4 w-4 text-white" />
                      </div>
                      <div className="min-w-0 flex-1 text-sm font-semibold truncate">
                        {t.name}
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}

/* ─────────────── Sub-components ─────────────── */

function ToolHeader({ tool }: { tool: DraflioTool }) {
  return (
    <div>
      <Link
        to="/tools"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All tools
      </Link>

      <div className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4 sm:gap-5">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${tool.gradient} shadow-glow sm:h-16 sm:w-16`}
        >
          <tool.icon className="h-7 w-7 text-white sm:h-8 sm:w-8" />
        </div>
        <div className="min-w-0">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            {tool.category}
          </span>
          <h1 className="truncate text-3xl font-bold gradient-text sm:text-4xl">
            {tool.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {tool.description}
          </p>
        </div>
      </div>
    </div>
  );
}

function DocumentPreview({
  file,
  onReset,
  custom,
}: {
  file: ToolFileMeta;
  onReset: () => void;
  custom?: ReactNode;
}) {
  const mb = (file.size / (1024 * 1024)).toFixed(2);
  return (
    <div className="glass-strong rounded-2xl p-5 sm:p-6 shadow-glow">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl gradient-brand shadow-glow">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Document
            </div>
            <div className="truncate text-sm font-semibold sm:text-base">
              {file.name}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {mb} MB · {file.type || "unknown"}
            </div>
          </div>
        </div>
        <button
          onClick={onReset}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-glass-border bg-card/50 px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" /> Change
        </button>
      </div>

      <div className="mt-5">
        {custom ?? (
          <div className="relative flex h-48 items-center justify-center overflow-hidden rounded-xl border border-glass-border bg-secondary/40 sm:h-64">
            <div className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(circle_at_top,theme(colors.primary/0.35),transparent_60%)]" />
            <div className="relative flex flex-col items-center gap-2 text-muted-foreground">
              <FileText className="h-10 w-10" />
              <span className="text-xs">Document preview</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusStrip({
  status,
  progress,
  actionLabel,
  onAction,
  tool,
}: {
  status: ToolStatus;
  progress: number;
  actionLabel: string;
  onAction?: () => void;
  tool: DraflioTool;
}) {
  const activeIdx = status === "done" ? 2 : status === "processing" ? 1 : 0;

  return (
    <div className="glass-strong rounded-2xl p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Status
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-sm">
            {status === "processing" ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary-glow" />
            ) : status === "done" ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : (
              <Sparkles className="h-4 w-4 text-primary-glow" />
            )}
            <span className="truncate font-medium">
              {status === "processing"
                ? "Processing your document…"
                : status === "done"
                  ? "Done — ready to download"
                  : status === "error"
                    ? "Something went wrong"
                    : `Ready to run ${tool.name}`}
            </span>
          </div>
        </div>

        {status !== "done" && (
          <button
            type="button"
            onClick={onAction}
            disabled={status === "processing"}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl gradient-brand px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "processing" ? "Working…" : actionLabel}
            {status !== "processing" && <ArrowRight className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-secondary/60">
        <div
          className="h-full rounded-full gradient-brand transition-all duration-500"
          style={{
            width: `${
              status === "done" ? 100 : status === "processing" ? Math.max(8, Math.min(progress, 95)) : 0
            }%`,
          }}
        />
      </div>

      {/* Steps */}
      <ol className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
        {STEPS.map((s, i) => {
          const state = i < activeIdx ? "done" : i === activeIdx ? "active" : "pending";
          return (
            <li
              key={s.key}
              className={[
                "flex items-center gap-1.5 rounded-lg border px-2 py-1.5",
                state === "done"
                  ? "border-success/30 bg-success/10 text-success"
                  : state === "active"
                    ? "border-primary/40 bg-primary/10 text-primary-glow"
                    : "border-glass-border bg-card/30 text-muted-foreground",
              ].join(" ")}
            >
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-background/40 text-[10px] font-semibold">
                {i + 1}
              </span>
              <span className="truncate">{s.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ResultCard({ tool, custom }: { tool: DraflioTool; custom?: ReactNode }) {
  return (
    <div className="glass-strong rounded-2xl p-6 shadow-glow">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success/15">
          <CheckCircle2 className="h-5 w-5 text-success" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Result
          </div>
          <div className="truncate text-sm font-semibold sm:text-base">
            {tool.name} complete
          </div>
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl gradient-brand px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow transition hover:opacity-90"
        >
          <Download className="h-4 w-4" /> Download
        </button>
      </div>
      {custom && <div className="mt-5">{custom}</div>}
    </div>
  );
}

function DefaultSettings() {
  return (
    <div className="space-y-3 text-sm">
      <SettingRow label="Output quality" value="High" />
      <SettingRow label="Preserve formatting" value="On" />
      <SettingRow label="Notify on completion" value="Off" />
      <p className="pt-2 text-xs text-muted-foreground">
        Tool-specific options appear here.
      </p>
    </div>
  );
}

function SettingRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-glass-border bg-card/30 px-3 py-2">
      <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 font-medium">{value}</span>
    </div>
  );
}
