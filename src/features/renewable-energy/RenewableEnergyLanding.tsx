import { Link } from "@tanstack/react-router";
import { ArrowRight, BatteryCharging, Network, Sun, Wind } from "lucide-react";
import { RENEWABLE_SECTORS } from "./renewableEnergyCatalog";
import { ForwardLink, RenewablePage, StatusBadge } from "./RenewableShell";

const icons = { solar: Sun, wind: Wind, bess: BatteryCharging, hybrid: Network };
const connectedRecords = [
  "Terrain and site data",
  "Drawings and layouts",
  "Equipment definitions",
  "Engineering assumptions",
  "Simulations",
  "Findings",
  "BOQ and procurement",
  "Revision history",
];

export function RenewableEnergyLanding() {
  return (
    <RenewablePage>
      <section className="relative overflow-hidden border-b border-glass-border py-20 sm:py-28">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{ background: "var(--gradient-hero)" }}
        />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <StatusBadge>Engineering portal</StatusBadge>
          <h1 className="mt-6 text-4xl font-bold gradient-text sm:text-6xl">Renewable Energy</h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground sm:text-xl">
            Build renewable-energy projects from terrain, engineering drawings, equipment data,
            simulations, and reviewable project records.
          </p>
        </div>
      </section>
      <section aria-labelledby="sectors-title" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 id="sectors-title" className="text-3xl font-bold">
            Sector workspaces
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {RENEWABLE_SECTORS.map((sector) => {
              const Icon = icons[sector.id];
              return (
                <Link
                  key={sector.id}
                  to={sector.route}
                  className="group flex min-w-0 flex-col rounded-2xl border border-glass-border bg-card/50 p-6 shadow-[var(--shadow-card)] transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary-glow">
                      <Icon aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <StatusBadge>{sector.status}</StatusBadge>
                  </div>
                  <h3 className="mt-5 text-xl font-semibold">{sector.title}</h3>
                  <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">
                    {sector.description}
                  </p>
                  <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary-glow">
                    Explore {sector.title}
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
      <section
        aria-labelledby="connected-title"
        className="border-y border-glass-border bg-card/20 py-20"
      >
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <h2 id="connected-title" className="text-3xl font-bold">
              One connected renewable-energy workspace
            </h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              The portal is designed to connect reviewed source information and future analysis
              results within a traceable project record. These capabilities will be introduced in
              phases.
            </p>
            <div className="mt-6">
              <ForwardLink to="/engineering">Explore Draflio Engineering</ForwardLink>
            </div>
          </div>
          <div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {connectedRecords.map((item) => (
                <li
                  key={item}
                  className="rounded-xl border border-glass-border bg-card/50 p-4 text-sm"
                >
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm text-muted-foreground">
              Use Draflio Engineering to inspect SLDs, drawings, schedules, and equipment before
              bringing verified project data into Renewable Energy.
            </p>
          </div>
        </div>
      </section>
    </RenewablePage>
  );
}
