import { useState, useRef, useCallback } from "react";
import { UploadCloud, FileText, Sparkles } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

const MAX_MB = 500;

type Props = {
  variant?: "hero" | "workspace";
  onFile?: (file: File) => void;
};

export function UploadZone({ variant = "hero", onFile }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const handleFile = useCallback((file: File) => {
    const mb = file.size / (1024 * 1024);
    if (mb > MAX_MB) {
      toast.error(`File too large (${mb.toFixed(0)} MB). Compress or split first.`);
      return;
    }
    if (onFile) return onFile(file);
    // Hand off to workspace via session storage
    try {
      sessionStorage.setItem("draflio_pending_file", JSON.stringify({
        name: file.name, size: file.size, type: file.type,
      }));
    } catch { /* noop */ }
    toast.success("Opening in Draflio workspace…");
    navigate({ to: "/app" });
  }, [navigate, onFile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }, [handleFile]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={[
        "group relative cursor-pointer overflow-hidden rounded-3xl transition-all duration-300",
        variant === "hero" ? "p-10 sm:p-14" : "p-8",
        dragging ? "scale-[1.01] shadow-glow" : "shadow-card hover:shadow-glow",
        "glass-strong",
      ].join(" ")}
    >
      {/* animated gradient border */}
      <div className="pointer-events-none absolute inset-0 rounded-3xl">
        <div className="absolute inset-0 rounded-3xl opacity-60 blur-2xl animate-gradient"
             style={{ background: "linear-gradient(120deg, oklch(0.58 0.22 265 / 0.35), oklch(0.56 0.25 305 / 0.35), oklch(0.72 0.18 195 / 0.25))" }} />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      <div className="relative flex flex-col items-center text-center">
        <div className="relative">
          <div className="absolute inset-0 -z-10 animate-pulse-glow rounded-full bg-primary/40 blur-2xl" />
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl gradient-brand shadow-glow">
            <UploadCloud className="h-9 w-9 text-white" strokeWidth={2} />
          </div>
        </div>
        <h3 className="mt-6 text-2xl font-semibold tracking-tight">
          Drop any document to begin
        </h3>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          PDF, Word, Excel, PowerPoint, images — up to {MAX_MB} MB. Draflio will
          analyze it and recommend the perfect workflow in seconds.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary-glow">
            <Sparkles className="h-3.5 w-3.5" /> AI analysis included
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent-glow">
            <FileText className="h-3.5 w-3.5" /> 20+ tools
          </span>
        </div>
        <button
          type="button"
          className="mt-6 inline-flex items-center gap-2 rounded-xl gradient-brand px-6 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition group-hover:scale-[1.02]"
        >
          Choose file
        </button>
        <p className="mt-3 text-xs text-muted-foreground">
          or drop it anywhere in this zone
        </p>
      </div>

      {/* floating docs */}
      {variant === "hero" && (
        <>
          <FloatingDoc className="left-4 top-6 hidden sm:block" delay="0s" />
          <FloatingDoc className="right-6 top-10 hidden sm:block" delay="1.4s" tint="accent" />
          <FloatingDoc className="left-10 bottom-6 hidden md:block" delay="2.6s" tint="accent" />
          <FloatingDoc className="right-10 bottom-10 hidden md:block" delay="3.2s" />
        </>
      )}
    </div>
  );
}

function FloatingDoc({ className = "", delay = "0s", tint = "primary" }: { className?: string; delay?: string; tint?: "primary" | "accent" }) {
  const bg = tint === "primary" ? "from-primary/25 to-primary/5" : "from-accent/25 to-accent/5";
  return (
    <div
      className={`pointer-events-none absolute animate-float ${className}`}
      style={{ animationDelay: delay }}
    >
      <div className={`flex h-16 w-12 flex-col items-center justify-center rounded-lg bg-gradient-to-br ${bg} border border-glass-border backdrop-blur-md shadow-card`}>
        <FileText className="h-5 w-5 text-white/70" />
        <div className="mt-1 h-1 w-6 rounded bg-white/30" />
        <div className="mt-1 h-1 w-5 rounded bg-white/20" />
      </div>
    </div>
  );
}
