import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboard } from "lucide-react";
import { PagePlaceholder } from "@/components/draflio/PagePlaceholder";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · Draflio" },
      { name: "description", content: "Your Draflio dashboard: recent documents, usage, and quick actions." },
    ],
  }),
  component: () => (
    <PagePlaceholder
      eyebrow="Dashboard"
      icon={LayoutDashboard}
      title="Your Draflio dashboard"
      description="Track recent documents, AI usage, storage, and pinned tools — all in one glass-morphic control center."
    />
  ),
});
