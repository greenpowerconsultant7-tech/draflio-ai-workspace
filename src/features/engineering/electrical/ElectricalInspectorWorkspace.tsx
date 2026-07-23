import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { Download, RotateCcw, Upload, X } from "lucide-react";
import { downloadFile } from "@/lib/downloadFile";
import {
  calculateBoq,
  calculateFindings,
  normalizeEquipmentId,
  safeBaseName,
  validateFileBasics,
} from "./electricalInspectorCore";
import { createJsonModel, createWorkbookBytes } from "./electricalExports";
import { inspectElectricalPdf, type InspectionProgress } from "./electricalPdfInspection";
import {
  EQUIPMENT_TYPES,
  MAX_EQUIPMENT_RECORDS,
  emptyRatings,
  type EquipmentRecord,
  type EquipmentType,
  type InspectionResult,
  type ReviewStatus,
} from "./electricalInspectorTypes";
import { ElectricalInspectorPageCanvas } from "./ElectricalInspectorPageCanvas";

type WorkflowState =
  | "idle"
  | "reading-file"
  | "loading-pdf"
  | "inspecting-pages"
  | "detecting-equipment"
  | "review"
  | "export-ready"
  | "failed"
  | "cancelled";
type Tab = "equipment" | "boq" | "findings" | "document";
const NOTICE =
  "Draflio Engineering provides extraction and review assistance. A qualified professional must verify all equipment classifications, quantities, ratings, findings, and exports against the source drawings before they are used for design, procurement, tendering, construction, operations, or regulatory submissions.";

function genericError(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "";
  if (error instanceof Error && error.message === "page-limit")
    return "This PDF exceeds the 20-page inspection limit.";
  if (error instanceof Error && error.message === "complexity-limit")
    return "This document is too complex for this preview.";
  if (error instanceof Error && error.message === "invalid-file")
    return "The selected file is not a valid PDF.";
  return "The PDF could not be inspected. Try another searchable PDF.";
}

