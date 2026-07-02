import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { PagePlaceholder } from "@/components/draflio/PagePlaceholder";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service · Draflio" },
      { name: "description", content: "The terms of service for using Draflio." },
    ],
  }),
  component: () => (
    <PagePlaceholder
      eyebrow="Legal"
      icon={FileText}
      title="Terms of Service"
      description="This is a placeholder for Draflio's terms of service. The full terms will be published here soon."
    >
      <div className="prose prose-invert max-w-none text-sm text-muted-foreground">
        <p>By using Draflio you agree to our acceptable use policy, subscription terms, and fair-use limits.</p>
        <p>The complete terms — including refunds, SLAs, and enterprise addenda — will be published on this page.</p>
      </div>
    </PagePlaceholder>
  ),
});
