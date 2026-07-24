import type { SolarFeature } from "../renewableEnergyTypes";
import {
  BackLink,
  Breadcrumbs,
  ForwardLink,
  ItemList,
  RenewablePage,
  StatusBadge,
} from "../RenewableShell";

export function SolarFeatureDetail({ feature }: { feature: SolarFeature }) {
  const isPvsyst = feature.id === "pvsyst-inspector";
  return (
    <RenewablePage>
      <section className="border-b border-glass-border py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[
              { label: "Renewable Energy", to: "/renewable-energy" },
              { label: "Solar PV", to: "/renewable-energy/solar" },
              { label: feature.title },
            ]}
          />
          <div className="mt-8">
            <StatusBadge>{feature.status}</StatusBadge>
          </div>
          <h1 className="mt-5 text-4xl font-bold gradient-text sm:text-5xl">{feature.title}</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
            {feature.description}
          </p>
        </div>
      </section>
      <section className="py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-warning/30 bg-warning/10 p-5">
            <h2 className="text-lg font-semibold">
              Current phase:{" "}
              {feature.status === "foundation"
                ? "Portal and data-model foundation"
                : "Roadmap definition"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This page defines the future Draflio workflow. The engineering engine is not active
              yet.
            </p>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <article className="rounded-2xl border border-glass-border bg-card/50 p-6">
              <h2 className="text-xl font-semibold">Planned inputs</h2>
              <ItemList items={feature.inputs} />
            </article>
            <article className="rounded-2xl border border-glass-border bg-card/50 p-6">
              <h2 className="text-xl font-semibold">Planned outputs</h2>
              <ItemList items={feature.outputs} />
            </article>
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <article className="rounded-2xl border border-glass-border bg-card/50 p-6">
              <h2 className="text-xl font-semibold">Known limitation</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{feature.limitations}</p>
            </article>
            <article className="rounded-2xl border border-glass-border bg-card/50 p-6">
              <h2 className="text-xl font-semibold">Architectural role</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {feature.architecturalRole}
              </p>
            </article>
          </div>
          {isPvsyst && (
            <p className="mt-6 rounded-xl border border-glass-border bg-card/40 p-4 text-sm text-muted-foreground">
              PVsyst is a third-party product. Draflio is not affiliated with or endorsed by PVsyst.
            </p>
          )}
          <div className="mt-8 flex flex-wrap gap-6">
            <BackLink to="/renewable-energy/solar">Back to Solar PV</BackLink>
            <ForwardLink to="/engineering">Related Engineering portal</ForwardLink>
          </div>
        </div>
      </section>
    </RenewablePage>
  );
}
