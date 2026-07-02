import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { PagePlaceholder } from "@/components/draflio/PagePlaceholder";

export const Route = createFileRoute("/workspace")({
  head: () => ({
    meta: [
      { title: "AI Workspace · Draflio" },
      { name: "description", content: "The Draflio AI Workspace — natural language document intelligence." },
    ],
  }),
  component: () => (
    <PagePlaceholder
      eyebrow="AI Workspace"
      icon={Sparkles}
      title="AI Workspace"
      description="Command every tool with natural language. Analyze, extract, chat, and transform your documents in a single AI-native surface."
    />
  ),
});
