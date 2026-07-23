import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/draflio/Header";
import { Footer } from "@/components/draflio/Footer";
import { UploadZone } from "@/components/draflio/UploadZone";
import { AICommandBar } from "@/components/draflio/AICommandBar";
import { ToolsGrid } from "@/components/draflio/ToolsGrid";
import { TrustSection, HowItWorks } from "@/components/draflio/TrustSection";
import { Pricing, Testimonials, FAQ } from "@/components/draflio/Pricing";
import { ArrowRight, CircuitBoard, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        {/* HERO */}
        <section className="relative overflow-hidden pt-16 pb-24 sm:pt-24">
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            style={{ background: "var(--gradient-hero)" }}
          />
          <div className="pointer-events-none absolute inset-0 -z-10 grid-bg" />

          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary-glow">
                <Sparkles className="h-3.5 w-3.5" />
                Draflio AI · v1 · Now with the Command Bar
              </span>
              <h1 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
                <span className="gradient-text">The world's smartest</span>
                <br />
                <span className="text-foreground">AI document workspace</span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
                Merge, split, convert, compress, search, analyze and chat with your documents using
                AI — all in one premium workspace.
              </p>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link
                  to="/app"
                  className="inline-flex items-center gap-2 rounded-xl gradient-brand px-6 py-3 text-sm font-semibold text-primary-foreground shadow-glow"
                >
                  Open workspace <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#tools"
                  className="inline-flex items-center gap-2 rounded-xl border border-glass-border bg-card/50 px-6 py-3 text-sm font-medium text-foreground hover:bg-secondary"
                >
                  Explore tools
                </a>
              </div>
            </div>

            <div id="ai" className="mx-auto mt-14 max-w-3xl">
              <AICommandBar />
            </div>

            <div className="mx-auto mt-16 max-w-4xl">
              <UploadZone />
            </div>
          </div>
        </section>

        <ToolsGrid />
        <section className="border-y border-glass-border bg-card/20 py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-card/60 p-8 shadow-[var(--shadow-card)] sm:p-12">
              <div className="pointer-events-none absolute right-0 top-0 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
              <div className="relative max-w-3xl">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary-glow">
                  <CircuitBoard aria-hidden="true" className="h-5 w-5" />
                </div>
                <p className="mt-5 text-sm font-semibold uppercase tracking-widest text-primary-glow">
                  Built for Engineers
                </p>
                <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
                  Technical drawings deserve specialized tools
                </h2>
                <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
                  Analyze technical drawings, extract structured quantities, review specifications,
                  and prepare engineering deliverables.
                </p>
                <Link
                  to="/engineering"
                  className="mt-7 inline-flex items-center gap-2 rounded-xl gradient-brand px-6 py-3 text-sm font-semibold text-primary-foreground shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Explore Draflio Engineering <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
        <HowItWorks />
        <TrustSection />
        <Testimonials />
        <Pricing />
        <FAQ />

        {/* CTA */}
        <section className="relative py-24">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-3xl glass-strong p-10 text-center shadow-glow sm:p-16">
              <div
                className="pointer-events-none absolute inset-0 opacity-40"
                style={{ background: "var(--gradient-hero)" }}
              />
              <div className="relative">
                <h2 className="text-3xl font-bold gradient-text sm:text-5xl">
                  Ready to work smarter with documents?
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
                  Join the teams replacing Adobe Acrobat, iLovePDF and Smallpdf with a single
                  AI-native workspace.
                </p>
                <Link
                  to="/app"
                  className="mt-8 inline-flex items-center gap-2 rounded-xl gradient-brand px-8 py-4 text-base font-semibold text-primary-foreground shadow-glow"
                >
                  Launch Draflio <ArrowRight className="h-5 w-5" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
