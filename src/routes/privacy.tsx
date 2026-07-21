import { createFileRoute } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { PagePlaceholder } from "@/components/draflio/PagePlaceholder";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy · Draflio" },
      { name: "description", content: "How Draflio collects, uses, and protects your data." },
    ],
  }),
  component: () => (
    <PagePlaceholder
      eyebrow="Legal"
      icon={Shield}
      title="Privacy Policy"
      description="This is a placeholder for Draflio's privacy policy. The full policy will be published here soon."
    >
      <div className="prose prose-invert max-w-none text-sm text-muted-foreground">
        <p>We take privacy seriously. Uploaded documents are processed securely and are not used to train third-party models.</p>
        <p>The complete policy — including data retention, sub-processors, and DPA — will be published on this page.</p>
      </div>
    </PagePlaceholder>
  ),
});
