import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bolt,
  Building2,
  CheckCircle2,
  Cog,
  FileSearch,
  Mountain,
  Ruler,
  ShieldAlert,
  Upload,
  Workflow,
} from "lucide-react";
import { Footer } from "@/components/draflio/Footer";
import { Header } from "@/components/draflio/Header";
import { ENGINEERING_DISCIPLINES, type EngineeringDiscipline } from "@/lib/draflio-engineering";

export const Route = createFileRoute("/engineering/")({
  head: () => ({
    meta: [
      { title: "Draflio Engineering | Technical PDF Tools for Engineers" },
      {
        name: "description",
        content:
          "Specialized PDF tools for electrical, mechanical, civil, structural, process, architectural, and geotechnical engineering workflows.",
      },
    ],
  }),
  component: EngineeringHome,
});

const disciplineIcons = {
  bolt: Bolt,
  cog: Cog,
  building: Building2,
  workflow: Workflow,
  ruler: Ruler,
  mountain: Mountain,
} satisfies Record<EngineeringDiscipline["icon"], typeof Bolt>;

function EngineeringHome() {
  return (
    <div className="min-h-screen overflow-x-hidden">
      <Header />
      <main>
        <section className="relative overflow-hidden border-b border-glass-border py-20 sm:py-28">
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            style={{ background: "var(--gradient-hero)" }}
          />
          <div className="pointer-events-none absolute inset-0 -z-10 grid-bg" />
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl">
              <span className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary-glow">
                Specialized technical workflows
              </span>
              <h1 className="mt-6 text-4xl font-bold leading-tight gradient-text sm:text-6xl">
                Draflio Engineering
              </h1>
              <p className="mt-6 max-w-3xl text-lg text-foreground sm:text-xl">
                Turn technical PDF drawings into structured engineering data, schedules, quantities,
                and review findings.
              </p>
              <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
                Specialized document tools for electrical, mechanical, civil, structural, process,
                architectural, and geotechnical engineers.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/engineering/electrical"
                  className="inline-flex items-center justify-center gap-2 rounded-xl gradient-brand px-6 py-3 text-sm font-semibold text-primary-foreground shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Explore Electrical Engineering{" "}
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
                <a
                  href="#disciplines"
                  className="inline-flex items-center justify-center rounded-xl border border-glass-border bg-card/50 px-6 py-3 text-sm font-medium text-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  View planned engineering tools
                </a>
              </div>
            </div>
          </div>
        </section>

        <section
          id="disciplines"
          aria-labelledby="disciplines-title"
          className="scroll-mt-24 py-20"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-widest text-primary-glow">
                Engineering disciplines
              </p>
              <h2 id="disciplines-title" className="mt-3 text-3xl font-bold sm:text-4xl">
                Purpose-built document tools
              </h2>
              <p className="mt-4 text-muted-foreground">
                Electrical is the first planned module. The remaining discipline toolsets are
                roadmap items.
              </p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {ENGINEERING_DISCIPLINES.map((discipline) => {
                const Icon = disciplineIcons[discipline.icon];
                return (
                  <article
                    key={discipline.id}
                    className="flex min-w-0 flex-col rounded-2xl border border-glass-border bg-card/50 p-6 shadow-[var(--shadow-card)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary-glow">
                        <Icon aria-hidden="true" className="h-5 w-5" />
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${discipline.status === "First module" ? "bg-primary/15 text-primary-glow" : "bg-secondary text-muted-foreground"}`}
                      >
                        {discipline.status}
                      </span>
                    </div>
                    <h3 className="mt-5 text-xl font-semibold">{discipline.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {discipline.description}
                    </p>
                    <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-foreground">
                      Planned tools
                    </p>
                    <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                      {discipline.plannedTools.map((tool) => (
                        <li key={tool} className="flex gap-2">
                          <CheckCircle2
                            aria-hidden="true"
                            className="mt-0.5 h-4 w-4 shrink-0 text-primary-glow"
                          />
                          <span>{tool}</span>
                        </li>
                      ))}
                    </ul>
                    {discipline.route ? (
                      <Link
                        to={discipline.route}
                        className="mt-6 inline-flex items-center gap-2 self-start rounded-lg text-sm font-semibold text-primary-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Explore Electrical <ArrowRight aria-hidden="true" className="h-4 w-4" />
                      </Link>
                    ) : (
                      <p
                        className="mt-6 text-sm font-medium text-muted-foreground"
                        aria-label={`${discipline.title}: Coming soon`}
                      >
                        Coming soon
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="workflow-title"
          className="border-y border-glass-border bg-card/20 py-20"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary-glow">
              Intended engineering workflow
            </p>
            <h2 id="workflow-title" className="mt-3 text-3xl font-bold">
              From drawing to reviewable deliverable
            </h2>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {[
                { icon: Upload, title: "Upload technical drawings" },
                {
                  icon: FileSearch,
                  title: "Draflio analyzes text, geometry, symbols, and relationships",
                },
                {
                  icon: CheckCircle2,
                  title: "Review and export structured engineering deliverables",
                },
              ].map((step, index) => (
                <article
                  key={step.title}
                  className="rounded-2xl border border-glass-border bg-card/50 p-6"
                >
                  <div className="flex items-center gap-3 text-primary-glow">
                    <span className="text-sm font-bold">0{index + 1}</span>
                    <step.icon aria-hidden="true" className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                </article>
              ))}
            </div>
            <p className="mt-5 text-sm text-muted-foreground">
              This describes the intended workflow; analysis capabilities will be introduced in
              phases.
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-start gap-4 rounded-2xl border border-warning/30 bg-warning/10 p-6">
              <ShieldAlert aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-warning" />
              <div>
                <h2 className="text-lg font-semibold">Professional review required</h2>
                <p className="mt-2 max-w-5xl text-sm leading-6 text-muted-foreground">
                  Engineering extraction results are intended to assist qualified professionals.
                  Users must review all quantities, classifications, ratings, and findings before
                  using them for design, procurement, construction, tendering, or compliance
                  decisions.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
