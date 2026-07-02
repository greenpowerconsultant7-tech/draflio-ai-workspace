import { createFileRoute } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { PagePlaceholder } from "@/components/draflio/PagePlaceholder";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About · Draflio" },
      { name: "description", content: "Draflio is building the world's smartest AI-powered document workspace." },
      { property: "og:title", content: "About · Draflio" },
      { property: "og:description", content: "The AI-first document platform." },
    ],
  }),
  component: () => (
    <PagePlaceholder
      eyebrow="About"
      icon={Info}
      title="Building the AI document workspace"
      description="Draflio unifies 20+ document tools behind a single AI command surface. Our mission: make document work effortless for every team."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { k: "Founded", v: "2025" },
          { k: "HQ", v: "Remote-first" },
          { k: "Mission", v: "Effortless documents" },
        ].map((i) => (
          <div key={i.k} className="rounded-xl border border-glass-border bg-card/40 p-5">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{i.k}</div>
            <div className="mt-2 text-sm font-semibold">{i.v}</div>
          </div>
        ))}
      </div>
    </PagePlaceholder>
  ),
});
