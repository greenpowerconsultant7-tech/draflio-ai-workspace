import { Check } from "lucide-react";
import { SectionHeader } from "./ToolsGrid";
import { Link } from "@tanstack/react-router";

const tiers = [
  {
    name: "Free",
    price: "$0",
    per: "forever",
    tagline: "Everything you need to try Draflio.",
    features: [
      "100 MB per file",
      "10 AI requests / day",
      "All core PDF tools",
      "AES-256 encryption",
    ],
    cta: "Start free",
    href: "/app",
    featured: false,
  },
  {
    name: "Pro",
    price: "$12",
    per: "per month",
    tagline: "For professionals who work with docs daily.",
    features: [
      "500 MB per file",
      "Unlimited AI requests",
      "Unlimited PDF tools",
      "Priority processing",
      "No ads · Premium support",
      "Draflio Pro badge",
    ],
    cta: "Upgrade to Pro",
    href: "/app",
    featured: true,
  },
  {
    name: "Business",
    price: "Custom",
    per: "contact us",
    tagline: "Team workspaces, SSO, and API access.",
    features: [
      "Everything in Pro",
      "Team workspaces",
      "SAML SSO",
      "API access",
      "Custom retention",
    ],
    cta: "Contact sales",
    href: "/app",
    featured: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          tag="Pricing"
          title="Simple pricing. Unmatched value."
          subtitle="Start free. Upgrade when you need more."
        />
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={[
                "relative rounded-3xl p-8 transition",
                t.featured
                  ? "glass-strong border-primary/50 shadow-glow scale-[1.02]"
                  : "glass hover:-translate-y-1",
              ].join(" ")}
            >
              {t.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full gradient-brand px-3 py-1 text-xs font-semibold text-primary-foreground shadow-glow">
                  Most popular
                </span>
              )}
              <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{t.name}</h3>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-5xl font-bold gradient-text">{t.price}</span>
                <span className="text-sm text-muted-foreground">/ {t.per}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{t.tagline}</p>
              <ul className="mt-6 space-y-3 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-primary-glow" /> {f}
                  </li>
                ))}
              </ul>
              <Link
                to={t.href}
                className={[
                  "mt-8 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition",
                  t.featured
                    ? "gradient-brand text-primary-foreground shadow-glow"
                    : "border border-glass-border bg-card/50 hover:bg-secondary",
                ].join(" ")}
              >
                {t.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const testimonials = [
  { quote: "Draflio replaced three tools for our finance team. The AI extraction of GST and invoice numbers alone saves us hours weekly.", name: "Ananya S.", role: "CFO, Northwind Consulting" },
  { quote: "The command bar is genius. I stopped hunting for tools — I just type what I want and Draflio picks the right workflow.", name: "Marco D.", role: "Legal Ops, Helix Law" },
  { quote: "Fastest OCR I've used. Scanned contract to editable Word in under 20 seconds, formatting intact.", name: "Priya K.", role: "Operations Lead, Vertex Health" },
];

export function Testimonials() {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader tag="Loved by teams" title="Built for the way professionals actually work" />
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {testimonials.map((t) => (
            <figure key={t.name} className="glass rounded-2xl p-6">
              <blockquote className="text-sm leading-relaxed text-foreground/90">
                "{t.quote}"
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full gradient-brand shadow-glow" />
                <div>
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

const faqs = [
  { q: "Is Draflio really free?", a: "Yes. The free plan includes all core tools, 100 MB uploads, and 10 AI requests per day — no card required." },
  { q: "Are my documents safe?", a: "Files are transferred and processed with AES-256 encryption and automatically deleted after processing." },
  { q: "What models power Draflio AI?", a: "Draflio runs on a mix of leading foundation models, orchestrated through our own document-tuned pipeline for accuracy and speed." },
  { q: "Do you support scanned PDFs?", a: "Yes — Smart OCR detects scans automatically, recognizes 40+ languages, and preserves layout and tables." },
  { q: "Can I use Draflio for team workflows?", a: "Draflio Business adds shared workspaces, SSO, API access and custom retention — reach out to our sales team." },
];

export function FAQ() {
  return (
    <section id="faq" className="relative py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeader tag="FAQ" title="Answers, up front" />
        <div className="mt-12 space-y-3">
          {faqs.map((f) => (
            <details key={f.q} className="group glass rounded-xl p-5 open:shadow-glow">
              <summary className="flex cursor-pointer list-none items-center justify-between text-base font-medium">
                {f.q}
                <span className="ml-4 flex h-6 w-6 items-center justify-center rounded-full border border-glass-border text-muted-foreground transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
