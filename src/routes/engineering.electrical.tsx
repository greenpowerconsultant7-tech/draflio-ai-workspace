import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileOutput,
  ScanSearch,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Footer } from "@/components/draflio/Footer";
import { Header } from "@/components/draflio/Header";

export const Route = createFileRoute("/engineering/electrical")({
  head: () => ({
    meta: [
      { title: "Electrical Engineering PDF Tools | Draflio Engineering" },
      {
        name: "description",
        content:
          "Planned SLD, substation drawing, electrical BOQ, equipment schedule, and rating review tools for electrical engineers.",
      },
    ],
  }),
  component: ElectricalEngineering,
});

const intendedWorkflow = [
  "Upload a native-vector or scanned electrical drawing",
  "Identify supported equipment symbols",
  "Associate visible ratings and labels",
  "Generate a reviewable equipment schedule",
  "Export structured data and BOQ results",
  "Flag selected rating inconsistencies for human review",
];

const plannedOutputs = [
  "Excel BOQ",
  "Structured JSON",
  "Equipment schedule",
  "Source-page references",
  "Review findings",
  "Later DXF export",
];

const mvpScope = [
  "Searchable native-vector PDFs",
  "Visible text and geometry extraction",
  "A limited supported electrical symbol set",
  "User review and correction",
  "Excel and JSON outputs",
];

const laterPhases = [
  "Scanned drawing OCR",
  "Computer-vision symbol recognition",
  "Expanded symbol libraries",
  "Cross-page network relationships",
  "DXF export",
];

export function ElectricalEngineering() {
  return (
    <div className="min-h-screen overflow-x-hidden">
      <Header />
      <main>
        <section className="relative overflow-hidden border-b border-glass-border py-20 sm:py-28">
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            style={{ background: "var(--gradient-hero)" }}
          />
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <span className="inline-flex items-center gap-2 rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-warning">
              <Clock3 aria-hidden="true" className="h-3.5 w-3.5" /> In development
            </span>
            <h1 className="mt-6 max-w-4xl text-4xl font-bold leading-tight gradient-text sm:text-6xl">
              Electrical Engineering PDF Tools
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground sm:text-xl">
              Convert SLDs and substation drawings into reviewable equipment data, BOQs, and
              engineering findings.
            </p>
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1.35fr_0.65fr] lg:px-8">
            <article className="rounded-3xl border border-primary/30 bg-card/60 p-6 shadow-glow sm:p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-brand">
                <Zap aria-hidden="true" className="h-6 w-6 text-white" />
              </div>
              <p className="mt-6 text-sm font-semibold uppercase tracking-widest text-primary-glow">
                Primary planned product
              </p>
              <h2 className="mt-3 text-2xl font-bold sm:text-3xl">
                Smart SLD &amp; Substation PDF Inspector
              </h2>
              <p className="mt-4 text-muted-foreground">
                The intended workflow will help engineers turn supported drawing content into
                structured, traceable information for review.
              </p>
              <ol className="mt-8 grid gap-3 sm:grid-cols-2">
                {intendedWorkflow.map((step, index) => (
                  <li
                    key={step}
                    className="flex gap-3 rounded-xl border border-glass-border bg-background/30 p-4 text-sm"
                  >
                    <span className="font-bold text-primary-glow">{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="mt-8 inline-flex cursor-not-allowed items-center rounded-xl border border-glass-border bg-secondary px-5 py-3 text-sm font-semibold text-muted-foreground opacity-80"
              >
                Electrical Inspector — In development
              </button>
            </article>

            <aside
              aria-labelledby="outputs-title"
              className="rounded-3xl border border-glass-border bg-card/40 p-6 sm:p-8"
            >
              <FileOutput aria-hidden="true" className="h-7 w-7 text-primary-glow" />
              <h2 id="outputs-title" className="mt-4 text-xl font-semibold">
                Planned outputs
              </h2>
              <ul className="mt-5 space-y-3">
                {plannedOutputs.map((output) => (
                  <li key={output} className="flex gap-2 text-sm text-muted-foreground">
                    <CheckCircle2
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0 text-primary-glow"
                    />
                    {output}
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </section>

        <section className="border-y border-glass-border bg-card/20 py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-6 lg:grid-cols-2">
              <article className="rounded-2xl border border-primary/25 bg-card/50 p-6 sm:p-8">
                <ScanSearch aria-hidden="true" className="h-7 w-7 text-primary-glow" />
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-bold">MVP scope</h2>
                  <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
                    Planned
                  </span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  The first implementation will initially target:
                </p>
                <ul className="mt-5 space-y-3">
                  {mvpScope.map((item) => (
                    <li key={item} className="flex gap-2 text-sm">
                      <ShieldCheck
                        aria-hidden="true"
                        className="mt-0.5 h-4 w-4 shrink-0 text-primary-glow"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
              <article className="rounded-2xl border border-glass-border bg-card/40 p-6 sm:p-8">
                <Clock3 aria-hidden="true" className="h-7 w-7 text-muted-foreground" />
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-bold">Later phases</h2>
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                    Coming later
                  </span>
                </div>
                <ul className="mt-5 space-y-3">
                  {laterPhases.map((item) => (
                    <li key={item} className="flex gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            </div>
            <Link
              to="/engineering"
              className="mt-8 inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-primary-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Return to Engineering
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
