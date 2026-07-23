import { useEffect, useReducer, useRef } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { Download, FileText, Hash, RotateCcw, XCircle } from "lucide-react";
import { PageNumberOptions } from "./PageNumberOptions";
import { PageNumberPreview } from "./PageNumberPreview";
import {
  DEFAULT_PAGE_NUMBER_OPTIONS,
  type PageNumberOptions as Options,
  type PageNumberResult,
} from "./pageNumberTypes";
import { resolveNumberedPages } from "./pageNumberRange";
import {
  generateNumberedPdf,
  hasPdfSignature,
  validatePageCount,
  validatePageNumberFile,
  validatePageNumberOptions,
} from "./pageNumberPdfService";

type Status =
  | "idle"
  | "reading-file"
  | "loading-preview"
  | "configuring"
  | "generating"
  | "completed"
  | "failed";

type State = {
  status: Status;
  file: File | null;
  bytes: Uint8Array | null;
  pageCount: number;
  options: Options;
  activePage: number;
  error: string;
  progress: { processed: number; total: number } | null;
  result: PageNumberResult | null;
};

const initialState: State = {
  status: "idle",
  file: null,
  bytes: null,
  pageCount: 0,
  options: DEFAULT_PAGE_NUMBER_OPTIONS,
  activePage: 1,
  error: "",
  progress: null,
  result: null,
};

type Action =
  | { type: "reading"; file: File }
  | { type: "preview-loading"; bytes: Uint8Array }
  | { type: "ready"; pageCount: number }
  | { type: "options"; options: Options; error?: string }
  | { type: "active-page"; page: number }
  | { type: "generating"; total: number }
  | { type: "progress"; processed: number; total: number }
  | { type: "completed"; result: PageNumberResult }
  | { type: "cancelled" }
  | { type: "failed"; message: string }
  | { type: "reset" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reading":
      return { ...initialState, status: "reading-file", file: action.file };
    case "preview-loading":
      return { ...state, status: "loading-preview", bytes: action.bytes };
    case "ready":
      return { ...state, status: "configuring", pageCount: action.pageCount, error: "" };
    case "options":
      return {
        ...state,
        options: action.options,
        error: action.error ?? "",
        result: null,
        status: state.pageCount ? "configuring" : state.status,
      };
    case "active-page":
      return { ...state, activePage: action.page };
    case "generating":
      return { ...state, status: "generating", progress: { processed: 0, total: action.total }, error: "" };
    case "progress":
      return { ...state, progress: action };
    case "completed":
      return { ...state, status: "completed", progress: null, result: action.result };
    case "cancelled":
      return { ...state, status: "configuring", progress: null, error: "" };
    case "failed":
      return { ...state, status: state.pageCount ? "configuring" : "failed", progress: null, error: action.message };
    case "reset":
      return initialState;
  }
}

