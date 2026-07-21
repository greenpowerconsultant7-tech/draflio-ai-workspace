import { Link } from "@tanstack/react-router";
import { Logo } from "./Logo";

type FooterLink = { label: string; to: string; params?: Record<string, string> };

export function Footer() {
  const cols: { title: string; links: FooterLink[] }[] = [
    {
      title: "Product",
      links: [
        { label: "AI Workspace", to: "/workspace" },
        { label: "Dashboard", to: "/dashboard" },
        { label: "Upload", to: "/upload" },
        { label: "All Tools", to: "/tools" },
        { label: "Pricing", to: "/pricing" },
      ],
    },
    {
      title: "Tools",
      links: [
        { label: "Merge PDF", to: "/tools/$toolId", params: { toolId: "merge" } },
        { label: "Split PDF", to: "/tools/$toolId", params: { toolId: "split" } },
        { label: "Compress PDF", to: "/tools/$toolId", params: { toolId: "compress" } },
        { label: "Smart OCR", to: "/tools/$toolId", params: { toolId: "smart-ocr" } },
        { label: "AI Search", to: "/tools/$toolId", params: { toolId: "ai-search" } },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About", to: "/about" },
        { label: "Contact", to: "/contact" },
        { label: "Settings", to: "/settings" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Privacy Policy", to: "/privacy" },
        { label: "Terms", to: "/terms" },
      ],
    },
  ];

  return (
    <footer className="border-t border-border/60 bg-card/30">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              Making document work effortless with the world's smartest AI-powered platform.
            </p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="text-sm font-semibold">{c.title}</h4>
              <ul className="mt-4 space-y-2">
                {c.links.map((l) => (
                  <li key={l.label}>
                    {l.params ? (
                      <Link
                        to={l.to}
                        params={l.params}
                        className="text-sm text-muted-foreground transition hover:text-foreground"
                      >
                        {l.label}
                      </Link>
                    ) : (
                      <Link
                        to={l.to}
                        className="text-sm text-muted-foreground transition hover:text-foreground"
                      >
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} Draflio. All rights reserved.</p>
          <p>Built for the AI-first future of documents.</p>
        </div>
      </div>
    </footer>
  );
}
