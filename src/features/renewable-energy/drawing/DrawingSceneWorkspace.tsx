import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { serializeDraflioScene } from "../../../../shared/renewableEnergy/draflioSceneSerialization";
import { drawingToDraflioScene } from "../../../../shared/renewableEnergy/drawing/drawingSceneConversion";
import {
  cleanExtractedPaths,
  createCalibration,
} from "../../../../shared/renewableEnergy/drawing/drawingCore";
import {
  DRAWING_LIMITS,
  type Calibration,
  type DrawingExtraction,
  type DrawingPath,
  type DrawingPoint,
  type ManualClassification,
  type ReviewState,
} from "../../../../shared/renewableEnergy/drawing/drawingTypes";
import { Breadcrumbs, RenewablePage, StatusBadge } from "../RenewableShell";
import { SceneFoundationWorkspace } from "../scene/SceneFoundationWorkspace";
import { Drawing3DPreview } from "./Drawing3DPreview";
import { pagePointToOverlay } from "../../../../shared/renewableEnergy/drawing/drawingPreviewCore";
import { inspectDrawingPdf, type LoadedDrawing } from "./drawingPdfClient";

const button =
  "rounded-xl border border-glass-border bg-card px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const input =
  "mt-1 w-full rounded-lg border border-glass-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function DrawingSceneWorkspace() {
  const [mode, setMode] = useState<"pdf" | "json">("pdf");
  if (mode === "json")
    return (
      <>
        <button className={`${button} fixed right-4 top-24 z-50`} onClick={() => setMode("pdf")}>
          Return to vector PDF extraction
        </button>
        <SceneFoundationWorkspace />
      </>
    );
  return <VectorDrawingWorkspace onJson={() => setMode("json")} />;
}

