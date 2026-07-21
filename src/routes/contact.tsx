import { createFileRoute } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { PagePlaceholder } from "@/components/draflio/PagePlaceholder";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact · Draflio" },
      { name: "description", content: "Get in touch with the Draflio team." },
      { property: "og:title", content: "Contact · Draflio" },
      { property: "og:description", content: "Sales, support, and partnership enquiries." },
    ],
  }),
  component: () => (
    <PagePlaceholder
      eyebrow="Contact"
      icon={Mail}
      title="Talk to us"
      description="Sales, support, and partnership enquiries — we'd love to hear from you."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Sales", value: "sales@draflio.com" },
          { label: "Support", value: "support@draflio.com" },
          { label: "Partnerships", value: "hello@draflio.com" },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-glass-border bg-card/40 p-5">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{c.label}</div>
            <div className="mt-2 text-sm font-semibold">{c.value}</div>
          </div>
        ))}
      </div>
    </PagePlaceholder>
  ),
});
