import { Shield, Trash2, Zap, Globe, FileCheck } from "lucide-react";
import { SectionHeader } from "./ToolsGrid";

const trust = [
  { icon: Shield,    title: "AES-256 Encryption",   desc: "End-to-end encryption on every file." },
  { icon: Trash2,    title: "Auto File Deletion",   desc: "Files vanish after processing. Always." },
  { icon: Zap,       title: "Lightning Fast",       desc: "Optimized pipelines, edge processing." },
  { icon: Globe,     title: "99.99% Uptime",        desc: "Global infrastructure, always on." },
  { icon: FileCheck, title: "Millions Processed",   desc: "Trusted by teams around the world." },
];

export function TrustSection() {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          tag="Security"
          title="Enterprise-grade trust, built in"
          subtitle="Your documents never leave a secure, encrypted pipeline. Deleted automatically after processing."
        />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {trust.map((t) => (
            <div key={t.title} className="glass rounded-2xl p-6 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl gradient-brand shadow-glow">
                <t.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="mt-4 text-sm font-semibold">{t.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const steps = [
  { n: "01", title: "Upload", desc: "Drop any document. Draflio analyzes it instantly." },
  { n: "02", title: "AI processes", desc: "Ask, extract, convert, translate — one command bar." },
  { n: "03", title: "Download", desc: "Get polished results in the format you need." },
];

export function HowItWorks() {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader tag="Workflow" title="Three steps. That's it." />
        <div className="relative mt-16">
          <div className="absolute left-1/2 top-16 hidden h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-primary/60 to-transparent md:block" />
          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.n} className="relative">
                <div className="glass-strong rounded-2xl p-8">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-bold gradient-text">{s.n}</span>
                    <div className="h-8 w-8 rounded-full gradient-brand shadow-glow" />
                  </div>
                  <h3 className="mt-4 text-xl font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
                </div>
                {i < steps.length - 1 && (
                  <div className="absolute -right-3 top-1/2 hidden -translate-y-1/2 md:block">
                    <div className="h-2 w-2 rounded-full bg-primary shadow-glow" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
