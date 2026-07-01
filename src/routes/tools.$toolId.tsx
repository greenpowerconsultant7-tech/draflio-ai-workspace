import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Header } from "@/components/draflio/Header";
import { UploadZone } from "@/components/draflio/UploadZone";
import { AICommandBar } from "@/components/draflio/AICommandBar";
import { TOOL_BY_ID, DRAFLIO_TOOLS } from "@/lib/draflio-tools";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";

export const Route = createFileRoute("/tools/$toolId")({
  loader: ({ params }) => {
    const tool = TOOL_BY_ID[params.toolId];
    if (!tool) throw notFound();
    return { tool };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.tool ? `${loaderData.tool.name} · Draflio` : "Tool · Draflio" },
      { name: "description", content: loaderData?.tool?.description ?? "AI document tool." },
    ],
  }),
  notFoundComponent: () => (
    <div className="min-h-screen">
      <Header />
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="text-3xl font-bold">Tool not found</h1>
        <Link to="/" className="mt-6 inline-block text-primary-glow underline">Back to home</Link>
      </div>
    </div>
  ),
  component: ToolPage,
});

function ToolPage() {
  const { tool } = Route.useLoaderData();
  const related = DRAFLIO_TOOLS.filter((t) => t.category === tool.category && t.id !== tool.id).slice(0, 4);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <Link to="/app" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to workspace
        </Link>

        <div className="mt-6 flex items-start gap-5">
          <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${tool.gradient} shadow-glow`}>
            <tool.icon className="h-7 w-7 text-white" />
          </div>
          <div>
            <span className="text-xs uppercase tracking-widest text-muted-foreground">{tool.category}</span>
            <h1 className="text-4xl font-bold gradient-text">{tool.name}</h1>
            <p className="mt-1 text-base text-muted-foreground">{tool.description}</p>
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <UploadZone variant="workspace" />
            <div className="glass rounded-2xl p-5">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" /> Or ask AI to do it for you
              </div>
              <AICommandBar compact />
            </div>
          </div>
          <aside className="space-y-3">
            <div className="glass-strong rounded-2xl p-5">
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Also in {tool.category}</div>
              <div className="mt-3 space-y-2">
                {related.map((t) => (
                  <Link
                    key={t.id}
                    to="/tools/$toolId"
                    params={{ toolId: t.id }}
                    className="flex items-center gap-3 rounded-xl border border-glass-border bg-card/40 p-3 hover:border-primary/40"
                  >
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${t.gradient}`}>
                      <t.icon className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1 text-sm font-semibold">{t.name}</div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
