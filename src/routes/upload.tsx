import { createFileRoute } from "@tanstack/react-router";
import { UploadCloud } from "lucide-react";
import { PagePlaceholder } from "@/components/draflio/PagePlaceholder";
import { UploadZone } from "@/components/draflio/UploadZone";

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [
      { title: "Upload · Draflio" },
      { name: "description", content: "Upload documents to Draflio for AI-powered processing." },
    ],
  }),
  component: () => (
    <PagePlaceholder
      eyebrow="Upload"
      icon={UploadCloud}
      title="Upload a document"
      description="Drop a PDF, image, or Office file. Draflio analyzes it instantly and recommends the right tool."
    >
      <UploadZone variant="workspace" />
    </PagePlaceholder>
  ),
});
