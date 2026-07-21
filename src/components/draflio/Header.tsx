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
            <Link to="/tools" className="text-sm text-muted-foreground transition hover:text-foreground" activeProps={{ className: "text-foreground" }}>Tools</Link>
            <Link to="/workspace" className="text-sm text-muted-foreground transition hover:text-foreground" activeProps={{ className: "text-foreground" }}>AI Workspace</Link>
            <Link to="/pricing" className="text-sm text-muted-foreground transition hover:text-foreground" activeProps={{ className: "text-foreground" }}>Pricing</Link>
            <Link to="/about" className="text-sm text-muted-foreground transition hover:text-foreground" activeProps={{ className: "text-foreground" }}>About</Link>
            <Link to="/contact" className="text-sm text-muted-foreground transition hover:text-foreground" activeProps={{ className: "text-foreground" }}>Contact</Link>
          </nav>
          <div className="flex items-center gap-2">
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
