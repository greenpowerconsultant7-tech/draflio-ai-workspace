import { createFileRoute } from "@tanstack/react-router";
import { Settings as SettingsIcon } from "lucide-react";
import { PagePlaceholder } from "@/components/draflio/PagePlaceholder";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings · Draflio" },
      { name: "description", content: "Manage your Draflio account, workspace, and preferences." },
    ],
  }),
  component: () => (
    <PagePlaceholder
      eyebrow="Settings"
      icon={SettingsIcon}
      title="Settings"
      description="Profile, workspace, billing, security, integrations, and notification preferences will live here."
    />
  ),
});
