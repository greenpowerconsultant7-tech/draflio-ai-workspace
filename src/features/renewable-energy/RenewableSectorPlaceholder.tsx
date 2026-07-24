import { Breadcrumbs, ItemList, RenewablePage, BackLink, StatusBadge } from "./RenewableShell";

interface Props {
  title: string;
  value: string;
  categories: readonly string[];
}

export function RenewableSectorPlaceholder({ title, value, categories }: Props) {
  return (
    <RenewablePage>
      <section className="border-b border-glass-border py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[{ label: "Renewable Energy", to: "/renewable-energy" }, { label: title }]}
          />
          <div className="mt-8">
            <StatusBadge>Planned</StatusBadge>
          </div>
          <h1 className="mt-5 text-4xl font-bold gradient-text sm:text-5xl">{title}</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">{value}</p>
        </div>
      </section>
      <section className="py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-2">
            <article className="rounded-2xl border border-glass-border bg-card/50 p-6">
              <h2 className="text-2xl font-semibold">Planned capability categories</h2>
              <ItemList items={categories} />
            </article>
            <article className="rounded-2xl border border-glass-border bg-card/50 p-6">
              <h2 className="text-2xl font-semibold">Shared project records</h2>
              <p className="mt-4 leading-7 text-muted-foreground">
                This future workspace will connect its reviewed site, equipment, assumptions,
                findings, BOQ, and revision records to the shared Renewable Energy project
                structure. No analysis engine is active on this page.
              </p>
            </article>
          </div>
          <div className="mt-8">
            <BackLink to="/renewable-energy">Back to Renewable Energy</BackLink>
          </div>
        </div>
      </section>
    </RenewablePage>
  );
}
