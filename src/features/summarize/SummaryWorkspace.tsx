import { Link } from "@tanstack/react-router";
import { FileText, LoaderCircle, RotateCcw, Sparkles, XCircle } from "lucide-react";
import { useEffect, useReducer, useRef } from "react";
import { getApiErrorMessage } from "@/lib/apiError";
import {
  cancelDocumentIntelligenceSession,
  createDocumentIntelligenceSession,
  getDocumentIntelligenceSession,
  validateSummaryPdfFile,
} from "@/lib/documentIntelligenceClient";
import type { PublicDocumentIntelligenceSession } from "../../../shared/documentIntelligenceTypes";
import {
  cancelSummary,
  createSummary,
  getSummary,
  getSummaryResult,
  summaryPollDelay,
} from "./summaryClient";
import SummaryOptions from "./SummaryOptions";
import SummaryResult from "./SummaryResult";
import {
  DEFAULT_SUMMARY_OPTIONS,
  type PublicSummaryJob,
  type SummaryOptions as Options,
  type SummaryResult as Result,
} from "./summaryTypes";

type Phase =
  | "idle"
  | "uploading"
  | "extracting"
  | "ready-for-summary"
  | "submitting-summary"
  | "summarizing"
  | "completed"
  | "failed"
  | "cancelled";

type State = {
  phase: Phase;
  file: File | null;
  document: PublicDocumentIntelligenceSession | null;
  summary: PublicSummaryJob | null;
  result: Result | null;
  options: Options;
  error: string;
};

const initialState: State = {
  phase: "idle",
  file: null,
  document: null,
  summary: null,
  result: null,
  options: { ...DEFAULT_SUMMARY_OPTIONS },
  error: "",
};

type Action =
  | { type: "upload"; file: File }
  | { type: "document"; document: PublicDocumentIntelligenceSession; phase: Phase }
  | { type: "summary"; summary: PublicSummaryJob; phase: Phase }
  | { type: "complete"; summary: PublicSummaryJob; result: Result }
  | { type: "options"; options: Options }
  | { type: "fail"; message: string }
  | { type: "cancelled" }
  | { type: "reset" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "upload":
      return { ...initialState, phase: "uploading", file: action.file };
    case "document":
      return { ...state, document: action.document, phase: action.phase, error: "" };
    case "summary":
      return { ...state, summary: action.summary, phase: action.phase, error: "" };
    case "complete":
      return { ...state, summary: action.summary, result: action.result, phase: "completed" };
    case "options":
      return { ...state, options: action.options };
    case "fail":
      return { ...state, phase: "failed", error: action.message };
    case "cancelled":
      return { ...state, phase: "cancelled", error: "" };
    case "reset":
      return initialState;
  }
}

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function statusText(state: State) {
  if (state.phase === "uploading") return "Uploading and inspecting PDF";
  if (state.phase === "extracting" && state.document) return state.document.message;
  if (["submitting-summary", "summarizing"].includes(state.phase) && state.summary) {
    return state.summary.message;
  }
  return "";
}

