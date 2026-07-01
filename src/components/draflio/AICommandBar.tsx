import { useState, useTransition } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Sparkles, ArrowRight, Loader2, Wand2, Command } from "lucide-react";
import { routeCommand } from "@/lib/ai.functions";
import { TOOL_BY_ID } from "@/lib/draflio-tools";
import { toast } from "sonner";

const EXAMPLES = [
  "Merge these PDFs",
  "Compress under 2 MB",
  "Convert PDF to Word",
  "Translate this contract",
  "Summarize this report",
  "Extract all tables",
  "Find payment terms",
  "Find invoice numbers",
  "Explain clause 8",
  "Find GST numbers",
  "Remove blank pages",
];

type Result = Awaited<ReturnType<typeof routeCommand>>;

export function AICommandBar({ compact = false }: { compact?: boolean }) {
  const call = useServerFn(routeCommand);
  const [prompt, setPrompt] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);

  const submit = (value?: string) => {
    const q = (value ?? prompt).trim();
    if (!q) return;
    setPrompt(q);
    startTransition(async () => {
      try {
        const res = await call({ data: { prompt: q } });
        setResult(res);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  };

  const primary = result ? TOOL_BY_ID[result.tool] : null;

  return (
    <div className={compact ? "" : "mx-auto w-full max-w-3xl"}>
      <div className="glass-strong overflow-hidden rounded-2xl shadow-glow">
        <div className="flex items-center gap-3 border-b border-glass-border px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-brand">
            <Wand2 className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 text-sm">
            <div className="font-semibold">Draflio AI Command Bar</div>
            <div className="text-xs text-muted-foreground">
              What would you like to do with your document?
            </div>
          </div>
          <kbd className="hidden items-center gap-1 rounded-md border border-glass-border bg-secondary/60 px-2 py-1 text-[10px] font-medium text-muted-foreground sm:inline-flex">
            <Command className="h-3 w-3" /> K
          </kbd>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          className="flex items-center gap-2 px-4 py-3"
        >
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Summarize this 40-page report and pull out all the dates"
            className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/70"
            autoFocus={!compact}
          />
          <button
            type="submit"
            disabled={pending || !prompt.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg gradient-brand px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Ask AI
          </button>
        </form>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.slice(0, compact ? 5 : 8).map((ex) => (
          <button
            key={ex}
            onClick={() => submit(ex)}
            className="rounded-full border border-glass-border bg-card/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
          >
            {ex}
          </button>
        ))}
      </div>

      {result && primary && (
        <div className="mt-6 animate-fade-up rounded-2xl glass-strong p-5 shadow-glow-accent">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl gradient-brand shadow-glow">
              <primary.icon className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-primary-glow">Recommended</span>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">{primary.category}</span>
              </div>
              <h3 className="mt-0.5 text-lg font-semibold">{primary.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{result.reply}</p>

              <ol className="mt-3 space-y-1 text-sm">
                {result.plan.map((step, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-semibold text-primary-glow">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link
                  to="/tools/$toolId"
                  params={{ toolId: primary.id }}
                  className="inline-flex items-center gap-1.5 rounded-lg gradient-brand px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow"
                >
                  Open {primary.name} <ArrowRight className="h-4 w-4" />
                </Link>
                {result.alternatives.slice(0, 2).map((id) => {
                  const alt = TOOL_BY_ID[id];
                  if (!alt) return null;
                  return (
                    <Link
                      key={id}
                      to="/tools/$toolId"
                      params={{ toolId: id }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-glass-border bg-card/50 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                    >
                      <alt.icon className="h-3.5 w-3.5" /> {alt.name}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
