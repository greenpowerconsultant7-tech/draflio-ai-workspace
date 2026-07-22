import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  Download,
  Eraser,
  LoaderCircle,
  MousePointer2,
  Plus,
  Trash2,
  UploadCloud,
} from "lucide-react";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { DraflioApiError, getApiErrorMessage } from "@/lib/apiError";
import {
  abortablePollDelay,
  cancelRedactionSession,
  createRedactionSession,
  downloadRedactionResult,
  finalizeRedactionSession,
  getRedactionSession,
  isTerminalRedactionSession,
  saveRedactionResult,
  validateRedactionPdfFile,
  type RedactionSession,
} from "@/lib/redactionSessionClient";
import RedactionPageCanvas from "./RedactionPageCanvas";
import {
  MAXIMUM_REDACTION_RECTANGLES,
  pageAspectRatioMatches,
  withoutEditorId,
  type EditorRectangle,
} from "./redactionGeometry";

type Phase =
  | "idle"
  | "uploading"
  | "loading-preview"
  | "review"
  | "finalizing"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

interface State {
  phase: Phase;
  session: RedactionSession | null;
  rectangles: EditorRectangle[];
  selectedId: string | null;
  pageIndex: number;
  drawMode: boolean;
  dpi: 96 | 144 | 200;
  confirmed: boolean;
  error: string;
}

type Action =
  | { type: "phase"; phase: Phase; error?: string }
  | { type: "session"; session: RedactionSession; phase?: Phase }
  | { type: "rectangles"; rectangles: EditorRectangle[] }
  | { type: "change-rectangle"; rectangle: EditorRectangle }
  | { type: "select"; id: string | null }
  | { type: "page"; pageIndex: number }
  | { type: "draw-mode"; enabled: boolean }
  | { type: "dpi"; dpi: 96 | 144 | 200 }
  | { type: "confirmed"; confirmed: boolean }
  | { type: "reset" };

const initialState: State = {
  phase: "idle",
  session: null,
  rectangles: [],
  selectedId: null,
  pageIndex: 0,
  drawMode: true,
  dpi: 144,
  confirmed: false,
  error: "",
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "phase":
      return { ...state, phase: action.phase, error: action.error ?? "" };
    case "session":
      return { ...state, session: action.session, phase: action.phase ?? state.phase, error: "" };
    case "rectangles":
      return { ...state, rectangles: action.rectangles, selectedId: null };
    case "change-rectangle":
      return {
        ...state,
        rectangles: state.rectangles.map((rectangle) =>
          rectangle.id === action.rectangle.id ? action.rectangle : rectangle,
        ),
      };
    case "select":
      return { ...state, selectedId: action.id };
    case "page":
      return { ...state, pageIndex: action.pageIndex, selectedId: null };
    case "draw-mode":
      return { ...state, drawMode: action.enabled, selectedId: null };
    case "dpi":
      return { ...state, dpi: action.dpi };
    case "confirmed":
      return { ...state, confirmed: action.confirmed };
    case "reset":
      return initialState;
  }
}

function abortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function safeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof DraflioApiError ? getApiErrorMessage(error, fallback) : fallback;
}

function phaseForSession(session: RedactionSession): Phase {
  if (session.status === "completed") return "completed";
  if (session.status === "failed") return "failed";
  if (session.status === "cancelled") return "cancelled";
  return "processing";
}

