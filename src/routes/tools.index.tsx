import { createFileRoute, Link } from "@tanstack/react-router";
import { Wrench } from "lucide-react";
import { PagePlaceholder } from "@/components/draflio/PagePlaceholder";
import { DRAFLIO_TOOLS, CATEGORY_ORDER } from "@/lib/draflio-tools";

export const Route = createFileRoute("/tools/")({
  head: () => ({
    meta: [
      { title: "All Tools · Draflio" },
      { name: "description", content: "Explore Draflio's full library of AI and PDF tools." },
    ],
  }),
  component: AllTools,
});

function AllTools() {
  return (
    <PagePlaceholder
      eyebrow="All Tools"
      icon={Wrench}
      title="Every Draflio tool"
      description="20+ AI and PDF tools organized by what you want to do. Pick one to jump into its workspace."
    >
      <div className="space-y-10">
        {CATEGORY_ORDER.map((cat) => {
          const items = DRAFLIO_TOOLS.filter((t) => t.category === cat);
          if (!items.length) return null;
          return (
            <div key={cat}>
              <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {cat}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((t) => (
                  <Link
                    key={t.id}
                    to="/tools/$toolId"
                    params={{ toolId: t.id }}
                    className="group flex items-start gap-3 rounded-xl border border-glass-border bg-card/40 p-4 transition hover:border-primary/40 hover:shadow-glow"
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${t.gradient}`}>
                      <t.icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.description}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </PagePlaceholder>
  );
}
