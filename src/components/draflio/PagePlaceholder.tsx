import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";
import { Header } from "./Header";
import { Footer } from "./Footer";

export function PagePlaceholder({
  eyebrow,
  title,
  description,
  icon: Icon = Sparkles,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  icon?: LucideIcon;
  children?: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start gap-3">
          {eyebrow && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary-glow">
              <Icon className="h-3.5 w-3.5" /> {eyebrow}
            </span>
          )}
          <h1 className="text-4xl font-bold gradient-text sm:text-5xl">{title}</h1>
          <p className="max-w-2xl text-base text-muted-foreground">{description}</p>
        </div>

        <div className="mt-10 glass-strong rounded-2xl p-8">
          {children ?? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl gradient-brand shadow-glow">
                <Icon className="h-6 w-6 text-white" />
              </div>
              <div className="text-lg font-semibold">Coming soon</div>
              <p className="max-w-md text-sm text-muted-foreground">
                This page is scaffolded and ready. The full experience lands here shortly.
              </p>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
