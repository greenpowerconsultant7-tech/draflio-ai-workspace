import { Link } from "@tanstack/react-router";
import { Logo } from "./Logo";
import { ArrowRight, Menu, Sparkles } from "lucide-react";

const primaryNavigation = [
  { label: "Tools", to: "/tools" },
  { label: "Engineering", to: "/engineering" },
  { label: "AI Workspace", to: "/workspace" },
  { label: "Pricing", to: "/pricing" },
  { label: "About", to: "/about" },
  { label: "Contact", to: "/contact" },
] as const;

const navigationLinkClass =
  "text-sm text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function Header() {
  return (
    <header className="sticky top-0 z-40 w-full">
      <div className="glass border-b border-glass-border">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Logo />
          <nav
            aria-label="Primary navigation"
            className="hidden items-center gap-6 md:flex lg:gap-8"
          >
            {primaryNavigation.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={navigationLinkClass}
                activeProps={{
                  "aria-current": "page",
                  className:
                    "font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-8",
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <details className="group relative md:hidden">
              <summary
                aria-label="Open primary navigation"
                className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border border-glass-border bg-card/60 text-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
              >
                <Menu aria-hidden="true" className="h-5 w-5" />
              </summary>
              <nav
                aria-label="Mobile primary navigation"
                className="absolute right-0 top-12 z-50 flex w-56 flex-col gap-1 rounded-xl border border-glass-border bg-card p-2 shadow-2xl"
              >
                {primaryNavigation.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    activeProps={{
                      "aria-current": "page",
                      className:
                        "bg-secondary font-semibold text-foreground ring-1 ring-primary/50",
                    }}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </details>
            <Link
              to="/dashboard"
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground sm:inline-flex"
            >
              <Sparkles className="h-4 w-4" /> Dashboard
            </Link>
            <Link
              to="/app"
              className="inline-flex items-center gap-1.5 rounded-lg gradient-brand px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow transition hover:opacity-90"
            >
              Launch app <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
