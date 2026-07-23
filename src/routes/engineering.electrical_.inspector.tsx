import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "@/components/draflio/Footer";
import { Header } from "@/components/draflio/Header";
import { ElectricalInspectorWorkspace } from "@/features/engineering/electrical/ElectricalInspectorWorkspace";

export const Route = createFileRoute("/engineering/electrical_/inspector")({
  head: () => ({
    meta: [
      { title: "Electrical SLD Inspector | Draflio Engineering" },
      {
        name: "description",
        content:
          "Inspect searchable electrical single-line diagrams and substation PDFs, review extracted equipment data, and export structured BOQ results.",
      },
    ],
  }),
  component: ElectricalInspectorRoute,
});

function ElectricalInspectorRoute() {
  return (
    <div className="min-h-screen overflow-x-hidden">
      <Header />
      <main>
        <section className="border-b border-glass-border bg-card/20 py-10">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary-glow">
              Browser-local MVP
            </p>
            <h1 className="mt-3 text-3xl font-bold sm:text-5xl">
              Smart SLD &amp; Substation PDF Inspector
            </h1>
            <p className="mt-4 max-w-3xl text-muted-foreground">
              Inspect searchable electrical drawings using deterministic label and rating
              extraction, then review every suggestion before exporting a draft schedule.
            </p>
          </div>
        </section>
        <ElectricalInspectorWorkspace />
      </main>
      <Footer />
    </div>
  );
}