export default function RedactionWorkspace() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const mountedRef = useRef(true);
  const operationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const pdfDocumentRef = useRef<PDFDocumentProxy | null>(null);
  const sessionRef = useRef<RedactionSession | null>(null);
  const finalizingRef = useRef(false);

  useEffect(() => {
    sessionRef.current = state.session;
  }, [state.session]);

  const releasePreview = useCallback(async () => {
    await loadingTaskRef.current?.destroy();
    loadingTaskRef.current = null;
    const current = pdfDocumentRef.current;
    pdfDocumentRef.current = null;
    setPdfDocument(null);
    current?.cleanup();
  }, []);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      operationRef.current += 1;
      controllerRef.current?.abort();
      loadingTaskRef.current?.destroy();
      pdfDocumentRef.current?.cleanup();
      const session = sessionRef.current;
      if (session && !isTerminalRedactionSession(session))
        void cancelRedactionSession(session.id).catch(() => undefined);
    };
  }, []);

  const resetWorkspace = useCallback(async () => {
    const session = sessionRef.current;
    operationRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    finalizingRef.current = false;
    await releasePreview();
    dispatch({ type: "reset" });
    if (session && !isTerminalRedactionSession(session))
      await cancelRedactionSession(session.id).catch(() => undefined);
  }, [releasePreview]);

  const handleFile = async (file: File) => {
    const operation = ++operationRef.current;
    controllerRef.current?.abort();
    await releasePreview();
    dispatch({ type: "reset" });
    try {
      validateRedactionPdfFile(file);
      const controller = new AbortController();
      controllerRef.current = controller;
      dispatch({ type: "phase", phase: "uploading" });
      const session = await createRedactionSession(file, controller.signal);
      if (!mountedRef.current || operation !== operationRef.current) return;
      sessionRef.current = session;
      dispatch({ type: "session", session, phase: "loading-preview" });
      const arrayBuffer = await file.arrayBuffer();
      const previewBytes = new Uint8Array(arrayBuffer.byteLength);
      previewBytes.set(new Uint8Array(arrayBuffer));
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
      const task = pdfjsLib.getDocument({ data: previewBytes });
      loadingTaskRef.current = task;
      const document = await task.promise;
      pdfDocumentRef.current = document;
      if (!mountedRef.current || operation !== operationRef.current || controller.signal.aborted) {
        await task.destroy();
        return;
      }
      if (document.numPages !== session.pageCount)
        throw new Error("The local preview does not match the uploaded document.");
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        try {
          const viewport = page.getViewport({ scale: 1 });
          if (!pageAspectRatioMatches(viewport, session.pageDimensions[pageNumber - 1])) {
            throw new Error("The local preview dimensions do not match the uploaded document.");
          }
        } finally {
          page.cleanup();
        }
      }
      setPdfDocument(document);
      dispatch({ type: "phase", phase: "review" });
    } catch (error) {
      if (abortError(error)) return;
      await releasePreview();
      const session = sessionRef.current;
      if (session && !isTerminalRedactionSession(session))
        void cancelRedactionSession(session.id).catch(() => undefined);
      sessionRef.current = null;
      dispatch({ type: "reset" });
      dispatch({
        type: "phase",
        phase: "failed",
        error: safeErrorMessage(error, "The PDF could not be prepared for redaction."),
      });
    }
  };

  const finalize = async () => {
    if (
      finalizingRef.current ||
      state.phase !== "review" ||
      !state.session ||
      state.rectangles.length === 0 ||
      !state.confirmed
    )
      return;
    finalizingRef.current = true;
    const operation = operationRef.current;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    dispatch({ type: "phase", phase: "finalizing" });
    try {
      let session = await finalizeRedactionSession(
        state.session.id,
        {
          confirmation: true,
          revision: state.session.revision,
          dpi: state.dpi,
          rectangles: state.rectangles.map(withoutEditorId),
        },
        controller.signal,
      );
      if (!mountedRef.current || operation !== operationRef.current) return;
      dispatch({ type: "session", session, phase: "processing" });
      while (!isTerminalRedactionSession(session)) {
        await abortablePollDelay(900, controller.signal);
        session = await getRedactionSession(session.id, controller.signal);
        if (!mountedRef.current || operation !== operationRef.current) return;
        dispatch({ type: "session", session, phase: phaseForSession(session) });
      }
      finalizingRef.current = false;
    } catch (error) {
      finalizingRef.current = false;
      if (abortError(error)) return;
      dispatch({
        type: "phase",
        phase: "failed",
        error: safeErrorMessage(error, "Redaction finalization could not be completed."),
      });
    }
  };

  const cancelProcessing = async () => {
    if (!state.session || cancelling || isTerminalRedactionSession(state.session)) return;
    setCancelling(true);
    controllerRef.current?.abort();
    try {
      const session = await cancelRedactionSession(state.session.id);
      if (mountedRef.current && session.id === sessionRef.current?.id)
        dispatch({ type: "session", session, phase: phaseForSession(session) });
    } catch (error) {
      if (mountedRef.current)
        dispatch({
          type: "phase",
          phase: state.phase,
          error: safeErrorMessage(error, "Cancellation could not be confirmed."),
        });
    } finally {
      if (mountedRef.current) setCancelling(false);
    }
  };

  const download = async () => {
    if (!state.session?.resultReady || state.session.status !== "completed") return;
    try {
      const result = await downloadRedactionResult(state.session.id, state.session.outputFilename);
      saveRedactionResult(result);
    } catch (error) {
      dispatch({
        type: "phase",
        phase: "completed",
        error: safeErrorMessage(error, "The redacted PDF could not be downloaded."),
      });
    }
  };

  const pageRectangles = state.rectangles.filter(
    (rectangle) => rectangle.pageIndex === state.pageIndex,
  );
  const editingDisabled = state.phase !== "review";
  const pageCount = state.session?.pageCount ?? 0;
  const stageLabel = state.session?.stage.replaceAll("-", " ") ?? "";
  const handleRenderError = useCallback(
    () =>
      dispatch({ type: "phase", phase: "failed", error: "The PDF preview could not be rendered." }),
    [],
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-7">
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Redact PDF</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400 sm:text-base">
          Draw permanent opaque masks over sensitive areas, review every page, then generate a new
          image-based PDF.
        </p>
      </div>

      {state.phase === "idle" && (
        <label
          className="flex min-h-80 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-600 bg-slate-900/70 p-8 text-center transition hover:border-blue-400 focus-within:ring-2 focus-within:ring-blue-400"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file) void handleFile(file);
          }}
        >
          <UploadCloud className="h-14 w-14 text-blue-400" aria-hidden="true" />
          <span className="mt-5 text-xl font-semibold text-white">
            Drop a PDF here or choose a file
          </span>
          <span className="mt-2 text-sm text-slate-400">One PDF, up to 20 MB</span>
          <input
            className="sr-only"
            type="file"
            accept=".pdf,application/pdf,application/x-pdf"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
      )}

      {(state.phase === "uploading" || state.phase === "loading-preview") && (
        <div
          className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-slate-700 bg-slate-900/70 p-8"
          role="status"
        >
          <LoaderCircle className="h-10 w-10 animate-spin text-blue-400" />
          <p className="mt-4 font-semibold text-white">
            {state.phase === "uploading"
              ? "Uploading and validating PDF"
              : "Loading the local preview"}
          </p>
          <p className="mt-2 text-sm text-slate-400">Progress is indeterminate.</p>
        </div>
      )}

      {state.session &&
        pdfDocument &&
        state.phase !== "idle" &&
        state.phase !== "uploading" &&
        state.phase !== "loading-preview" && (
          <div className="grid gap-6 xl:grid-cols-[1fr_330px]">
            <section className="min-w-0 rounded-3xl border border-slate-700 bg-slate-900/70 p-3 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div
                  className="flex max-w-full gap-2 overflow-x-auto pb-1"
                  role="toolbar"
                  aria-label="Redaction tools"
                >
                  <button
                    type="button"
                    disabled={editingDisabled}
                    onClick={() => dispatch({ type: "draw-mode", enabled: true })}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold ${state.drawMode ? "bg-red-600 text-white" : "bg-slate-800 text-slate-200"} disabled:opacity-50`}
                  >
                    <Plus className="mr-2 inline h-4 w-4" /> Draw redaction
                  </button>
                  <button
                    type="button"
                    disabled={editingDisabled}
                    onClick={() => dispatch({ type: "draw-mode", enabled: false })}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold ${!state.drawMode ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-200"} disabled:opacity-50`}
                  >
                    <MousePointer2 className="mr-2 inline h-4 w-4" /> Select
                  </button>
                  <button
                    type="button"
                    disabled={editingDisabled || !state.selectedId}
                    onClick={() =>
                      state.selectedId &&
                      dispatch({
                        type: "rectangles",
                        rectangles: state.rectangles.filter(
                          (rectangle) => rectangle.id !== state.selectedId,
                        ),
                      })
                    }
                    className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 disabled:opacity-40"
                  >
                    <Trash2 className="mr-2 inline h-4 w-4" /> Delete
                  </button>
                </div>
                <p className="text-sm text-slate-300">
                  {state.rectangles.length} total · {pageRectangles.length} on this page
                </p>
              </div>
              <RedactionPageCanvas
                key={`${state.session.id}:${state.pageIndex}`}
                document={pdfDocument}
                pageIndex={state.pageIndex}
                rectangles={pageRectangles}
                selectedId={state.selectedId}
                drawMode={state.drawMode}
                editingDisabled={editingDisabled}
                maximumReached={state.rectangles.length >= MAXIMUM_REDACTION_RECTANGLES}
                onSelect={(id) => dispatch({ type: "select", id })}
                onAdd={(rectangle) =>
                  dispatch({ type: "rectangles", rectangles: [...state.rectangles, rectangle] })
                }
                onChange={(rectangle) => dispatch({ type: "change-rectangle", rectangle })}
                onDelete={(id) =>
                  dispatch({
                    type: "rectangles",
                    rectangles: state.rectangles.filter((rectangle) => rectangle.id !== id),
                  })
                }
                onRenderError={handleRenderError}
              />
              <nav className="mt-4 flex items-center justify-center gap-3" aria-label="PDF pages">
                <button
                  type="button"
                  disabled={state.pageIndex === 0}
                  onClick={() => dispatch({ type: "page", pageIndex: state.pageIndex - 1 })}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-40"
                >
                  Previous
                </button>
                <label className="text-sm text-slate-300">
                  Page{" "}
                  <select
                    value={state.pageIndex}
                    onChange={(event) =>
                      dispatch({ type: "page", pageIndex: Number(event.target.value) })
                    }
                    className="mx-1 rounded-md bg-slate-800 px-2 py-1 text-white"
                    aria-label="Current page"
                  >
                    {Array.from({ length: pageCount }, (_, index) => (
                      <option key={index} value={index}>
                        {index + 1}
                      </option>
                    ))}
                  </select>{" "}
                  of {pageCount}
                </label>
                <button
                  type="button"
                  disabled={state.pageIndex + 1 >= pageCount}
                  onClick={() => dispatch({ type: "page", pageIndex: state.pageIndex + 1 })}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-40"
                >
                  Next
                </button>
              </nav>
            </section>

            <aside className="space-y-5">
              <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5">
                <h2 className="text-lg font-bold text-white">Review controls</h2>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={editingDisabled || pageRectangles.length === 0}
                    onClick={() =>
                      window.confirm("Clear all redactions on this page?") &&
                      dispatch({
                        type: "rectangles",
                        rectangles: state.rectangles.filter(
                          (rectangle) => rectangle.pageIndex !== state.pageIndex,
                        ),
                      })
                    }
                    className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 disabled:opacity-40"
                  >
                    Clear page
                  </button>
                  <button
                    type="button"
                    disabled={editingDisabled || state.rectangles.length === 0}
                    onClick={() =>
                      window.confirm("Clear every redaction rectangle?") &&
                      dispatch({ type: "rectangles", rectangles: [] })
                    }
                    className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 disabled:opacity-40"
                  >
                    Clear all
                  </button>
                </div>
                <label className="mt-5 block text-sm font-semibold text-slate-200">
                  Output detail
                  <select
                    disabled={editingDisabled}
                    value={state.dpi}
                    onChange={(event) =>
                      dispatch({ type: "dpi", dpi: Number(event.target.value) as 96 | 144 | 200 })
                    }
                    className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-white disabled:opacity-50"
                  >
                    <option value={96}>96 DPI — smaller file</option>
                    <option value={144}>144 DPI — balanced</option>
                    <option value={200}>200 DPI — higher detail</option>
                  </select>
                </label>
                <p className="mt-2 text-xs text-slate-400">
                  Higher DPI may take longer and produce a larger file.
                </p>
              </section>

              {state.phase === "review" && (
                <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-5">
                  <h2 className="font-bold text-amber-200">Permanent finalization</h2>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-300">
                    <li>Masks are burned into a newly generated image-based PDF.</li>
                    <li>Selectability and accessibility may be lost.</li>
                    <li>Review every page before continuing.</li>
                    <li>Automated PII detection is not included.</li>
                    <li>This is not a compliance guarantee.</li>
                  </ul>
                  <label className="mt-4 flex items-start gap-3 text-sm text-white">
                    <input
                      type="checkbox"
                      checked={state.confirmed}
                      onChange={(event) =>
                        dispatch({ type: "confirmed", confirmed: event.target.checked })
                      }
                      className="mt-1 h-4 w-4"
                    />
                    I reviewed every page and understand this action is irreversible.
                  </label>
                  <button
                    type="button"
                    disabled={!state.confirmed || state.rectangles.length === 0}
                    onClick={() => void finalize()}
                    className="mt-5 w-full rounded-xl bg-red-600 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Finalize redactions
                  </button>
                  <button
                    type="button"
                    onClick={() => void resetWorkspace()}
                    className="mt-3 w-full rounded-xl border border-slate-600 px-4 py-2 text-sm text-white"
                  >
                    Start over
                  </button>
                </section>
              )}

              {["finalizing", "processing"].includes(state.phase) && (
                <section
                  className="rounded-3xl border border-blue-500/30 bg-blue-950/20 p-5"
                  aria-live="polite"
                >
                  <div className="flex items-center gap-3">
                    <LoaderCircle className="h-5 w-5 animate-spin text-blue-300" />
                    <h2 className="font-bold capitalize text-white">
                      {stageLabel || "submitting"}
                    </h2>
                  </div>
                  <p className="mt-3 text-sm text-slate-300">{state.session.message}</p>
                  {state.session.progress.mode === "determinate" ? (
                    <p className="mt-3 text-sm font-semibold text-blue-200">
                      {state.session.progress.completed} of {state.session.progress.total} pages
                    </p>
                  ) : (
                    <p className="mt-3 text-sm text-blue-200">
                      In progress — no measurable page count yet
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={cancelling}
                    onClick={() => void cancelProcessing()}
                    className="mt-4 w-full rounded-xl border border-slate-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {cancelling ? "Cancelling…" : "Cancel processing"}
                  </button>
                </section>
              )}

              {state.phase === "completed" && (
                <section
                  className="rounded-3xl border border-green-500/30 bg-green-950/20 p-5"
                  aria-live="polite"
                >
                  <h2 className="font-bold text-green-300">Redacted PDF ready</h2>
                  <button
                    type="button"
                    disabled={!state.session.resultReady}
                    onClick={() => void download()}
                    className="mt-4 w-full rounded-xl bg-green-600 px-4 py-3 font-bold text-white disabled:opacity-50"
                  >
                    <Download className="mr-2 inline h-5 w-5" />
                    Download redacted PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => void resetWorkspace()}
                    className="mt-3 w-full rounded-xl border border-slate-600 px-4 py-2 text-sm text-white"
                  >
                    Redact another PDF
                  </button>
                </section>
              )}

              {(state.phase === "failed" || state.phase === "cancelled") && (
                <section
                  className="rounded-3xl border border-red-500/30 bg-red-950/20 p-5"
                  aria-live="assertive"
                >
                  <h2 className="font-bold text-red-200">
                    {state.phase === "cancelled" ? "Processing cancelled" : "Redaction unavailable"}
                  </h2>
                  <button
                    type="button"
                    onClick={() => void resetWorkspace()}
                    className="mt-4 w-full rounded-xl border border-slate-600 px-4 py-2 text-white"
                  >
                    Start over
                  </button>
                </section>
              )}
            </aside>
          </div>
        )}

      {state.error && (
        <div
          className="mt-5 rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200"
          role="alert"
        >
          {state.error}
        </div>
      )}
      {state.phase !== "idle" && !state.session && state.phase === "failed" && (
        <button
          type="button"
          onClick={() => void resetWorkspace()}
          className="mt-4 rounded-xl bg-slate-800 px-5 py-3 text-white"
        >
          <Eraser className="mr-2 inline h-4 w-4" />
          Choose another PDF
        </button>
      )}
      <div className="sr-only" aria-live="polite">
        {state.session?.message ?? (state.phase === "idle" ? "Ready for PDF upload" : state.phase)}
      </div>
    </main>
  );
}
