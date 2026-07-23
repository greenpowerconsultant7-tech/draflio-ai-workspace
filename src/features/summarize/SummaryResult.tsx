import { Check, Clipboard, Download } from "lucide-react";
import { useState } from "react";
import {
  downloadSummaryBlob,
  formatPageReferences,
  safeSummaryBase,
  serializeSummaryText,
} from "./summaryExport";
import type { SummaryReferenceItem, SummaryResult as Result } from "./summaryTypes";

function ReferenceList({ title, items }: { title: string; items: SummaryReferenceItem[] }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby={`${title.replace(/\s+/g, "-").toLowerCase()}-heading`}>
      <h2 id={`${title.replace(/\s+/g, "-").toLowerCase()}-heading`} className="text-xl font-semibold text-white">
        {title}
      </h2>
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl bg-white/5 p-4">
            <p>{item.text}</p>
            <p className="mt-2 text-xs font-medium text-cyan-300">{formatPageReferences(item.pageReferences)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function SummaryResult({ result, filename }: { result: Result; filename: string }) {
  const [feedback, setFeedback] = useState("");
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback(`${label} copied.`);
    } catch {
      setFeedback(`${label} could not be copied.`);
    }
  };
  const base = safeSummaryBase(filename);
  return (
    <div className="space-y-7" aria-live="polite">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-cyan-400/15 px-3 py-1 text-sm font-semibold text-cyan-200">
          Extractive summary
        </span>
        <span className="text-sm text-slate-300">{result.mode} · {result.documentClassification}</span>
      </div>
      <section>
        <h2 className="text-xl font-semibold text-white">Overview</h2>
        <p className="mt-3 whitespace-pre-wrap leading-7 text-slate-100">{result.overview}</p>
      </section>
      <ReferenceList title="Key points" items={result.keyPoints} />
      <ReferenceList title="Possible action items" items={result.possibleActionItems} />
      {result.pageSummaries.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold text-white">Page summaries</h2>
          <div className="mt-3 space-y-3">
            {result.pageSummaries.map((page) => (
              <article key={page.pageNumber} className="rounded-xl bg-white/5 p-4">
                <h3 className="font-semibold text-cyan-200">Page {page.pageNumber}</h3>
                <p className="mt-2 whitespace-pre-wrap">{page.summary}</p>
              </article>
            ))}
          </div>
        </section>
      )}
      <section>
        <h2 className="text-xl font-semibold text-white">Limitations</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-300">
          {result.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
        </ul>
      </section>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => void copy(result.overview, "Overview")} className="rounded-xl border border-white/15 px-4 py-2">
          <Clipboard className="mr-2 inline h-4 w-4" />Copy overview
        </button>
        <button type="button" onClick={() => void copy(serializeSummaryText(result), "Full summary")} className="rounded-xl border border-white/15 px-4 py-2">
          <Check className="mr-2 inline h-4 w-4" />Copy full summary
        </button>
        <button type="button" onClick={() => downloadSummaryBlob(new Blob([serializeSummaryText(result)], { type: "text/plain;charset=utf-8" }), `${base}-summary.txt`)} className="rounded-xl border border-white/15 px-4 py-2">
          <Download className="mr-2 inline h-4 w-4" />Download TXT
        </button>
        <button type="button" onClick={() => downloadSummaryBlob(new Blob([JSON.stringify(result, null, 2)], { type: "application/json;charset=utf-8" }), `${base}-summary.json`)} className="rounded-xl border border-white/15 px-4 py-2">
          <Download className="mr-2 inline h-4 w-4" />Download JSON
        </button>
      </div>
      {feedback && <p role="status" className="text-sm text-cyan-200">{feedback}</p>}
    </div>
  );
}
