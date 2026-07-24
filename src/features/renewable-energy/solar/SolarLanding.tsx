import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Breadcrumbs, RenewablePage, StatusBadge } from "../RenewableShell";
import { SOLAR_FEATURES } from "./solarFeatureCatalog";

const workflow = [
  "Prepare terrain and site information",
  "Reconstruct and review drawing geometry",
  "Validate modules, inverters, and electrical equipment",
  "Build and review the solar layout",
  "Evaluate shading and electrical assumptions",
  "Run a future validated solar simulation",
  "Compare reports, drawings, and revisions",
  "Export engineering and procurement records",
];

export function SolarLanding() {
  return (
    <RenewablePage>
      <section className="border-b border-glass-border py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[{ label: "Renewable Energy", to: "/renewable-energy" }, { label: "Solar PV" }]}
          />
          <div className="mt-8">
            <StatusBadge>Foundation in development</StatusBadge>
          </div>
          <h1 className="mt-5 text-4xl font-bold gradient-text sm:text-6xl">
            Solar PV Engineering
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
            Create a verified solar-project foundation from terrain, engineering drawings, equipment
            definitions, and reviewable assumptions.
          </p>
        </div>
      </section>
      <section aria-labelledby="workflow-title" className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 id="workflow-title" className="text-3xl font-bold">
            Solar workflow
          </h2>
          <ol className="mt-8 grid gap-3 md:grid-cols-2">
            {workflow.map((step, index) => (
              <li
                key={step}
                className="flex gap-4 rounded-xl border border-glass-border bg-card/40 p-4"
              >
                <span className="font-bold text-primary-glow">{index + 1}</span>
                <span className="text-sm">{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-sm text-muted-foreground">
            This is the intended review workflow; calculation and generation engines will be
            introduced in later phases.
          </p>
        </div>
      </section>
      <section
        aria-labelledby="features-title"
        className="border-y border-glass-border bg-card/20 py-16"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 id="features-title" className="text-3xl font-bold">
            Solar feature catalog
          </h2>
          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {SOLAR_FEATURES.map((feature) => (
              <Link
                key={feature.id}
                to="/renewable-energy/solar/$featureId"
                params={{ featureId: feature.id }}
                className="flex min-w-0 flex-col rounded-2xl border border-glass-border bg-card/50 p-6 transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div>
                  <StatusBadge>{feature.status}</StatusBadge>
                </div>
                <h3 className="mt-5 text-xl font-semibold">{feature.title}</h3>
                <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">
                  {feature.description}
                </p>
                <p className="mt-5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {feature.category} · {feature.outputs.slice(0, 2).join(" · ")}
                </p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary-glow">
                  {feature.status === "foundation"
                    ? "View foundation"
                    : feature.status === "research"
                      ? "View roadmap"
                      : "View planned capability"}
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </RenewablePage>
  );
}