function VectorDrawingWorkspace({ onJson }: { onJson: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [loaded, setLoaded] = useState<LoadedDrawing | null>(null);
  const [extraction, setExtraction] = useState<DrawingExtraction | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calibrationPoints, setCalibrationPoints] = useState<DrawingPoint[]>([]);
  const [distance, setDistance] = useState("");
  const [unit, setUnit] = useState<Calibration["unit"]>("m");
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"2d" | "3d">("2d");
  const [mergeCollinear, setMergeCollinear] = useState(false);
  const [angularTolerance, setAngularTolerance] = useState("0.25");
  const [gapTolerance, setGapTolerance] = useState("0.1");
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const urls = useRef<string[]>([]);
  const importedAt = useRef("");
  useEffect(
    () => () => {
      controller.current?.abort();
      void loaded?.loadingTask.destroy();
      urls.current.forEach(URL.revokeObjectURL);
    },
    [loaded],
  );

  const cancel = () => {
    generation.current += 1;
    controller.current?.abort();
    controller.current = null;
    setLoaded(null);
    setExtraction(null);
    setProgress("Cancelled safely");
    setError(null);
  };
  const choose = async (selected: File) => {
    cancel();
    const current = generation.current;
    setFile(selected);
    setProgress("Reading browser-local PDF");
    setError(null);
    setCalibration(null);
    setCalibrationPoints([]);
    try {
      if (
        selected.type !== "application/pdf" ||
        selected.size <= 0 ||
        selected.size > DRAWING_LIMITS.maxFileBytes
      )
        throw new Error("Select a non-empty PDF no larger than 25 MB.");
      const bytes = new Uint8Array(await selected.arrayBuffer());
      if (current !== generation.current) return;
      const active = new AbortController();
      controller.current = active;
      const result = await inspectDrawingPdf(bytes, null, active.signal, setProgress);
      if (current !== generation.current) {
        await result.loadingTask.destroy();
        return;
      }
      importedAt.current = new Date().toISOString();
      setLoaded(result);
      setExtraction(result.extraction);
      setPageNumber(result.extraction.pages[0]?.pageNumber ?? 1);
      setPageInput(String(result.extraction.pages[0]?.pageNumber ?? 1));
      setProgress("Extraction complete — engineer review required");
      controller.current = null;
    } catch (caught) {
      if (current !== generation.current) return;
      setError(
        caught instanceof DOMException && caught.name === "AbortError"
          ? "Processing was cancelled."
          : caught instanceof Error
            ? caught.message
            : "The PDF could not be inspected safely.",
      );
      setProgress(null);
    }
  };
  const updatePath = (id: string, update: Partial<DrawingPath>) => {
    setExtraction((current) =>
      current
        ? {
            ...current,
            paths: current.paths.map((path) => (path.id === id ? { ...path, ...update } : path)),
          }
        : current,
    );
  };
  const recalculateCleanup = (enabled: boolean, angle: string, gap: string) => {
    setExtraction((current) => {
      if (!current) return current;
      try {
        const cleaned = cleanExtractedPaths(current.originalPaths, {
          mergeCollinear: enabled,
          angularToleranceDegrees: Number(angle),
          gapTolerancePoints: Number(gap),
        });
        setCalibration((value) => (value ? { ...value, confirmed: false } : value));
        setSelectedId(null);
        setError(null);
        return { ...current, ...cleaned };
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Cleanup configuration is invalid.");
        return current;
      }
    });
  };
  const calibrate = () => {
    try {
      if (calibrationPoints.length !== 2) throw new Error("Select two points on the page.");
      const next = createCalibration({
        pageNumber,
        first: calibrationPoints[0],
        second: calibrationPoints[1],
        enteredDistance: Number(distance),
        unit,
        revision: (calibration?.revision ?? 0) + 1,
      });
      setCalibration(next);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Calibration is invalid.");
    }
  };
  const startOver = () => {
    cancel();
    void loaded?.loadingTask.destroy();
    urls.current.forEach(URL.revokeObjectURL);
    urls.current = [];
    setFile(null);
    setExtraction(null);
    setCalibration(null);
    setCalibrationPoints([]);
    setDistance("");
    setSelectedId(null);
    setProgress(null);
  };
  const download = (kind: "scene" | "review") => {
    if (!file || !extraction) return;
    try {
      const content =
        kind === "scene"
          ? serializeDraflioScene(
              drawingToDraflioScene({
                sourceName: file.name,
                importedAt: importedAt.current,
                extraction,
                calibration: requireConfirmed(calibration),
              }),
            )
          : `${JSON.stringify({ extraction, calibration }, null, 2)}\n`;
      const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
      urls.current.push(url);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeName(file.name)}-${kind}.json`;
      link.click();
      queueMicrotask(() => {
        URL.revokeObjectURL(url);
        urls.current = urls.current.filter((item) => item !== url);
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Download could not be prepared.");
    }
  };
  const accepted = extraction?.paths.filter((path) => path.reviewState === "accepted") ?? [];
  const selected = extraction?.paths.find((path) => path.id === selectedId) ?? null;
  const sceneReady = Boolean(calibration?.confirmed && accepted.length);
  const selectPage = (next: number) => {
    if (!extraction || !Number.isInteger(next) || next < 1 || next > extraction.pages.length) {
      setError(`Page number must be between 1 and ${extraction?.pages.length ?? 1}.`);
      setPageInput(String(pageNumber));
      return;
    }
    setPageNumber(next);
    setPageInput(String(next));
    setCalibrationPoints([]);
    setSelectedId(null);
    setError(null);
  };
  return (
    <RenewablePage>
      <Breadcrumbs
        items={[
          { label: "Renewable Energy", to: "/renewable-energy" },
          { label: "Solar PV", to: "/renewable-energy/solar" },
          { label: "Drawing-to-Scene" },
        ]}
      />
      <section className="border-b border-glass-border bg-gradient-to-br from-primary/10 to-transparent py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <StatusBadge>VECTOR PDF TECHNICAL PREVIEW</StatusBadge>
          <h1 className="mt-4 text-4xl font-bold">Vector PDF Drawing-to-Scene</h1>
          <p className="mt-4 max-w-3xl text-muted-foreground">
            Browser-local extraction of supported PDF vector paths into a manually calibrated,
            engineer-reviewed planar scene. Raster recognition, semantic recognition, height
            inference, and arbitrary PDF-to-3D conversion are not active.
          </p>
          <button className={`${button} mt-5`} onClick={onJson}>
            Open DraflioScene JSON validation
          </button>
        </div>
      </section>
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-glass-border bg-card/50 p-6">
          <h2 className="text-xl font-semibold">1. Import vector PDF</h2>
          <label className="mt-4 block text-sm font-medium">
            Browser-local PDF
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="mt-2 block w-full text-sm"
              onChange={(event) => {
                const selectedFile = event.target.files?.[0];
                if (selectedFile) void choose(selectedFile);
              }}
            />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">
            Maximum 25 MB and 100 document pages. One page preview is rendered at a time; every
            accepted page remains directly selectable.
          </p>
          {progress && (
            <p aria-live="polite" className="mt-4 text-sm">
              {progress}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-destructive/10 p-4 text-sm">
              {error}
            </p>
          )}
          {controller.current && (
            <button className={`${button} mt-4`} onClick={cancel}>
              Cancel processing
            </button>
          )}
        </section>
        {extraction && loaded && (
          <>
            <section className="rounded-2xl border border-glass-border bg-card/50 p-6">
              <h2 className="text-xl font-semibold">2. Page selection and classification</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className={button}
                  disabled={pageNumber <= 1}
                  onClick={() => selectPage(pageNumber - 1)}
                >
                  Previous page
                </button>
                <label className="text-sm">
                  Page number
                  <input
                    className={`${input} w-28`}
                    type="number"
                    min="1"
                    max={extraction.pages.length}
                    value={pageInput}
                    onChange={(event) => setPageInput(event.target.value)}
                    onBlur={() => selectPage(Number(pageInput))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") selectPage(Number(pageInput));
                    }}
                  />
                </label>
                <button
                  className={button}
                  disabled={pageNumber >= extraction.pages.length}
                  onClick={() => selectPage(pageNumber + 1)}
                >
                  Next page
                </button>
                <p aria-live="polite" className="self-center text-sm">
                  Page {pageNumber} of {extraction.pages.length}:{" "}
                  {extraction.pages[pageNumber - 1]?.classification}
                </p>
              </div>
              {extraction.pages
                .filter((page) => page.pageNumber === pageNumber)
                .map((page) => (
                  <dl key={page.pageNumber} className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="font-semibold">Classification</dt>
                      <dd>
                        {page.classification}: {page.explanation}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Page</dt>
                      <dd>
                        {page.pageNumber}; {page.width.toFixed(1)} × {page.height.toFixed(1)} pt
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Rotation</dt>
                      <dd>{page.rotation}°</dd>
                    </div>
                  </dl>
                ))}
            </section>
            <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="rounded-2xl border border-glass-border bg-card/50 p-5">
                <h2 className="text-xl font-semibold">3. PDF and extracted geometry review</h2>
                <DrawingPagePreview
                  document={loaded.document}
                  pageNumber={pageNumber}
                  paths={extraction.paths}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onCalibrationPoint={(point) =>
                    setCalibrationPoints((current) =>
                      current.length >= 2 ? [point] : [...current, point],
                    )
                  }
                />
              </div>
              <aside className="space-y-5 rounded-2xl border border-glass-border bg-card/50 p-5">
                <h2 className="text-xl font-semibold">Manual calibration</h2>
                <p className="text-sm text-muted-foreground">
                  Click two page points, enter the known real distance, then review and confirm. PDF
                  points are never assumed to be metres.
                </p>
                <p className="text-sm">Selected points: {calibrationPoints.length}/2</p>
                <label className="block text-sm">
                  Known distance
                  <input
                    className={input}
                    value={distance}
                    onChange={(event) => setDistance(event.target.value)}
                    inputMode="decimal"
                  />
                </label>
                <label className="block text-sm">
                  Unit
                  <select
                    className={input}
                    value={unit}
                    onChange={(event) => setUnit(event.target.value as Calibration["unit"])}
                  >
                    <option value="m">metres</option>
                    <option value="ft">feet</option>
                    <option value="mm">millimetres</option>
                  </select>
                </label>
                <button className={button} onClick={calibrate}>
                  Calculate calibration
                </button>
                {calibration && (
                  <div className="rounded-xl bg-background/60 p-4 text-sm">
                    <p>{calibration.metresPerPoint.toPrecision(8)} metres per PDF point</p>
                    <p>
                      Source page {calibration.pageNumber}; revision {calibration.revision}
                    </p>
                    <button
                      className={`${button} mt-3`}
                      onClick={() => setCalibration({ ...calibration, confirmed: true })}
                    >
                      Confirm calibration
                    </button>
                  </div>
                )}
              </aside>
            </section>
            <section className="rounded-2xl border border-glass-border bg-card/50 p-6">
              <h2 className="text-xl font-semibold">4. Engineer review decisions</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                No extracted object is engineering-approved automatically. Accepting only includes
                planar geometry in the draft scene; it does not verify semantic meaning.
              </p>
              <p className="mt-3 text-sm">
                {extraction.paths.length} objects · {accepted.length} accepted ·{" "}
                {extraction.findings.length} cleanup findings
              </p>
              <div className="mt-4 grid gap-3 rounded-xl bg-background/60 p-4 sm:grid-cols-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={mergeCollinear}
                    onChange={(event) => {
                      setMergeCollinear(event.target.checked);
                      recalculateCleanup(event.target.checked, angularTolerance, gapTolerance);
                    }}
                  />
                  Merge contiguous collinear segments
                </label>
                <label className="text-sm">
                  Angular tolerance (degrees)
                  <input
                    className={input}
                    value={angularTolerance}
                    onChange={(event) => setAngularTolerance(event.target.value)}
                    onBlur={() =>
                      recalculateCleanup(mergeCollinear, angularTolerance, gapTolerance)
                    }
                  />
                </label>
                <label className="text-sm">
                  Gap tolerance (PDF points)
                  <input
                    className={input}
                    value={gapTolerance}
                    onChange={(event) => setGapTolerance(event.target.value)}
                    onBlur={() =>
                      recalculateCleanup(mergeCollinear, angularTolerance, gapTolerance)
                    }
                  />
                </label>
                <p className="text-xs text-muted-foreground sm:col-span-3">
                  Default: disabled. Cleanup is confined to contiguous segments in each original
                  source path. It never merges separate paths. Segments before/after:{" "}
                  {extraction.cleanup.beforeSegmentCount}/{extraction.cleanup.afterSegmentCount};
                  recorded merges: {extraction.cleanup.merges.length}.
                </p>
              </div>
              {selected ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <dl className="rounded-xl bg-background/60 p-4 text-sm">
                    <dt className="font-semibold">{selected.id}</dt>
                    <dd>Page {selected.pageNumber}</dd>
                    <dd>
                      {selected.points.length} points; {selected.closed ? "closed" : "open"}
                    </dd>
                    <dd>State: {selected.reviewState}</dd>
                  </dl>
                  <div>
                    <label className="block text-sm">
                      Engineer classification
                      <select
                        className={input}
                        value={selected.classification}
                        onChange={(event) =>
                          updatePath(selected.id, {
                            classification: event.target.value as ManualClassification,
                          })
                        }
                      >
                        {classifications.map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(
                        [
                          "accepted",
                          "excluded",
                          "unresolved",
                          "extracted-review-required",
                        ] as ReviewState[]
                      ).map((state) => (
                        <button
                          key={state}
                          className={button}
                          onClick={() => updatePath(selected.id, { reviewState: state })}
                        >
                          {state === "extracted-review-required" ? "Restore to review" : state}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm">Select an overlay path to review it.</p>
              )}
              <ul className="mt-4 space-y-2 text-sm">
                {extraction.findings.map((finding, index) => (
                  <li key={`${finding.code}-${index}`} className="rounded-lg bg-warning/10 p-3">
                    {finding.code}: {finding.message}
                  </li>
                ))}
              </ul>
            </section>
            <div className="flex gap-2" role="group" aria-label="Drawing preview mode">
              <button
                className={button}
                aria-pressed={previewMode === "2d"}
                onClick={() => setPreviewMode("2d")}
              >
                2D review
              </button>
              <button
                className={button}
                disabled={!sceneReady}
                aria-pressed={previewMode === "3d"}
                onClick={() => setPreviewMode("3d")}
              >
                3D planar review
              </button>
            </div>
            {previewMode === "3d" && calibration?.confirmed && (
              <Drawing3DPreview paths={extraction.paths} calibration={calibration} />
            )}
            <section className="flex flex-wrap gap-3 rounded-2xl border border-glass-border bg-card/50 p-6">
              <button className={button} disabled={!sceneReady} onClick={() => download("scene")}>
                Download validated DraflioScene
              </button>
              <button className={button} onClick={() => download("review")}>
                Download extraction review JSON
              </button>
              <button className={button} onClick={startOver}>
                Start over
              </button>
            </section>
          </>
        )}
      </main>
    </RenewablePage>
  );
}

function DrawingPagePreview(props: {
  document: PDFDocumentProxy;
  pageNumber: number;
  paths: DrawingPath[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCalibrationPoint: (point: DrawingPoint) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderTask = useRef<RenderTask | null>(null);
  const [dimensions, setDimensions] = useState({ width: 1, height: 1 });
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    let active = true;
    void (async () => {
      const page = await props.document.getPage(props.pageNumber);
      const viewport = page.getViewport({ scale: Math.min(2, zoom), rotation: page.rotate });
      if (!active || !canvas.current) return;
      const context = canvas.current.getContext("2d", { alpha: false });
      if (!context) return;
      canvas.current.width = Math.min(viewport.width, DRAWING_LIMITS.maxPreviewDimension);
      canvas.current.height = Math.min(viewport.height, DRAWING_LIMITS.maxPreviewDimension);
      canvas.current.style.aspectRatio = `${viewport.width}/${viewport.height}`;
      setDimensions({ width: viewport.width, height: viewport.height });
      renderTask.current = page.render({
        canvas: canvas.current,
        canvasContext: context,
        viewport,
      });
      try {
        await renderTask.current.promise;
      } catch {
        /* cancellation is expected */
      }
    })();
    return () => {
      active = false;
      renderTask.current?.cancel();
    };
  }, [props.document, props.pageNumber, zoom]);
  const pagePaths = props.paths.filter((path) => path.pageNumber === props.pageNumber);
  return (
    <>
      <div className="my-3 flex gap-2">
        <button className={button} onClick={() => setZoom((value) => Math.max(0.5, value / 1.25))}>
          Zoom out
        </button>
        <button className={button} onClick={() => setZoom(1)}>
          Fit page
        </button>
        <button className={button} onClick={() => setZoom((value) => Math.min(2, value * 1.25))}>
          Zoom in
        </button>
      </div>
      <div
        className="relative mx-auto max-w-full overflow-auto bg-white"
        style={{ width: dimensions.width * zoom }}
      >
        <canvas
          ref={canvas}
          aria-label={`PDF page ${props.pageNumber} preview`}
          className="block h-auto w-full"
        />
        <svg
          role="img"
          aria-label={`Extracted vector overlay for page ${props.pageNumber}`}
          viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
          className="absolute inset-0 h-full w-full"
          onDoubleClick={(event) => {
            const rectangle = event.currentTarget.getBoundingClientRect();
            props.onCalibrationPoint({
              x: ((event.clientX - rectangle.left) / rectangle.width) * dimensions.width,
              y: ((event.clientY - rectangle.top) / rectangle.height) * dimensions.height,
            });
          }}
        >
          {pagePaths.map((path) => (
            <polyline
              key={path.id}
              points={path.points
                .map((point) => pagePointToOverlay(point, dimensions))
                .map((point) => `${point.x},${point.y}`)
                .join(" ")}
              fill={path.closed ? "rgba(34,197,94,.08)" : "none"}
              stroke={
                path.id === props.selectedId
                  ? "#f97316"
                  : path.reviewState === "accepted"
                    ? "#16a34a"
                    : path.reviewState === "excluded"
                      ? "#dc2626"
                      : "#2563eb"
              }
              strokeWidth={path.id === props.selectedId ? 3 : 1.5}
              vectorEffect="non-scaling-stroke"
              tabIndex={0}
              aria-label={`${path.id}, ${path.reviewState}`}
              onClick={() => props.onSelect(path.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") props.onSelect(path.id);
              }}
            />
          ))}
        </svg>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Select geometry with click or keyboard. Double-click two points for scale calibration.
        Raster pixels are preview only and never converted to geometry.
      </p>
    </>
  );
}

const classifications: ManualClassification[] = [
  "unclassified",
  "site-boundary-candidate",
  "exclusion-zone-candidate",
  "road-candidate",
  "building-candidate",
  "array-area-candidate",
  "equipment-candidate",
  "annotation",
  "reference-geometry",
];
function requireConfirmed(value: Calibration | null) {
  if (!value?.confirmed) throw new Error("Confirm manual calibration before scene download.");
  return value;
}
function safeName(value: string) {
  return (
    value
      .replace(/\.pdf$/i, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .slice(0, 100) || "drawing"
  );
}