export default function PageNumberWorkspace() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const operationRef = useRef(0);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const releaseDocument = async () => {
    await loadingTaskRef.current?.destroy();
    loadingTaskRef.current = null;
    documentRef.current = null;
  };

  const reset = () => {
    operationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    void releaseDocument();
    if (state.bytes) state.bytes.fill(0);
    if (state.result) state.result.bytes.fill(0);
    dispatch({ type: "reset" });
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationRef.current += 1;
      abortRef.current?.abort();
      loadingTaskRef.current?.destroy();
    };
  }, []);

  const readFile = async (file: File) => {
    try {
      validatePageNumberFile(file);
    } catch (error) {
      dispatch({
        type: "failed",
        message: error instanceof Error ? error.message : "Select a valid PDF.",
      });
      return;
    }
    const operation = ++operationRef.current;
    abortRef.current?.abort();
    await releaseDocument();
    dispatch({ type: "reading", file });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (operation !== operationRef.current || !mountedRef.current) return;
      if (!hasPdfSignature(bytes)) throw new Error();
      const { PDFDocument } = await import("pdf-lib");
      let pdf;
      try {
        pdf = await PDFDocument.load(Uint8Array.from(bytes), { updateMetadata: false });
      } catch {
        throw new Error();
      }
      validatePageCount(pdf.getPageCount());
      dispatch({ type: "preview-loading", bytes });
      const [pdfjs, worker] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
      ]);
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const task = pdfjs.getDocument({ data: Uint8Array.from(bytes) });
      loadingTaskRef.current = task;
      const document = await task.promise;
      if (operation !== operationRef.current || !mountedRef.current) {
        await task.destroy();
        return;
      }
      if (document.numPages !== pdf.getPageCount()) throw new Error();
      documentRef.current = document;
      dispatch({ type: "ready", pageCount: document.numPages });
    } catch {
      if (operation === operationRef.current && mountedRef.current) {
        dispatch({ type: "failed", message: "This PDF could not be opened." });
      }
    }
  };

  let numberedPages: number[] = [];
  if (state.pageCount) {
    try {
      numberedPages = resolveNumberedPages(
        state.pageCount,
        state.options.pageMode,
        state.options.customRange,
        state.options.skipFirst,
      );
    } catch {
      numberedPages = [];
    }
  }

  const updateOptions = (options: Options) => {
    let error = "";
    if (state.pageCount) {
      try {
        validatePageNumberOptions(options, state.pageCount);
      } catch {
        error = "Check the page-number options and page range.";
      }
    }
    dispatch({ type: "options", options, error });
  };

  const generate = async () => {
    if (
      state.status === "generating" ||
      !state.file ||
      !state.bytes ||
      !state.pageCount
    ) return;
    let selected: number[];
    try {
      selected = validatePageNumberOptions(state.options, state.pageCount);
      if (!selected.length) throw new Error();
    } catch {
      dispatch({ type: "failed", message: "Check the page-number options and page range." });
      return;
    }
    const operation = ++operationRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: "generating", total: selected.length });
    try {
      const result = await generateNumberedPdf(
        state.bytes,
        state.file.name,
        state.options,
        {
          signal: controller.signal,
          onProgress: (processed, total) => {
            if (operation === operationRef.current && mountedRef.current) {
              dispatch({ type: "progress", processed, total });
            }
          },
        },
      );
      if (operation !== operationRef.current || !mountedRef.current) {
        result.bytes.fill(0);
        return;
      }
      dispatch({ type: "completed", result });
    } catch (error) {
      if (operation !== operationRef.current || !mountedRef.current) return;
      if (error instanceof Error && error.name === "AbortError") {
        dispatch({ type: "cancelled" });
      } else {
        dispatch({ type: "failed", message: "The numbered PDF could not be generated." });
      }
    }
  };

  const download = () => {
    if (!state.result || state.result.blob.type !== "application/pdf" || !state.result.blob.size) return;
    const url = URL.createObjectURL(state.result.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = state.result.filename;
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <Hash className="h-9 w-9 text-cyan-400" />
          <h1 className="text-3xl font-bold">Add Page Numbers</h1>
        </div>
        <p className="mt-2 text-slate-400">
          Add customizable page numbers locally while preserving the original PDF content.
        </p>
      </div>

      {!state.file && (
        <label
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file) void readFile(file);
          }}
          className="flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-slate-600 p-12 text-center focus-within:ring-2 focus-within:ring-cyan-500"
        >
          <FileText className="mb-3 h-10 w-10 text-cyan-400" />
          <span className="font-bold">Choose or drop one PDF</span>
          <span className="mt-1 text-sm text-slate-400">Maximum 100 MB and 500 pages</span>
          <input
            aria-label="Choose PDF"
            type="file"
            accept=".pdf,application/pdf"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
              event.target.value = "";
            }}
          />
        </label>
      )}

      {(state.status === "reading-file" || state.status === "loading-preview") && (
        <p role="status" className="rounded-xl bg-slate-900 p-5">Loading PDF preview…</p>
      )}

      {state.pageCount > 0 && documentRef.current && (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-900 p-4">
            <span>{state.pageCount} PDF pages</span>
            <button type="button" onClick={reset} disabled={state.status === "generating"} className="rounded-lg border border-slate-600 px-3 py-2">
              Start over
            </button>
          </div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <PageNumberPreview
              document={documentRef.current}
              activePage={state.activePage}
              onActivePageChange={(page) => dispatch({ type: "active-page", page })}
              numberedPages={numberedPages}
              options={state.options}
            />
            <PageNumberOptions
              options={state.options}
              disabled={state.status === "generating"}
              error={state.error}
              onChange={updateOptions}
              onGenerate={() => void generate()}
            />
          </div>
        </>
      )}

      {state.status === "generating" && state.progress && (
        <div className="mt-6 rounded-xl border border-cyan-500/30 bg-slate-900 p-5" role="status">
          <p>
            {state.progress.processed === 0
              ? "Preparing selected pages…"
              : state.progress.processed < state.progress.total
              ? `Page ${state.progress.processed} of ${state.progress.total}`
              : "Finalizing numbered PDF…"}
          </p>
          {state.progress.processed < state.progress.total && (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="mt-3 flex items-center gap-2 rounded-lg border border-red-500 px-3 py-2 text-red-300"
            >
              <XCircle className="h-4 w-4" /> Cancel generation
            </button>
          )}
        </div>
      )}

      {state.result && state.status === "completed" && (
        <section className="mt-6 rounded-2xl border border-green-500/30 bg-green-950/20 p-6">
          <h2 className="text-2xl font-bold text-green-300">Numbered PDF ready</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-slate-400">Output</dt><dd>{state.result.filename}</dd></div>
            <div><dt className="text-slate-400">PDF pages</dt><dd>{state.result.totalPages}</dd></div>
            <div><dt className="text-slate-400">Numbered pages</dt><dd>{state.result.numberedPages}</dd></div>
            <div><dt className="text-slate-400">Position</dt><dd className="capitalize">{state.result.options.position.replace("-", " ")}</dd></div>
            <div><dt className="text-slate-400">Format</dt><dd>{state.result.options.format}</dd></div>
            <div><dt className="text-slate-400">Starting number</dt><dd>{state.result.options.startingNumber}</dd></div>
            <div><dt className="text-slate-400">Font</dt><dd>{state.result.options.font}{state.result.options.bold ? " Bold" : ""}</dd></div>
            <div><dt className="text-slate-400">Font size</dt><dd>{state.result.options.fontSize} pt</dd></div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={download} className="flex items-center gap-2 rounded-xl bg-green-600 px-5 py-3 font-bold">
              <Download className="h-5 w-5" /> Download numbered PDF
            </button>
            <button type="button" onClick={reset} className="flex items-center gap-2 rounded-xl border border-slate-600 px-5 py-3">
              <RotateCcw className="h-5 w-5" /> Number another PDF
            </button>
          </div>
        </section>
      )}

      {!state.pageCount && state.error && <p role="alert" className="mt-5 text-red-300">{state.error}</p>}
      <p className="mt-8 text-sm text-amber-200">
        Page numbers are added as new PDF text. Review the output before relying on it for filing,
        legal, regulatory, construction, or controlled-document workflows.
      </p>
    </main>
  );
}
