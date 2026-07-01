import { DRAFLIO_TOOLS, CATEGORY_ORDER } from "@/lib/draflio-tools";
import { Link } from "@tanstack/react-router";

export function ToolsGrid() {
  return (
    <section id="tools" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          tag="20+ Tools"
          title="Every document tool you need, unified by AI"
          subtitle="Merge, split, convert, compress, sign — and the AI-native tools you won't find anywhere else."
        />

        {CATEGORY_ORDER.map((cat) => {
          const tools = DRAFLIO_TOOLS.filter((t) => t.category === cat);
          if (!tools.length) return null;
          return (
            <div key={cat} className="mt-14">
              <div className="mb-5 flex items-center gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                  {cat === "AI" ? "AI-Native" : cat}
                </h3>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {tools.map((tool) => (
                  <Link
                    key={tool.id}
                    to="/tools/$toolId"
                    params={{ toolId: tool.id }}
                    className="group relative overflow-hidden rounded-2xl glass p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-glow"
                  >
                    <div className={`pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br ${tool.gradient} opacity-10 blur-2xl transition group-hover:opacity-30`} />
                    <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${tool.gradient} shadow-glow`}>
                      <tool.icon className="h-5 w-5 text-white" />
                    </div>
                    <h4 className="mt-4 text-base font-semibold">{tool.name}</h4>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {tool.description}
                    </p>
                    {tool.featured && (
                      <span className="absolute right-3 top-3 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-glow">
                        AI
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function SectionHeader({ tag, title, subtitle, align = "center" }: {
  tag?: string; title: string; subtitle?: string; align?: "center" | "left";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      {tag && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary-glow">
          <span className="h-1.5 w-1.5 rounded-full bg-primary-glow animate-pulse-glow" />
          {tag}
        </span>
      )}
      <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
        <span className="gradient-text">{title}</span>
      </h2>
      {subtitle && (
        <p className="mt-4 text-base text-muted-foreground sm:text-lg">
          {subtitle}
        </p>
      )}
    </div>
  );
}
