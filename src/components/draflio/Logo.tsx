import { Link } from "@tanstack/react-router";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`group flex items-center gap-2.5 ${className}`}>
      <div className="relative h-9 w-9">
        <div className="absolute inset-0 rounded-xl gradient-brand shadow-glow transition group-hover:scale-105" />
        <div className="absolute inset-0 flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-white">
            <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
            <path d="M15 3v5h5" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
            <path d="M9 13l2.2 2.2L15.5 11" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
      <span className="text-xl font-semibold tracking-tight font-display">
        Draflio
      </span>
    </Link>
  );
}
