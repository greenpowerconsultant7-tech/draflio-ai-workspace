import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Header } from "@/components/draflio/Header";
import { Footer } from "@/components/draflio/Footer";
import { Pricing } from "@/components/draflio/Pricing";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing · Draflio" },
      { name: "description", content: "Simple, transparent pricing for Draflio's AI document workspace." },
      { property: "og:title", content: "Pricing · Draflio" },
      { property: "og:description", content: "Free, Pro, and Business plans for the AI document workspace." },
    ],
  }),
  component: () => (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary-glow">
            <Sparkles className="h-3.5 w-3.5" /> Pricing
          </span>
          <h1 className="text-4xl font-bold gradient-text sm:text-5xl">Pricing that scales with you</h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            Start free. Upgrade when you need larger files, batch processing, and premium AI.
          </p>
        </div>
        <div className="mt-12">
          <Pricing />
        </div>
      </main>
      <Footer />
    </div>
  ),
});
