import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Header } from "@/components/draflio/Header";
import { ToolLayout } from "@/components/draflio/ToolLayout";
import { TOOL_BY_ID } from "@/lib/draflio-tools";

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
        <Link to="/tools" className="mt-6 inline-block text-primary-glow underline">
          Back to all tools
        </Link>
      </div>
    </div>
  ),
  component: ToolPage,
});

function ToolPage() {
  const { tool } = Route.useLoaderData();
  return <ToolLayout tool={tool} />;
}