export default function SummaryWorkspace() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const operationRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const documentRef = useRef<PublicDocumentIntelligenceSession | null>(null);
  const summaryRef = useRef<PublicSummaryJob | null>(null);
  documentRef.current = state.document;
  summaryRef.current = state.summary;

  const stopLocalWork = () => {
    generationRef.current += 1;
    operationRef.current?.abort();
    operationRef.current = null;
  };

  useEffect(
    () => () => {
      stopLocalWork();
      const summary = summaryRef.current;
      const document = documentRef.current;
      if (summary && !["cancelled", "failed"].includes(summary.status)) {
        void cancelSummary(summary.id).catch(() => undefined);
      }
      if (document) {
        void cancelDocumentIntelligenceSession(document.id).catch(() => undefined);
      }
    },
    [],
  );

  const inspect = async (file: File) => {
    stopLocalWork();
    const generation = generationRef.current;
    const controller = new AbortController();
    operationRef.current = controller;
    try {
      validateSummaryPdfFile(file);
      dispatch({ type: "upload", file });
      let document = await createDocumentIntelligenceSession(file, controller.signal);
      if (generation !== generationRef.current) return;
      dispatch({ type: "document", document, phase: document.ready ? "ready-for-summary" : "extracting" });
      while (!["ready", "failed", "cancelled"].includes(document.status)) {
        await summaryPollDelay(850, controller.signal);
        document = await getDocumentIntelligenceSession(document.id, controller.signal);
        if (generation !== generationRef.current) return;
        dispatch({ type: "document", document, phase: document.ready ? "ready-for-summary" : "extracting" });
      }
      if (document.status === "failed") throw new Error(document.error?.message ?? "The PDF could not be inspected.");
      if (document.status === "cancelled") dispatch({ type: "cancelled" });
    } catch (error) {
      if (!isAbort(error) && generation === generationRef.current) {
        dispatch({ type: "fail", message: getApiErrorMessage(error, "The PDF could not be inspected.") });
      }
    }
  };

  const generate = async () => {
    if (
      !state.document?.ready ||
      !state.document.searchableTextAvailable ||
      ["submitting-summary", "summarizing"].includes(state.phase)
    ) return;
    stopLocalWork();
    const generation = generationRef.current;
    const controller = new AbortController();
    operationRef.current = controller;
    try {
      let summary = await createSummary(state.document.id, state.options, controller.signal);
      if (generation !== generationRef.current) return;
      dispatch({ type: "summary", summary, phase: "summarizing" });
      while (!["ready", "failed", "cancelled"].includes(summary.status)) {
        await summaryPollDelay(850, controller.signal);
        summary = await getSummary(summary.id, controller.signal);
        if (generation !== generationRef.current) return;
        dispatch({ type: "summary", summary, phase: "summarizing" });
      }
      if (summary.status === "cancelled") {
        dispatch({ type: "cancelled" });
        return;
      }
      if (summary.status === "failed") throw new Error(summary.error?.message ?? "The summary could not be created.");
      const result = await getSummaryResult(summary.id, controller.signal);
      if (generation === generationRef.current) dispatch({ type: "complete", summary, result });
    } catch (error) {
      if (!isAbort(error) && generation === generationRef.current) {
        dispatch({ type: "fail", message: getApiErrorMessage(error, "The summary could not be created.") });
      }
    }
  };

  const cancel = async () => {
    stopLocalWork();
    try {
      if (state.summary && !["ready", "failed", "cancelled"].includes(state.summary.status)) {
        await cancelSummary(state.summary.id);
      } else if (state.document && !["ready", "failed", "cancelled"].includes(state.document.status)) {
        await cancelDocumentIntelligenceSession(state.document.id);
      }
    } finally {
      dispatch({ type: "cancelled" });
    }
  };

  const reset = async () => {
    stopLocalWork();
    const summary = state.summary;
    const document = state.document;
    dispatch({ type: "reset" });
    if (summary) await cancelSummary(summary.id).catch(() => undefined);
    if (document) await cancelDocumentIntelligenceSession(document.id).catch(() => undefined);
  };

  const choose = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void inspect(file);
  };
  const busy = ["uploading", "extracting", "submitting-summary", "summarizing"].includes(state.phase);
  const imageOnly = state.document?.ready && !state.document.searchableTextAvailable;
  const progress = state.summary?.progress ?? state.document?.progress;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <header className="mb-8">
          <div className="mb-3 flex items-center gap-3 text-cyan-300">
            <Sparkles className="h-6 w-6" />
            <span className="text-sm font-semibold uppercase tracking-widest">Deterministic extractive summary</span>
          </div>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">Summarize PDF</h1>
          <p className="mt-3 max-w-3xl text-slate-300">
            Select important sentences from searchable PDF text, with source-page references and no external AI service.
          </p>
        </header>

        {state.phase === "idle" && (
          <label
            className="flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-cyan-400/40 bg-white/5 p-8 text-center focus-within:ring-2 focus-within:ring-cyan-300"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              choose(event.dataTransfer.files);
            }}
          >
            <FileText className="h-12 w-12 text-cyan-300" />
            <span className="mt-4 text-xl font-semibold">Upload a searchable PDF</span>
            <span className="mt-2 text-sm text-slate-300">Choose or drop one PDF, up to 20 MB</span>
            <input
              className="sr-only"
              type="file"
              accept=".pdf,application/pdf,application/x-pdf,application/octet-stream"
              aria-label="Choose PDF to summarize"
              onChange={(event) => choose(event.target.files)}
            />
          </label>
        )}

        {state.phase !== "idle" && (
          <div className="space-y-6">
            <section className="rounded-2xl border border-white/10 bg-white/5 p-5" aria-live="polite">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{state.file?.name}</p>
                  {statusText(state) && <p className="mt-1 text-sm text-slate-300">{statusText(state)}</p>}
                </div>
                {busy && <LoaderCircle className="h-5 w-5 animate-spin text-cyan-300" aria-hidden="true" />}
              </div>
              {progress?.mode === "determinate" && (
                <p className="mt-3 text-sm" role="status">
                  Processed {progress.completed} of {progress.total} pages
                </p>
              )}
              {state.document?.ready && (
                <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                  <span>Classification: {state.document.documentClassification}</span>
                  <span>Pages: {state.document.pageCount}</span>
                  <span>Searchable text: {state.document.searchableTextAvailable ? "Available" : "Unavailable"}</span>
                </div>
              )}
              {state.document?.documentClassification === "mixed-content" && (
                <p className="mt-3 rounded-lg bg-amber-400/10 p-3 text-sm text-amber-100">
                  Image-only regions may not be included in the summary.
                </p>
              )}
            </section>

            {imageOnly && (
              <div role="alert" className="rounded-2xl border border-amber-300/30 bg-amber-400/10 p-5">
                This PDF does not contain enough searchable text to summarize. Use Smart OCR first, then upload the searchable PDF here.
                <Link to="/tools/$toolId" params={{ toolId: "smart-ocr" }} className="ml-2 font-semibold text-cyan-200 underline">
                  Open Smart OCR
                </Link>
              </div>
            )}

            {state.document?.ready && state.document.searchableTextAvailable && state.phase !== "completed" && (
              <>
                <SummaryOptions
                  value={state.options}
                  disabled={busy}
                  onChange={(options) => dispatch({ type: "options", options })}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void generate()}
                  className="rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Create summary
                </button>
              </>
            )}

            {state.result && <SummaryResult result={state.result} filename={state.file?.name ?? "document.pdf"} />}

            {state.error && <div role="alert" className="rounded-xl bg-red-400/10 p-4 text-red-200">{state.error}</div>}
            {state.phase === "cancelled" && <p role="status">Processing cancelled.</p>}

            <div className="flex flex-wrap gap-3">
              {busy && (
                <button type="button" onClick={() => void cancel()} className="rounded-xl border border-red-300/30 px-4 py-2 text-red-200">
                  <XCircle className="mr-2 inline h-4 w-4" />Cancel
                </button>
              )}
              <button type="button" onClick={() => void reset()} className="rounded-xl border border-white/15 px-4 py-2">
                <RotateCcw className="mr-2 inline h-4 w-4" />Start over
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
