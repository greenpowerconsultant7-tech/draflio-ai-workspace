import { Link } from "@tanstack/react-router";
import { Logo } from "./Logo";
import { ArrowRight, Sparkles } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-40 w-full">
      <div className="glass border-b border-glass-border">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Logo />
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#tools" className="text-sm text-muted-foreground transition hover:text-foreground">Tools</a>
            <a href="#ai" className="text-sm text-muted-foreground transition hover:text-foreground">AI</a>
            <a href="#pricing" className="text-sm text-muted-foreground transition hover:text-foreground">Pricing</a>
            <a href="#faq" className="text-sm text-muted-foreground transition hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/app"
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground sm:inline-flex"
            >
              <Sparkles className="h-4 w-4" /> Workspace
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