export function ElectricalInspectorWorkspace() {
  const [workflow, setWorkflow] = useState<WorkflowState>("idle");
  const [progress, setProgress] = useState<InspectionProgress | null>(null);
  const [result, setResult] = useState<InspectionResult | null>(null);
  const [records, setRecords] = useState<EquipmentRecord[]>([]);
  const [fileBase, setFileBase] = useState("drawing");
  const [error, setError] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("equipment");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | "all">("all");
  const [includeReview, setIncludeReview] = useState(false);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const operationRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const cleanupDocument = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    const document = documentRef.current;
    const loadingTask = loadingTaskRef.current;
    documentRef.current = null;
    loadingTaskRef.current = null;
    if (document) await document.cleanup().catch(() => undefined);
    if (loadingTask) await loadingTask.destroy().catch(() => undefined);
  }, []);

  const startOver = useCallback(() => {
    operationRef.current += 1;
    void cleanupDocument();
    setWorkflow("idle");
    setProgress(null);
    setResult(null);
    setRecords([]);
    setError("");
    setPageIndex(0);
    setSelectedId(null);
    setTab("equipment");
    setSearch("");
    setStatusFilter("all");
    setIncludeReview(false);
    setFileBase("drawing");
    if (inputRef.current) inputRef.current.value = "";
  }, [cleanupDocument]);

  useEffect(
    () => () => {
      operationRef.current += 1;
      void cleanupDocument();
    },
    [cleanupDocument],
  );

  const inspectFile = async (file: File) => {
    const validationError = validateFileBasics(file);
    if (validationError) {
      setError(validationError);
      setWorkflow("failed");
      return;
    }
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    await cleanupDocument();
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    setResult(null);
    setRecords([]);
    setWorkflow("reading-file");
    setFileBase(safeBaseName(file.name));
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (operation !== operationRef.current || controller.signal.aborted) return;
      const loaded = await inspectElectricalPdf(bytes, controller.signal, (nextProgress) => {
        if (operation === operationRef.current) {
          setProgress(nextProgress);
          setWorkflow(nextProgress.state);
        }
      });
      if (operation !== operationRef.current || controller.signal.aborted) {
        await loaded.loadingTask.destroy();
        return;
      }
      documentRef.current = loaded.document;
      loadingTaskRef.current = loaded.loadingTask;
      setResult(loaded.result);
      setRecords(loaded.result.equipment);
      setWorkflow("export-ready");
      setProgress(null);
    } catch (caught) {
      if (operation !== operationRef.current) return;
      const message = genericError(caught);
      setProgress(null);
      setError(message);
      setWorkflow(message ? "failed" : "cancelled");
    }
  };

  const findings = useMemo(() => calculateFindings(records), [records]);
  const boq = useMemo(() => calculateBoq(records, includeReview), [records, includeReview]);
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return records.filter(
      (record) =>
        (statusFilter === "all" || record.status === statusFilter) &&
        (!needle ||
          [
            record.equipmentId,
            record.description,
            record.voltage,
            record.voltageRatio,
            record.apparentPower,
            record.activePower,
            record.current,
            record.interruptingCurrent,
            record.ratio,
          ].some((value) => value.toLowerCase().includes(needle))),
    );
  }, [records, search, statusFilter]);

  const updateRecord = (id: string, patch: Partial<EquipmentRecord>) => {
    setRecords((current) =>
      current.map((record) =>
        record.id === id
          ? {
              ...record,
              ...patch,
              normalizedEquipmentId:
                patch.equipmentId === undefined
                  ? record.normalizedEquipmentId
                  : normalizeEquipmentId(patch.equipmentId),
            }
          : record,
      ),
    );
  };

  const addManual = () => {
    if (!result || records.length >= MAX_EQUIPMENT_RECORDS) return;
    const order = Math.max(0, ...records.map((record) => record.order)) + 1;
    setRecords((current) => [
      ...current,
      {
        id: `manual-${crypto.randomUUID()}`,
        source: "manual",
        status: "review",
        pageIndex,
        equipmentType: "unknown-electrical-item",
        equipmentId: "",
        normalizedEquipmentId: "",
        description: "",
        ...emptyRatings(),
        confidence: "low",
        confidenceReasons: ["Manual record"],
        notes: "",
        order,
      },
    ]);
  };

  const exportJson = () => {
    if (!result) return;
    const model = createJsonModel(result, records, boq, findings);
    downloadFile(new Blob([JSON.stringify(model, null, 2)], { type: "application/json" }), {
      filename: `${fileBase}-electrical-inspection.json`,
    });
  };

  const exportExcel = async () => {
    if (!result) return;
    const bytes = await createWorkbookBytes(records, boq, findings, result.pages);
    downloadFile(bytes, {
      filename: `${fileBase}-electrical-boq.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  };

  const processing = [
    "reading-file",
    "loading-pdf",
    "inspecting-pages",
    "detecting-equipment",
  ].includes(workflow);
  const counts = {
    accepted: records.filter((record) => record.status === "accepted").length,
    review: records.filter((record) => record.status === "review").length,
    rejected: records.filter((record) => record.status === "rejected").length,
  };

  if (!result) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file) void inspectFile(file);
          }}
          onClick={() => inputRef.current?.click()}
          className="rounded-3xl border border-dashed border-primary/40 bg-card/50 p-10 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Upload aria-hidden="true" className="mx-auto h-10 w-10 text-primary-glow" />
          <h2 className="mt-5 text-2xl font-bold">Upload an electrical PDF</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Click or drop one searchable PDF. Maximum 20 MB and 20 pages. Processing stays in this
            browser.
          </p>
          <label className="sr-only" htmlFor="electrical-pdf-input">
            Select electrical PDF
          </label>
          <input
            ref={inputRef}
            id="electrical-pdf-input"
            type="file"
            accept=".pdf,application/pdf,application/octet-stream"
            className="sr-only"
            onClick={(event) => event.stopPropagation()}
            onChangeCapture={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void inspectFile(file);
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            const file = inputRef.current?.files?.[0];
            if (file) void inspectFile(file);
            else inputRef.current?.click();
          }}
          className="mx-auto mt-4 flex rounded-lg gradient-brand px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Inspect selected PDF
        </button>
        <div aria-live="polite" className="mt-5 text-center text-sm text-muted-foreground">
          {processing &&
            (progress?.page && progress.pageCount
              ? `Inspecting page ${progress.page} of ${progress.pageCount}`
              : "Preparing local PDF inspection…")}
          {workflow === "cancelled" && "Inspection cancelled. Choose a PDF to restart."}
        </div>
        {processing && (
          <button
            type="button"
            onClick={() => {
              operationRef.current += 1;
              void cleanupDocument();
              setWorkflow("cancelled");
              setProgress(null);
            }}
            className="mx-auto mt-4 flex items-center gap-2 rounded-lg border border-glass-border px-4 py-2 text-sm"
          >
            <X className="h-4 w-4" /> Cancel inspection
          </button>
        )}
        {error && (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm"
          >
            {error}
          </div>
        )}
        <p className="mt-8 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-muted-foreground">
          {NOTICE}
        </p>
      </div>
    );
  }

  const unsupported =
    result.classification === "image-only" || result.classification === "empty-or-unsupported";
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-glass-border bg-card/60 p-4">
        <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary-glow">
          {result.classification}
        </span>
        <span className="text-sm">{result.pageCount} pages</span>
        <span className="text-sm">
          Accepted {counts.accepted} · Review {counts.review} · Rejected {counts.rejected}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={startOver}
            className="inline-flex items-center gap-2 rounded-lg border border-glass-border px-3 py-2 text-sm"
          >
            <RotateCcw className="h-4 w-4" /> Start over
          </button>
          <button
            type="button"
            disabled={unsupported}
            onClick={exportJson}
            className="inline-flex items-center gap-2 rounded-lg border border-glass-border px-3 py-2 text-sm disabled:opacity-40"
          >
            <Download className="h-4 w-4" /> Export JSON
          </button>
          <button
            type="button"
            disabled={unsupported}
            onClick={() => void exportExcel()}
            className="inline-flex items-center gap-2 rounded-lg gradient-brand px-3 py-2 text-sm font-semibold disabled:opacity-40"
          >
            <Download className="h-4 w-4" /> Export Excel
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Classification is a technical heuristic based on searchable text, vector operations, and
        raster-image evidence.
      </p>
      {unsupported && (
        <div role="alert" className="mt-5 rounded-xl border border-warning/30 bg-warning/10 p-5">
          <h2 className="font-semibold">Searchable text is required for this MVP</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This result does not mean the drawing contains no equipment. Scanned-drawing OCR and
            computer-vision detection are planned for later phases.
          </p>
        </div>
      )}
      {!unsupported && (
        <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section
            aria-label="Source page preview"
            className="min-w-0 rounded-2xl border border-glass-border bg-card/40 p-4"
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={pageIndex === 0}
                onClick={() => setPageIndex((page) => page - 1)}
                className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
              >
                Previous page
              </button>
              <label className="text-sm">
                Page{" "}
                <input
                  aria-label="Page number"
                  type="number"
                  min={1}
                  max={result.pageCount}
                  value={pageIndex + 1}
                  onChange={(event) =>
                    setPageIndex(
                      Math.max(0, Math.min(result.pageCount - 1, Number(event.target.value) - 1)),
                    )
                  }
                  className="w-16 rounded border bg-background px-2 py-1"
                />{" "}
                of {result.pageCount}
              </label>
              <button
                type="button"
                disabled={pageIndex === result.pageCount - 1}
                onClick={() => setPageIndex((page) => page + 1)}
                className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
              >
                Next page
              </button>
            </div>
            {documentRef.current && (
              <ElectricalInspectorPageCanvas
                document={documentRef.current}
                pageIndex={pageIndex}
                records={records}
                selectedId={selectedId}
                onSelect={(id) => {
                  setSelectedId(id);
                  setTab("equipment");
                }}
              />
            )}
          </section>
          <section className="min-w-0">
            <div
              role="tablist"
              aria-label="Inspection results"
              className="flex overflow-x-auto border-b border-glass-border"
            >
              {(["equipment", "boq", "findings", "document"] as const).map((item) => (
                <button
                  key={item}
                  role="tab"
                  aria-selected={tab === item}
                  onClick={() => setTab(item)}
                  className={`px-4 py-3 text-sm capitalize ${tab === item ? "border-b-2 border-primary font-semibold" : "text-muted-foreground"}`}
                >
                  {item}
                </button>
              ))}
            </div>
            <div role="tabpanel" className="mt-4 min-w-0">
              {tab === "equipment" && (
                <>
                  <div className="flex flex-wrap gap-2">
                    <input
                      aria-label="Search equipment locally"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search IDs or ratings"
                      className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
                    />
                    <select
                      aria-label="Filter by status"
                      value={statusFilter}
                      onChange={(event) =>
                        setStatusFilter(event.target.value as ReviewStatus | "all")
                      }
                      className="rounded-lg border bg-background px-3 py-2 text-sm"
                    >
                      <option value="all">All statuses</option>
                      <option value="review">Review</option>
                      <option value="accepted">Accepted</option>
                      <option value="rejected">Rejected</option>
                    </select>
                    <button
                      type="button"
                      onClick={addManual}
                      className="rounded-lg border px-3 py-2 text-sm"
                    >
                      Add equipment manually
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() =>
                        setRecords((current) =>
                          current.map((record) =>
                            visible.some((item) => item.id === record.id)
                              ? { ...record, status: "accepted" }
                              : record,
                          ),
                        )
                      }
                      className="rounded border px-2 py-1"
                    >
                      Accept all visible
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setRecords((current) =>
                          current.map((record) =>
                            visible.some((item) => item.id === record.id)
                              ? { ...record, status: "rejected" }
                              : record,
                          ),
                        )
                      }
                      className="rounded border px-2 py-1"
                    >
                      Reject all visible
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setRecords((current) =>
                          current.map((record) =>
                            record.confidence === "high"
                              ? { ...record, status: "accepted" }
                              : record,
                          ),
                        )
                      }
                      className="rounded border px-2 py-1"
                    >
                      Accept all high-confidence
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setRecords((current) =>
                          current.map((record) => ({ ...record, status: "review" })),
                        )
                      }
                      className="rounded border px-2 py-1"
                    >
                      Reset review decisions
                    </button>
                  </div>
                  <div className="mt-4 max-h-[650px] space-y-3 overflow-y-auto">
                    {visible.map((record, index) => (
                      <article
                        key={record.id}
                        tabIndex={0}
                        onFocus={() => {
                          setSelectedId(record.id);
                          setPageIndex(record.pageIndex);
                        }}
                        className={`rounded-xl border p-4 ${selectedId === record.id ? "border-warning" : "border-glass-border"}`}
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span>Record {index + 1}</span>
                          <span>{record.source === "manual" ? "Manual" : "Detected"}</span>
                          <span>Status: {record.status}</span>
                          <span>Confidence: {record.confidence}</span>
                          <span>Page {record.pageIndex + 1}</span>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <select
                            aria-label={`Record ${index + 1} equipment type`}
                            value={record.equipmentType}
                            onChange={(event) =>
                              updateRecord(record.id, {
                                equipmentType: event.target.value as EquipmentType,
                              })
                            }
                            className="rounded border bg-background px-2 py-2 text-sm"
                          >
                            {EQUIPMENT_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </select>
                          <input
                            aria-label={`Record ${index + 1} equipment ID`}
                            value={record.equipmentId}
                            maxLength={120}
                            onChange={(event) =>
                              updateRecord(record.id, { equipmentId: event.target.value })
                            }
                            placeholder="Equipment ID"
                            className="rounded border bg-background px-2 py-2 text-sm"
                          />
                          <input
                            aria-label={`Record ${index + 1} description`}
                            value={record.description}
                            maxLength={240}
                            onChange={(event) =>
                              updateRecord(record.id, { description: event.target.value })
                            }
                            placeholder="Description"
                            className="rounded border bg-background px-2 py-2 text-sm"
                          />
                          <input
                            aria-label={`Record ${index + 1} principal rating`}
                            value={
                              record.apparentPower ||
                              record.voltage ||
                              record.voltageRatio ||
                              record.activePower
                            }
                            maxLength={120}
                            onChange={(event) =>
                              updateRecord(record.id, { apparentPower: event.target.value })
                            }
                            placeholder="Principal rating"
                            className="rounded border bg-background px-2 py-2 text-sm"
                          />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => updateRecord(record.id, { status: "accepted" })}
                            className="rounded border px-2 py-1 text-xs"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => updateRecord(record.id, { status: "rejected" })}
                            className="rounded border px-2 py-1 text-xs"
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setRecords((current) =>
                                current.filter((item) => item.id !== record.id),
                              )
                            }
                            className="rounded border px-2 py-1 text-xs"
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
              {tab === "boq" && (
                <div>
                  <label className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={includeReview}
                      onChange={(event) => setIncludeReview(event.target.checked)}
                    />
                    Include unreviewed records in preview
                  </label>
                  <h2 className="mt-4 text-xl font-semibold">Draft BOQ</h2>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead>
                        <tr>
                          <th>Equipment type</th>
                          <th>Rating summary</th>
                          <th>Quantity</th>
                          <th>Source pages</th>
                        </tr>
                      </thead>
                      <tbody>
                        {boq.map((row) => (
                          <tr key={`${row.equipmentType}-${row.ratingSummary}`}>
                            <td>{row.equipmentType}</td>
                            <td>{row.ratingSummary}</td>
                            <td>{row.quantity}</td>
                            <td>{row.sourcePages.join(", ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {tab === "findings" && (
                <div>
                  <h2 className="text-xl font-semibold">Review findings ({findings.length})</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Deterministic extraction checks only; these are not engineering judgments.
                  </p>
                  <div className="mt-4 space-y-3">
                    {findings.map((finding) => (
                      <button
                        type="button"
                        key={finding.id}
                        onClick={() => {
                          const related = records.find((record) =>
                            finding.relatedRecordIds.includes(record.id),
                          );
                          if (related) {
                            setSelectedId(related.id);
                            setPageIndex(related.pageIndex);
                          }
                        }}
                        className="block w-full rounded-xl border p-4 text-left"
                      >
                        <span className="text-xs uppercase">
                          {finding.severity} · {finding.category}
                        </span>
                        <p className="mt-1 text-sm">{finding.message}</p>
                        {finding.pages.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            Pages {finding.pages.join(", ")}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {tab === "document" && (
                <div>
                  <h2 className="text-xl font-semibold">Document evidence</h2>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div>
                      <dt className="text-xs text-muted-foreground">Classification</dt>
                      <dd>{result.classification}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Searchable text items</dt>
                      <dd>{result.pages.reduce((sum, page) => sum + page.textItemCount, 0)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Vector operations</dt>
                      <dd>
                        {result.pages.reduce((sum, page) => sum + page.vectorOperationCount, 0)}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-5 text-sm text-muted-foreground">
                    Label-based extraction only. Raster regions, symbol geometry, network topology,
                    OCR, and engineering calculations are outside this MVP.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
      <p className="mt-8 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-muted-foreground">
        {NOTICE}
      </p>
    </div>
  );
}
