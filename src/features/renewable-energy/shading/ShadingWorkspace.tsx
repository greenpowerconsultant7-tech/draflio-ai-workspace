import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Pause, Play, RotateCcw, Upload } from "lucide-react";
import type { LayoutReview } from "../../../../shared/renewableEnergy/layout/layoutTypes";
import type { TerrainMesh } from "../../../../shared/renewableEnergy/terrain/terrainTypes";
import {
  createShading2DTransform,
  hitTestPoints,
  hitTestPolygons,
  projectHitRadius,
  screenToProject,
} from "../../../../shared/renewableEnergy/shading/shading2D";
import {
  buildTerrainSpatialIndex,
  buildObstructionShadowIndex,
  buildTableSpatialIndex,
  calculateSunPosition,
  combineDomainFindings,
  createObstruction,
  duplicateObstruction,
  editObstruction,
  evaluateHorizon,
  evaluateIndexedRowShading,
  evaluateIndexedObstructions,
  evaluateTerrainShading,
  excludeObstruction,
  normalizeHorizon,
  restoreObstruction,
  reviewObstruction,
  shadingReviewBlockers,
  tableSamples,
  transitionShadingReview,
  validateProject,
} from "../../../../shared/renewableEnergy/shading/shadingCore";
import {
  findingsCsv,
  createShadingSceneCompanion,
  safeShadingFilename,
  serializeShadingReview,
  serializeShadingSceneCompanion,
  timeRangeSummaryCsv,
} from "../../../../shared/renewableEnergy/shading/shadingSerialization";
import {
  acceptDraflioShadingSource,
  acceptDrawingObstructionSource,
  reviewDraflioShadingSource,
  reviewDrawingObstructionSource,
  type DraflioSourceImportReview,
  type DrawingObstructionImportReview,
} from "../../../../shared/renewableEnergy/shading/shadingImports";
import {
  SHADING_LIMITS,
  SHADING_SCHEMA_NAME,
  SHADING_SCHEMA_VERSION,
  SHADING_RULE_VERSION,
  type HorizonPoint,
  type Obstruction,
  type ProjectTime,
  type ShadingFinding,
  type ShadingReview,
  type SunPosition,
  type TimeRangeResponse,
  type TimeRangeSummary,
  type ReviewStatus,
  type ReviewTransition,
} from "../../../../shared/renewableEnergy/shading/shadingTypes";
import {
  validateLayoutReview,
  validateObstructions,
  validateTerrainMesh,
  validateTimeRangeResponse,
} from "../../../../shared/renewableEnergy/shading/shadingValidation";
import { BackLink, Breadcrumbs, RenewablePage, StatusBadge } from "../RenewableShell";
import { ShadingReview3D } from "./ShadingReview3D";

const defaultProject: ProjectTime = {
  latitudeDegrees: NaN,
  longitudeDegrees: NaN,
  timezone: "",
  daylightSaving: "iana-rules",
  projectNorthDegrees: 0,
};
const numberValue = (value: string) => (value.trim() === "" ? NaN : Number(value));
const emptyObstructionForm = () => ({
  id: "",
  classification: "building-box" as Obstruction["classification"],
  footprint: "",
  height: "",
  baseElevation: "",
  source: "",
  notes: "",
  uncertainty: "0",
  provenance: "",
});
const parseCoordinatePairs = (value: string) =>
  value
    .split(";")
    .filter((item) => item.trim())
    .map((item) => {
      const [x, y] = item.split(",").map((part) => Number(part.trim()));
      return { x, y };
    });
const formFromObstruction = (item: Obstruction) => ({
  id: item.id,
  classification: item.classification,
  footprint: item.footprint.map((point) => `${point.x},${point.y}`).join("; "),
  height: String(item.heightMeters),
  baseElevation: String(item.baseElevationMeters),
  source: item.source,
  notes: item.notes,
  uncertainty: String(item.uncertaintyMeters),
  provenance: item.provenance,
});
const boundsOf = (points: readonly { x: number; y: number }[]) =>
  points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );
const formatInteger = (value: number) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export function ShadingWorkspace() {
  const [layout, setLayout] = useState<LayoutReview>();
  const [projectReference, setProjectReference] = useState("");
  const [sourceImportReview, setSourceImportReview] = useState<DraflioSourceImportReview>();
  const [drawingImportReview, setDrawingImportReview] = useState<DrawingObstructionImportReview>();
  const [terrain, setTerrain] = useState<TerrainMesh>();
  const [noDataGeometry, setNoDataGeometry] = useState<
    NonNullable<NonNullable<DraflioSourceImportReview["source"]["terrain"]>["noDataGeometry"]>
  >([]);
  const [obstructions, setObstructions] = useState<Obstruction[]>([]);
  const [enabledDomains, setEnabledDomains] = useState({
    rowToRow: true,
    terrain: true,
    horizon: true,
    obstruction: true,
  });
  const [obstructionForm, setObstructionForm] = useState({
    id: "",
    classification: "building-box" as Obstruction["classification"],
    footprint: "",
    height: "",
    baseElevation: "",
    source: "",
    notes: "",
    uncertainty: "0",
    provenance: "",
  });
  const [editingObstructionId, setEditingObstructionId] = useState<string>();
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string>();
  const [project, setProject] = useState<ProjectTime>(defaultProject);
  const [timestamp, setTimestamp] = useState("2024-06-21T12:00");
  const [start, setStart] = useState("2024-06-21T08:00");
  const [end, setEnd] = useState("2024-06-21T16:00");
  const [step, setStep] = useState(30);
  const [horizonText, setHorizonText] = useState(
    "0,0\n45,0\n90,0\n135,0\n180,0\n225,0\n270,0\n315,0",
  );
  const [findings, setFindings] = useState<ShadingFinding[]>([]);
  const [status, setStatus] = useState(
    "Import a reviewed RE6A layout and enter explicit project location and time.",
  );
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [timeSummary, setTimeSummary] = useState<TimeRangeSummary>();
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("draft");
  const [reviewHistory, setReviewHistory] = useState<ReviewTransition[]>([]);
  const [stale, setStale] = useState(true);
  const [cancelled, setCancelled] = useState(false);
  const [workerValidationFailed, setWorkerValidationFailed] = useState(false);
  const [exportValidationFailed, setExportValidationFailed] = useState(false);
  const activeGenerationRef = useRef(0);
  const [playbackTimestamp, setPlaybackTimestamp] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const playbackTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const playbackGenerationRef = useRef(0);
  const urls = useRef(new Set<string>());
  const urlCleanupTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const horizons = useMemo(() => parseHorizon(horizonText), [horizonText]);
  const terrainIndex = useMemo(
    () => (terrain ? buildTerrainSpatialIndex(terrain) : undefined),
    [terrain],
  );
  const sun = useMemo(() => {
    try {
      validateProject(project);
      return calculateSunPosition(localInputToInstant(timestamp, project), project);
    } catch {
      return undefined;
    }
  }, [project, timestamp]);
  const availableTimestamps = useMemo(
    () => [...new Set(findings.map((finding) => finding.timestamp))].sort(),
    [findings],
  );
  const activeTimestamp = playbackTimestamp ?? availableTimestamps[0];
  const displayedFindings = activeTimestamp
    ? findings.filter((finding) => finding.timestamp === activeTimestamp)
    : findings;

  const stopPlayback = () => {
    playbackGenerationRef.current += 1;
    if (playbackTimerRef.current !== undefined) clearInterval(playbackTimerRef.current);
    playbackTimerRef.current = undefined;
    setPlaying(false);
  };

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      playbackGenerationRef.current += 1;
      if (playbackTimerRef.current !== undefined) clearInterval(playbackTimerRef.current);
      for (const timer of urlCleanupTimers.current) clearTimeout(timer);
      for (const url of urls.current) URL.revokeObjectURL(url);
    },
    [],
  );
  const importLayout = async (file: File) => {
    try {
      if (file.size > SHADING_LIMITS.maxSceneBytes)
        throw new Error("File exceeds the 10 MB scene limit.");
      const value: unknown = JSON.parse(await file.text());
      const validated = validateLayoutReview(value);
      if (
        !["reviewed", "valid-with-warnings", "approved-for-preliminary-draflio-workflow"].includes(
          validated.reviewStatus,
        )
      )
        throw new Error("Layout must be reviewed or valid with warnings before shading.");
      setLayout(validated);
      invalidate(
        `Validated ${validated.tables.length} immutable table records; prior results and playback invalidated.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed safely.");
    }
  };
  const reviewSceneSource = async (file: File) => {
    try {
      if (file.size > SHADING_LIMITS.maxSceneBytes)
        throw new Error("File exceeds the 10 MB scene limit.");
      if (!projectReference.trim()) throw new Error("Enter the exact project reference first.");
      const pending = reviewDraflioShadingSource(
        JSON.parse(await file.text()) as unknown,
        projectReference.trim(),
      );
      setSourceImportReview(pending);
      setStatus("Compatible source reviewed. Explicit engineer confirmation is required.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "DraflioScene import failed safely.");
    }
  };
  const confirmSceneSource = () => {
    if (!sourceImportReview) return;
    const source = acceptDraflioShadingSource(sourceImportReview, true);
    workerRef.current?.terminate();
    setLayout(structuredClone(source.layoutReview));
    setTerrain(source.terrain ? structuredClone(source.terrain.mesh) : undefined);
    setNoDataGeometry(structuredClone(source.terrain?.noDataGeometry ?? []));
    setSourceImportReview(undefined);
    invalidate(
      `Accepted immutable DraflioScene ${source.sourceSceneReference}; all previous results, review, approval, exports, and playback are invalidated.`,
    );
  };
  const reviewDrawingSource = async (file: File) => {
    try {
      if (file.size > SHADING_LIMITS.maxSceneBytes)
        throw new Error("File exceeds the 10 MB scene limit.");
      if (!projectReference.trim()) throw new Error("Enter the exact project reference first.");
      const pending = reviewDrawingObstructionSource(
        JSON.parse(await file.text()) as unknown,
        projectReference.trim(),
        obstructions.map((item) => item.id),
        terrain ? ["active-verified-terrain"] : [],
      );
      setDrawingImportReview(pending);
      setStatus("Drawing obstruction source reviewed. Explicit engineer confirmation is required.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Drawing obstruction import failed safely.",
      );
    }
  };
  const confirmDrawingSource = () => {
    if (!drawingImportReview) return;
    const imported = acceptDrawingObstructionSource(drawingImportReview, true);
    setObstructions((current) => [...current, ...imported]);
    setDrawingImportReview(undefined);
    invalidate(
      `Accepted ${imported.length} Drawing-to-Scene obstructions as draft; RE7A review is required before calculation.`,
    );
  };
  const importTerrain = async (file: File) => {
    try {
      if (file.size > SHADING_LIMITS.maxSceneBytes) throw new Error("Terrain file exceeds 10 MB.");
      const value: unknown = JSON.parse(await file.text());
      const mesh = validateTerrainMesh(value);
      setTerrain(mesh);
      invalidate("Validated and indexed immutable terrain; previous shading results invalidated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Terrain import failed safely.");
    }
  };
  const importObstructions = async (file: File) => {
    try {
      if (file.size > SHADING_LIMITS.maxSceneBytes)
        throw new Error("Obstruction file exceeds 10 MB.");
      const value: unknown = JSON.parse(await file.text());
      const records = validateObstructions(value);
      setObstructions(records);
      invalidate(
        `Validated ${records.length} immutable obstruction records; only reviewed records calculate.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Obstruction import failed safely.");
    }
  };
  const invalidate = (message: string) => {
    stopPlayback();
    workerRef.current?.terminate();
    workerRef.current = null;
    activeGenerationRef.current += 1;
    setFindings([]);
    setPlaybackTimestamp(undefined);
    setTimeSummary(undefined);
    setRunning(false);
    setProgress(0);
    setStatus(message);
    setStale(true);
    setReviewStatus("draft");
    setExportValidationFailed(false);
  };
  const saveObstruction = () => {
    try {
      const footprint = parseCoordinatePairs(obstructionForm.footprint);
      if (editingObstructionId) {
        const current = obstructions.find((item) => item.id === editingObstructionId);
        if (!current) throw new Error("The obstruction being edited no longer exists.");
        const updated = editObstruction(current, {
          classification: obstructionForm.classification,
          footprint,
          heightMeters: numberValue(obstructionForm.height),
          baseElevationMeters: numberValue(obstructionForm.baseElevation),
          source: obstructionForm.source,
          notes: obstructionForm.notes,
          uncertaintyMeters: numberValue(obstructionForm.uncertainty),
          provenance: obstructionForm.provenance,
        });
        setObstructions((items) =>
          items.map((item) => (item.id === editingObstructionId ? updated : item)),
        );
      } else {
        if (obstructions.some((item) => item.id === obstructionForm.id))
          throw new Error("Obstruction ID already exists.");
        const created = createObstruction({
          id: obstructionForm.id,
          classification: obstructionForm.classification,
          footprint,
          heightMeters: numberValue(obstructionForm.height),
          baseElevationMeters: numberValue(obstructionForm.baseElevation),
          source: obstructionForm.source,
          notes: obstructionForm.notes,
          uncertaintyMeters: numberValue(obstructionForm.uncertainty),
          provenance: obstructionForm.provenance,
          creationMethod: "manual",
        });
        setObstructions((items) => [...items, created].sort((a, b) => a.id.localeCompare(b.id)));
      }
      setEditingObstructionId(undefined);
      setObstructionForm(emptyObstructionForm());
      invalidate("Obstruction records changed; calculated results are stale.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Obstruction validation failed.");
    }
  };
  const replaceObstruction = (record: Obstruction, message: string) => {
    setObstructions((items) => items.map((item) => (item.id === record.id ? record : item)));
    invalidate(message);
  };
  const calculateSelected = () => {
    try {
      if (!layout) throw new Error("A validated layout is required.");
      validateProject(project);
      normalizeHorizon(horizons);
      if (!sun) throw new Error("Analysis timestamp is invalid.");
      const selected = layout.tables.slice(0, Math.min(20, layout.tables.length));
      const selectedIds = new Set(selected.map((table) => table.id));
      const index = buildTableSpatialIndex(layout.tables);
      const obstructionIndex = buildObstructionShadowIndex(
        obstructions,
        sun,
        project.projectNorthDegrees,
      );
      const rowFindings = enabledDomains.rowToRow
        ? layout.tables.flatMap((source) =>
            evaluateIndexedRowShading(source, index, sun, project.projectNorthDegrees).filter(
              (finding) => selectedIds.has(finding.receiverObjectId),
            ),
          )
        : [];
      const domainFindings = selected.flatMap((table) => [
        ...rowFindings.filter((finding) => finding.receiverObjectId === table.id),
        ...(enabledDomains.horizon ? [evaluateHorizon(horizons, table.id, sun)] : []),
        ...(enabledDomains.terrain && terrain && terrainIndex
          ? [evaluateTerrainShading(terrain, terrainIndex, table, sun)]
          : enabledDomains.terrain
            ? [
                {
                  id: `terrain:${table.id}:${sun.timestamp}`,
                  sourceObjectId: "terrain-not-imported",
                  receiverObjectId: table.id,
                  domain: "terrain" as const,
                  state: "not-evaluated" as const,
                  sunPosition: sun,
                  timestamp: sun.timestamp,
                  calculationMethod: "verified terrain line-of-sight",
                  sampleCount: 0,
                  shadedCount: 0,
                  notEvaluatedCount: 1,
                  warnings: ["A verified terrain scene has not been imported."],
                  limitations: ["Terrain is never inferred from layout geometry."],
                  ruleVersion: SHADING_RULE_VERSION,
                },
              ]
            : []),
        ...(enabledDomains.obstruction
          ? obstructionIndex.obstructions.size
            ? evaluateIndexedObstructions(obstructionIndex, table, sun, project.projectNorthDegrees)
            : [unavailableDomainFinding("obstruction", table.id, sun)]
          : []),
      ]);
      const next = [
        ...domainFindings,
        ...selected.map((table) => combineDomainFindings(table.id, sun, domainFindings)),
      ];
      setFindings(next);
      setPlaybackTimestamp(sun.timestamp);
      setStale(false);
      setCancelled(false);
      setWorkerValidationFailed(false);
      setReviewStatus("calculated-review-required");
      setStatus(
        "Selected timestamp calculated — review required. Domain results remain geometric and separate.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Calculation failed.");
    }
  };
  const runRange = () => {
    try {
      if (!layout) throw new Error("A validated layout is required.");
      validateProject(project);
      normalizeHorizon(horizons);
      workerRef.current?.terminate();
      const nextGeneration = activeGenerationRef.current + 1;
      activeGenerationRef.current = nextGeneration;
      setRunning(true);
      setProgress(0);
      setFindings([]);
      const worker = new Worker(new URL("./shadingWorker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<TimeRangeResponse>) => {
        if (
          event.data?.generation !== nextGeneration ||
          activeGenerationRef.current !== nextGeneration
        )
          return;
        let message: TimeRangeResponse;
        try {
          message = validateTimeRangeResponse(event.data, {
            generation: nextGeneration,
            tableIds: new Set(layout.tables.map((table) => table.id)),
            obstructionIds: new Set(obstructions.map((item) => item.id)),
          });
        } catch {
          setRunning(false);
          setStatus("The shading worker returned malformed data and was terminated.");
          setWorkerValidationFailed(true);
          worker.terminate();
          workerRef.current = null;
          return;
        }
        if (message.generation !== nextGeneration || activeGenerationRef.current !== nextGeneration)
          return;
        if (message.type === "progress") {
          setProgress(message.percent);
          setStatus(`Worker: ${message.stage} (${message.percent}%).`);
        } else if (message.type === "success") {
          setFindings(message.findings);
          setPlaybackTimestamp(
            [...new Set(message.findings.map((finding) => finding.timestamp))].sort()[0],
          );
          setTimeSummary(message.summary);
          setStale(false);
          setCancelled(false);
          setReviewStatus("calculated-review-required");
          setWorkerValidationFailed(false);
          setRunning(false);
          setProgress(100);
          setStatus("Time-range calculation complete — review required.");
          worker.terminate();
          workerRef.current = null;
        } else {
          setRunning(false);
          setStatus(message.message);
          worker.terminate();
          workerRef.current = null;
        }
      };
      worker.onerror = () => {
        if (activeGenerationRef.current !== nextGeneration) return;
        setRunning(false);
        setStatus("The shading worker failed safely.");
        setWorkerValidationFailed(true);
        worker.terminate();
        workerRef.current = null;
      };
      worker.postMessage({
        type: "analyse",
        schemaVersion: SHADING_SCHEMA_VERSION,
        generation: nextGeneration,
        startIso: localInputToInstant(start, project).toISOString(),
        endIso: localInputToInstant(end, project).toISOString(),
        stepMinutes: step,
        inputs: {
          project,
          layout,
          terrain,
          horizon: horizons,
          obstructions,
          sampling: "footprint-corners-and-centre",
          samplesPerTable: 5,
          enabledDomains,
        },
        selectedTableIds: layout.tables.slice(0, 20).map((table) => table.id),
      });
    } catch (error) {
      setRunning(false);
      setStatus(error instanceof Error ? error.message : "Analysis could not start.");
    }
  };
  const cancel = () => {
    stopPlayback();
    workerRef.current?.terminate();
    workerRef.current = null;
    activeGenerationRef.current += 1;
    setRunning(false);
    setCancelled(true);
    setStale(true);
    setStatus("Analysis cancelled; stale worker messages invalidated.");
  };
  const selectPlaybackIndex = (index: number) => {
    if (!availableTimestamps.length) return;
    const bounded = Math.max(0, Math.min(availableTimestamps.length - 1, index));
    setPlaybackTimestamp(availableTimestamps[bounded]);
  };
  const play = () => {
    if (playing || availableTimestamps.length <= 1 || stale) return;
    stopPlayback();
    const token = playbackGenerationRef.current;
    setPlaying(true);
    playbackTimerRef.current = setInterval(() => {
      if (token !== playbackGenerationRef.current) return;
      setPlaybackTimestamp((current) => {
        const index = Math.max(0, availableTimestamps.indexOf(current ?? availableTimestamps[0]));
        if (index >= availableTimestamps.length - 1) {
          if (playbackTimerRef.current !== undefined) clearInterval(playbackTimerRef.current);
          playbackTimerRef.current = undefined;
          setPlaying(false);
          return availableTimestamps[availableTimestamps.length - 1];
        }
        return availableTimestamps[index + 1];
      });
    }, 750);
  };
  const reset = () => {
    cancel();
    for (const timer of urlCleanupTimers.current) clearTimeout(timer);
    urlCleanupTimers.current.clear();
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current.clear();
    setLayout(undefined);
    setProjectReference("");
    setSourceImportReview(undefined);
    setDrawingImportReview(undefined);
    setTerrain(undefined);
    setNoDataGeometry([]);
    setObstructions([]);
    setObstructionForm(emptyObstructionForm());
    setEditingObstructionId(undefined);
    setDeleteConfirmationId(undefined);
    setEnabledDomains({ rowToRow: true, terrain: true, horizon: true, obstruction: true });
    setProject(defaultProject);
    setFindings([]);
    setPlaybackTimestamp(undefined);
    setProgress(0);
    setTimeSummary(undefined);
    setStatus("Workspace reset. No project data was persisted.");
    setReviewStatus("draft");
    setReviewHistory([]);
    setStale(true);
    setCancelled(false);
    setWorkerValidationFailed(false);
    setExportValidationFailed(false);
  };
  const review = makeReview(
    layout,
    project,
    horizons,
    obstructions,
    terrain,
    enabledDomains,
    findings,
    reviewStatus,
    reviewHistory,
  );
  const governanceBlockers = shadingReviewBlockers(findings, stale, cancelled, {
    workerValidationFailed,
    sourceUnreviewed: !layout,
    layoutAuthoritative: Boolean(layout),
    terrainVerified: enabledDomains.terrain ? Boolean(terrain) : undefined,
    obstructionReviewInvalid:
      enabledDomains.obstruction &&
      obstructions.some((item) => !["reviewed", "excluded"].includes(item.reviewStatus)),
    inputsChanged: stale && findings.length > 0,
    exportValidationFailed,
  });
  const changeReviewStatus = (target: ReviewStatus) => {
    try {
      const next = transitionShadingReview(
        reviewStatus,
        target,
        reviewHistory,
        governanceBlockers,
        new Date().toISOString(),
      );
      setReviewHistory(next);
      setReviewStatus(target);
      if (target === "restored") setStale(true);
      setStatus(`Shading review state changed to ${target}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Review transition was blocked.");
    }
  };
  const download = (kind: "json" | "csv" | "summary" | "companion") => {
    let url: string | undefined;
    try {
      if (!review) throw new Error("A validated shading review is required.");
      if (stale || cancelled || workerValidationFailed)
        throw new Error("Current validated calculation results are required before export.");
      if (kind === "summary" && !timeSummary)
        throw new Error("A validated time-range summary is required.");
      const content =
          kind === "json"
            ? serializeShadingReview(review)
            : kind === "companion"
              ? serializeShadingSceneCompanion(createShadingSceneCompanion(review, timeSummary))
              : kind === "summary"
                ? timeRangeSummaryCsv(timeSummary!)
                : findingsCsv(review),
        extension = kind === "json" || kind === "companion" ? "json" : "csv",
        blob = new Blob([content], {
          type: extension === "json" ? "application/json" : "text/csv",
        });
      url = URL.createObjectURL(blob);
      urls.current.add(url);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = safeShadingFilename(
        `${layout?.projectName ?? "shading-review"}${
          kind === "summary" ? "-time-summary" : kind === "companion" ? "-scene-companion" : ""
        }`,
        extension,
      );
      anchor.click();
      setExportValidationFailed(false);
    } catch (error) {
      setExportValidationFailed(true);
      setStatus(error instanceof Error ? error.message : "Export validation failed safely.");
    } finally {
      if (url) {
        const revokeUrl = url;
        const timer = setTimeout(() => {
          URL.revokeObjectURL(revokeUrl);
          urls.current.delete(revokeUrl);
          urlCleanupTimers.current.delete(timer);
        }, 0);
        urlCleanupTimers.current.add(timer);
      }
    }
  };
  return (
    <RenewablePage>
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <Breadcrumbs
          items={[
            { label: "Renewable Energy", to: "/renewable-energy" },
            { label: "Solar PV", to: "/renewable-energy/solar" },
            { label: "Shading geometry" },
          ]}
        />
        <StatusBadge>technical preview · RE7A</StatusBadge>
        <h1 className="mt-4 text-4xl font-bold gradient-text">Solar Shading Geometry</h1>
        <p className="mt-3 max-w-4xl text-muted-foreground">
          Browser-local geometric review using explicit coordinates, timezone, orientation, and
          reviewed sources. Geometric shaded fractions are not energy loss.
        </p>
        <div
          role="status"
          aria-live="polite"
          className="mt-5 rounded-xl border border-glass-border bg-card/60 p-4"
        >
          {status}
        </div>

        <section className="mt-8 grid gap-6 lg:grid-cols-2" aria-labelledby="inputs-heading">
          <article className="rounded-2xl border border-glass-border bg-card/50 p-5">
            <h2 id="inputs-heading" className="text-xl font-semibold">
              1. Validated sources
            </h2>
            <label className="mt-4 block text-sm font-medium">
              Exact project reference
              <input
                className="mt-1 w-full rounded-lg border border-glass-border bg-background px-3 py-2"
                value={projectReference}
                onChange={(event) => {
                  setProjectReference(event.target.value);
                  setSourceImportReview(undefined);
                  setDrawingImportReview(undefined);
                }}
                autoComplete="off"
              />
            </label>
            <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg border p-3 font-medium focus-within:ring-2 focus-within:ring-primary">
              <Upload size={18} />
              Review authoritative DraflioScene source
              <input
                className="sr-only"
                type="file"
                accept=".json,application/json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void reviewSceneSource(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {sourceImportReview && (
              <div className="mt-3 rounded-lg border border-amber-500/40 p-3 text-sm">
                <h3 className="font-semibold">Import review — confirmation required</h3>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                  {Object.entries(sourceImportReview.summary)
                    .filter(([, value]) => !Array.isArray(value))
                    .map(([label, value]) => (
                      <div key={label} className="contents">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd>{String(value)}</dd>
                      </div>
                    ))}
                </dl>
                <p className="mt-2">
                  Warnings: {sourceImportReview.summary.warnings.join("; ") || "none"}.
                  Incompatibilities:{" "}
                  {sourceImportReview.summary.incompatibilities.join("; ") || "none"}.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="rounded-lg bg-primary px-3 py-2 text-primary-foreground"
                    onClick={confirmSceneSource}
                  >
                    Confirm authoritative source
                  </button>
                  <button
                    className="rounded-lg border px-3 py-2"
                    onClick={() => {
                      setSourceImportReview(undefined);
                      setStatus(
                        "Pending DraflioScene source removed; authoritative state unchanged.",
                      );
                    }}
                  >
                    Remove pending source
                  </button>
                </div>
              </div>
            )}
            <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg border p-3 font-medium focus-within:ring-2 focus-within:ring-primary">
              <Upload size={18} />
              Review Drawing-to-Scene obstructions
              <input
                className="sr-only"
                type="file"
                accept=".json,application/json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void reviewDrawingSource(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {drawingImportReview && (
              <div className="mt-3 rounded-lg border border-amber-500/40 p-3 text-sm">
                <h3 className="font-semibold">Drawing import review — confirmation required</h3>
                <p className="mt-2">
                  {drawingImportReview.summary.drawingReference}:{" "}
                  {drawingImportReview.summary.obstructionCount} reviewed source footprints;{" "}
                  {drawingImportReview.summary.pendingReviewCount} will enter RE7A as draft.
                </p>
                <p className="mt-1">
                  Coordinates: {drawingImportReview.summary.coordinateSystem}; units:{" "}
                  {drawingImportReview.summary.units}; registration:{" "}
                  {drawingImportReview.summary.registrationState}. No height or elevation was
                  inferred.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="rounded-lg bg-primary px-3 py-2 text-primary-foreground"
                    onClick={confirmDrawingSource}
                  >
                    Confirm draft obstruction import
                  </button>
                  <button
                    className="rounded-lg border px-3 py-2"
                    onClick={() => {
                      setDrawingImportReview(undefined);
                      setStatus("Pending drawing source removed; existing obstructions unchanged.");
                    }}
                  >
                    Remove pending source
                  </button>
                </div>
              </div>
            )}
            <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-lg border p-3 font-medium focus-within:ring-2 focus-within:ring-primary">
              <Upload size={18} />
              Import RE6A layout-review JSON
              <input
                className="sr-only"
                type="file"
                accept=".json,application/json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importLayout(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg border p-3 font-medium focus-within:ring-2 focus-within:ring-primary">
              <Upload size={18} />
              Import verified terrain mesh JSON
              <input
                className="sr-only"
                type="file"
                accept=".json,application/json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importTerrain(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg border p-3 font-medium focus-within:ring-2 focus-within:ring-primary">
              <Upload size={18} />
              Import reviewed obstruction records JSON
              <input
                className="sr-only"
                type="file"
                accept=".json,application/json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importObstructions(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <p className="mt-3 text-sm text-muted-foreground">
              Limits: 10 MB; {formatInteger(SHADING_LIMITS.maxTables)} tables;{" "}
              {formatInteger(SHADING_LIMITS.maxTerrainTriangles)} terrain triangles;{" "}
              {SHADING_LIMITS.maxObstructions} reviewed obstructions.
            </p>
            <p className="mt-2 text-sm">
              {layout
                ? `${layout.projectName}: ${layout.tables.length} tables · ${layout.reviewStatus}`
                : "No layout loaded."}
            </p>
            <p className="mt-2 text-sm">
              Terrain: {terrain ? `${terrain.triangles.length} validated triangles` : "not loaded"}.
              Obstructions: {obstructions.length} validated;{" "}
              {obstructions.filter((item) => item.reviewStatus === "reviewed").length} reviewed and
              active.
            </p>
          </article>
          <article className="rounded-2xl border border-glass-border bg-card/50 p-5">
            <h2 className="text-xl font-semibold">2. Location, time, and orientation</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field
                label="Latitude (°)"
                type="number"
                value={Number.isNaN(project.latitudeDegrees) ? "" : project.latitudeDegrees}
                onChange={(value) => {
                  setProject({ ...project, latitudeDegrees: numberValue(value) });
                  invalidate("Project location changed; results and playback are stale.");
                }}
              />
              <Field
                label="Longitude (°)"
                type="number"
                value={Number.isNaN(project.longitudeDegrees) ? "" : project.longitudeDegrees}
                onChange={(value) => {
                  setProject({ ...project, longitudeDegrees: numberValue(value) });
                  invalidate("Project location changed; results and playback are stale.");
                }}
              />
              <Field
                label="IANA timezone"
                value={project.timezone}
                placeholder="Asia/Kolkata"
                onChange={(value) => {
                  setProject({ ...project, timezone: value });
                  invalidate("Timezone changed; results and playback are stale.");
                }}
              />
              <Field
                label="Project north clockwise from drawing Y (°)"
                type="number"
                value={project.projectNorthDegrees}
                onChange={(value) => {
                  setProject({ ...project, projectNorthDegrees: numberValue(value) });
                  invalidate("Project north changed; results and playback are stale.");
                }}
              />
              <Field
                label="Selected local date and time"
                type="datetime-local"
                value={timestamp}
                onChange={(value) => {
                  setTimestamp(value);
                  invalidate("Selected timestamp changed; prior results are stale.");
                }}
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Timezone uses IANA daylight-saving rules. No location or timezone is inferred.
              Changing these inputs invalidates displayed calculations.
            </p>
          </article>
        </section>

        <section className="mt-6 rounded-2xl border border-glass-border bg-card/50 p-5">
          <h2 className="text-xl font-semibold">3. Reviewed horizon profile</h2>
          <label className="mt-3 block text-sm font-medium" htmlFor="horizon">
            Azimuth°, elevation° — one reviewed point per line
          </label>
          <textarea
            id="horizon"
            className="mt-2 min-h-28 w-full rounded-lg border bg-background p-3 font-mono text-sm focus:ring-2 focus:ring-primary"
            value={horizonText}
            onChange={(event) => {
              setHorizonText(event.target.value);
              invalidate("Horizon profile changed; results and playback are stale.");
            }}
          />
          <p className="mt-2 text-sm text-muted-foreground">
            Gaps over 45° remain Not evaluated. Duplicate azimuths are rejected; interpolation wraps
            through north. No remote horizon data is retrieved.
          </p>
        </section>
        <section className="mt-6 rounded-2xl border border-glass-border bg-card/50 p-5">
          <h2 className="text-xl font-semibold">Enabled geometric domains</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {Object.entries(enabledDomains).map(([name, enabled]) => (
              <label className="rounded-lg border p-3 text-sm" key={name}>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => {
                    setEnabledDomains((current) => ({ ...current, [name]: event.target.checked }));
                    invalidate("Domain configuration changed; results and playback are stale.");
                    invalidate("Domain configuration changed; previous results are stale.");
                  }}
                />{" "}
                {name === "rowToRow" ? "Row-to-row" : name}
              </label>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Enabled but unavailable domains return Not evaluated. Disabled domains are omitted.
            Combined precedence is invalid, below horizon, confirmed blocker, unavailable domain,
            then clear.
          </p>
        </section>
        <section className="mt-6 rounded-2xl border border-glass-border bg-card/50 p-5">
          <h2 className="text-xl font-semibold">Reviewed obstruction editor</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Heights and base elevations are explicit metres. New, edited, duplicated, and restored
            records require engineer review before calculation.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field
              label="Obstruction ID"
              value={obstructionForm.id}
              onChange={(id) => setObstructionForm((current) => ({ ...current, id }))}
            />
            <label className="text-sm font-medium">
              Classification
              <select
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
                value={obstructionForm.classification}
                onChange={(event) =>
                  setObstructionForm((current) => ({
                    ...current,
                    classification: event.target.value as Obstruction["classification"],
                  }))
                }
              >
                {[
                  "building-box",
                  "wall",
                  "equipment-envelope",
                  "tree-envelope",
                  "generic-reviewed",
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <Field
              label="Height (m)"
              type="number"
              value={obstructionForm.height}
              onChange={(height) => setObstructionForm((current) => ({ ...current, height }))}
            />
            <Field
              label="Base elevation (m)"
              type="number"
              value={obstructionForm.baseElevation}
              onChange={(baseElevation) =>
                setObstructionForm((current) => ({ ...current, baseElevation }))
              }
            />
            <Field
              label="Uncertainty (m)"
              type="number"
              value={obstructionForm.uncertainty}
              onChange={(uncertainty) =>
                setObstructionForm((current) => ({ ...current, uncertainty }))
              }
            />
            <Field
              label="Source"
              value={obstructionForm.source}
              onChange={(source) => setObstructionForm((current) => ({ ...current, source }))}
            />
            <Field
              label="Provenance"
              value={obstructionForm.provenance}
              onChange={(provenance) =>
                setObstructionForm((current) => ({ ...current, provenance }))
              }
            />
            <Field
              label="Notes"
              value={obstructionForm.notes}
              onChange={(notes) => setObstructionForm((current) => ({ ...current, notes }))}
            />
          </div>
          <label className="mt-3 block text-sm font-medium">
            Footprint vertices (x,y; x,y; …) in metres
            <textarea
              className="mt-1 min-h-20 w-full rounded-lg border bg-background p-3 font-mono"
              value={obstructionForm.footprint}
              onChange={(event) =>
                setObstructionForm((current) => ({ ...current, footprint: event.target.value }))
              }
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded-lg border px-3 py-2 focus-visible:ring-2"
              onClick={saveObstruction}
            >
              {editingObstructionId ? "Save obstruction edit" : "Create draft obstruction"}
            </button>
            {editingObstructionId && (
              <button
                className="rounded-lg border px-3 py-2 focus-visible:ring-2"
                onClick={() => {
                  setEditingObstructionId(undefined);
                  setObstructionForm(emptyObstructionForm());
                }}
              >
                Cancel edit
              </button>
            )}
          </div>
          <div className="mt-4 space-y-3">
            {obstructions.map((item) => (
              <article className="rounded-lg border p-3 text-sm" key={item.id}>
                <p className="font-semibold">
                  {item.id} · {item.classification} · {item.reviewStatus}
                </p>
                <p>
                  Height {item.heightMeters} m · base {item.baseElevationMeters} m · uncertainty{" "}
                  {item.uncertaintyMeters} m
                </p>
                <p>Provenance: {item.provenance}</p>
                <p>
                  History:{" "}
                  {item.lifecycleHistory
                    .map((event) => `${event.sequence}. ${event.action}: ${event.detail}`)
                    .join(" | ")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    className="rounded border px-2 py-1"
                    onClick={() => {
                      setEditingObstructionId(item.id);
                      setObstructionForm(formFromObstruction(item));
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="rounded border px-2 py-1"
                    onClick={() => {
                      const duplicate = duplicateObstruction(
                        item,
                        obstructions.map((record) => record.id),
                      );
                      setObstructions((records) =>
                        [...records, duplicate].sort((a, b) => a.id.localeCompare(b.id)),
                      );
                      invalidate("Obstruction duplicated as draft; results are stale.");
                    }}
                  >
                    Duplicate
                  </button>
                  {item.reviewStatus !== "reviewed" && item.reviewStatus !== "excluded" && (
                    <button
                      className="rounded border px-2 py-1"
                      onClick={() =>
                        replaceObstruction(
                          reviewObstruction(item),
                          "Obstruction review state changed; results are stale.",
                        )
                      }
                    >
                      Mark reviewed
                    </button>
                  )}
                  {item.reviewStatus !== "excluded" ? (
                    <button
                      className="rounded border px-2 py-1"
                      onClick={() =>
                        replaceObstruction(
                          excludeObstruction(item),
                          "Obstruction excluded; results are stale.",
                        )
                      }
                    >
                      Exclude
                    </button>
                  ) : (
                    <button
                      className="rounded border px-2 py-1"
                      onClick={() =>
                        replaceObstruction(
                          restoreObstruction(item),
                          "Obstruction restored pending renewed review; results are stale.",
                        )
                      }
                    >
                      Restore
                    </button>
                  )}
                  <button
                    className="rounded border px-2 py-1"
                    onClick={() =>
                      setDeleteConfirmationId((current) =>
                        current === item.id ? undefined : item.id,
                      )
                    }
                  >
                    {deleteConfirmationId === item.id ? "Cancel delete" : "Delete…"}
                  </button>
                  {deleteConfirmationId === item.id && (
                    <button
                      className="rounded border border-destructive px-2 py-1"
                      onClick={() => {
                        setObstructions((records) =>
                          records.filter((record) => record.id !== item.id),
                        );
                        setDeleteConfirmationId(undefined);
                        invalidate("Obstruction deleted after confirmation; results are stale.");
                      }}
                    >
                      Confirm delete {item.id}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <article className="rounded-2xl border border-glass-border bg-card/50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">4. 2D geometric review</h2>
              <button
                className="rounded-lg border px-3 py-2 focus:ring-2 focus:ring-primary"
                onClick={calculateSelected}
              >
                Calculate selected time
              </button>
            </div>
            <Review2D
              layout={layout}
              terrain={terrain}
              noDataGeometry={noDataGeometry}
              findings={displayedFindings}
              obstructions={obstructions}
            />
            <p className="mt-3 text-sm">
              Sampling: footprint corners and centre · 5 samples/table · deterministic · exact
              zero-area contact is clear.
            </p>
          </article>
          <article className="rounded-2xl border border-glass-border bg-card/50 p-5">
            <h2 className="text-xl font-semibold">Sun position</h2>
            {sun ? (
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Metric label="Azimuth" value={`${sun.azimuthDegrees.toFixed(3)}°`} />
                <Metric label="Elevation" value={`${sun.elevationDegrees.toFixed(3)}°`} />
                <Metric label="Zenith" value={`${sun.zenithDegrees.toFixed(3)}°`} />
                <Metric
                  label="State"
                  value={sun.belowHorizon ? "Below horizon" : "Above horizon"}
                />
                <Metric label="Solar time" value={`${sun.localSolarTimeMinutes.toFixed(2)} min`} />
                <Metric label="Polar state" value={sun.polarState} />
              </dl>
            ) : (
              <p className="mt-4 text-sm">Enter valid explicit inputs.</p>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              Method: NOAA Solar Calculator equations (Meeus), geometric elevation without
              atmospheric refraction. Full precision retained; display rounded only.
            </p>
          </article>
        </section>
        <section className="mt-6 rounded-2xl border border-glass-border bg-card/50 p-5">
          <h2 className="text-xl font-semibold">5. Sun path and deterministic playback</h2>
          {availableTimestamps.length ? (
            <>
              <input
                aria-label="Selected calculated timestamp"
                className="mt-4 w-full"
                type="range"
                min={0}
                max={availableTimestamps.length - 1}
                value={Math.max(0, availableTimestamps.indexOf(activeTimestamp!))}
                onChange={(event) => {
                  stopPlayback();
                  selectPlaybackIndex(Number(event.target.value));
                }}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="rounded border px-3 py-2 focus-visible:ring-2"
                  onClick={() => {
                    stopPlayback();
                    selectPlaybackIndex(availableTimestamps.indexOf(activeTimestamp!) - 1);
                  }}
                >
                  Previous timestamp
                </button>
                <button
                  className="rounded border px-3 py-2 focus-visible:ring-2"
                  onClick={() => {
                    stopPlayback();
                    selectPlaybackIndex(availableTimestamps.indexOf(activeTimestamp!) + 1);
                  }}
                >
                  Next timestamp
                </button>
                <button
                  className="rounded border px-3 py-2 focus-visible:ring-2"
                  disabled={availableTimestamps.length <= 1 || stale || playing}
                  onClick={play}
                >
                  <Play size={16} className="inline" /> Play
                </button>
                <button
                  className="rounded border px-3 py-2 focus-visible:ring-2"
                  disabled={!playing}
                  onClick={stopPlayback}
                >
                  <Pause size={16} className="inline" /> Pause
                </button>
                <button
                  className="rounded border px-3 py-2 focus-visible:ring-2"
                  onClick={() => {
                    stopPlayback();
                    selectPlaybackIndex(0);
                  }}
                >
                  Reset playback
                </button>
              </div>
              <SunPath findings={findings} activeTimestamp={activeTimestamp!} project={project} />
            </>
          ) : (
            <p className="mt-3 text-sm">
              Run a bounded calculation to create validated timestamps.
            </p>
          )}
        </section>
        <section className="mt-6 rounded-2xl border border-glass-border bg-card/50 p-5">
          <h2 className="text-xl font-semibold">6. Technical Three.js engineering review</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Supported display limit: {formatInteger(SHADING_LIMITS.max3DTriangles)} terrain
            triangles. Terrain exaggeration is 1× and calculation coordinates are unchanged.
          </p>
          <ShadingReview3D
            layout={layout}
            terrain={terrain}
            obstructions={obstructions}
            findings={displayedFindings}
          />
        </section>

        <section className="mt-6 rounded-2xl border border-glass-border bg-card/50 p-5">
          <h2 className="text-xl font-semibold">7. Bounded time-range analysis</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Field
              label="Start local"
              type="datetime-local"
              value={start}
              onChange={(value) => {
                setStart(value);
                invalidate("Time-range input changed; results and playback are stale.");
              }}
            />
            <Field
              label="End local"
              type="datetime-local"
              value={end}
              onChange={(value) => {
                setEnd(value);
                invalidate("Time-range input changed; results and playback are stale.");
              }}
            />
            <Field
              label="Step (minutes)"
              type="number"
              value={step}
              onChange={(value) => {
                setStep(numberValue(value));
                invalidate("Time step changed; results and playback are stale.");
              }}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              disabled={running}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
              onClick={runRange}
            >
              <Play size={17} />
              Run in worker
            </button>
            <button
              disabled={!running}
              className="flex items-center gap-2 rounded-lg border px-4 py-2 disabled:opacity-50"
              onClick={cancel}
            >
              <Pause size={17} />
              Cancel
            </button>
          </div>
          <progress
            className="mt-4 w-full"
            max={100}
            value={progress}
            aria-label="Analysis progress"
          />
          <p className="text-sm">
            {progress}% · maximum {formatInteger(SHADING_LIMITS.maxTimestamps)} timestamps and{" "}
            {formatInteger(SHADING_LIMITS.maxSelectedTables)} selected tables.
          </p>
          {timeSummary && (
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <Metric label="Requested timestamps" value={`${timeSummary.requestedTimestamps}`} />
              <Metric label="Evaluated timestamps" value={`${timeSummary.evaluatedTimestamps}`} />
              <Metric label="Below horizon" value={`${timeSummary.belowHorizonTimestamps}`} />
              <Metric label="Clear occurrence" value={`${timeSummary.clearTimestamps}`} />
              <Metric label="Geometrically shaded" value={`${timeSummary.shadedTimestamps}`} />
              <Metric label="Not evaluated" value={`${timeSummary.notEvaluatedTimestamps}`} />
            </dl>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-glass-border bg-card/50 p-5">
          <h2 className="text-xl font-semibold">6. Domain-specific findings</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2">Timestamp</th>
                  <th>Domain</th>
                  <th>Receiver</th>
                  <th>State</th>
                  <th>Samples</th>
                  <th>Geometric fraction</th>
                </tr>
              </thead>
              <tbody>
                {findings.slice(0, 500).map((finding) => (
                  <tr className="border-b" key={finding.id}>
                    <td className="p-2">{finding.timestamp}</td>
                    <td>{finding.domain}</td>
                    <td>{finding.receiverObjectId}</td>
                    <td>{finding.state}</td>
                    <td>
                      {finding.shadedCount}/{finding.sampleCount}
                    </td>
                    <td>
                      {finding.geometricShadedFraction === undefined
                        ? "Not evaluated"
                        : finding.geometricShadedFraction.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!findings.length && (
            <p className="mt-4 text-sm text-muted-foreground">No calculated findings.</p>
          )}
        </section>
        <section className="mt-6 rounded-2xl border border-glass-border bg-card/50 p-5">
          <h2 className="text-xl font-semibold">Review and approval governance</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <Metric label="Current state" value={reviewStatus} />
            <Metric label="Calculation state" value={stale ? "stale" : "current"} />
            <Metric label="Calculation version" value={SHADING_RULE_VERSION} />
          </dl>
          <p className="mt-3 text-sm">
            Enabled domains:{" "}
            {Object.entries(enabledDomains)
              .filter(([, enabled]) => enabled)
              .map(([name]) => name)
              .join(", ") || "none"}
            .
          </p>
          <p className="mt-2 text-sm">
            Blocking conditions: {governanceBlockers.join(" | ") || "none"}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              "calculated-review-required",
              "valid-with-warnings",
              "reviewed",
              "approved-for-preliminary-draflio-workflow",
              "excluded",
              "restored",
              "draft",
            ].map((target) => (
              <button
                key={target}
                className="rounded border px-2 py-1 focus-visible:ring-2"
                onClick={() => changeReviewStatus(target as ReviewStatus)}
              >
                Set {target}
              </button>
            ))}
          </div>
          <ol className="mt-3 space-y-1 text-sm">
            {reviewHistory.map((event) => (
              <li key={event.sequence}>
                {event.sequence}. {event.timestamp}: {event.from} → {event.to}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            Preliminary approval is not bankable, lender, construction, manufacturer, certified,
            independently validated, or energy-yield validation. No result is automatically reviewed
            or approved.
          </p>
        </section>
        <section className="mt-6 flex flex-wrap gap-3">
          <button
            disabled={!review}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 disabled:opacity-50"
            onClick={() => download("json")}
          >
            <Download size={17} />
            Shading-review JSON
          </button>
          <button
            disabled={!review}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 disabled:opacity-50"
            onClick={() => download("csv")}
          >
            <Download size={17} />
            Findings CSV
          </button>
          <button
            disabled={!review || !timeSummary}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 disabled:opacity-50"
            onClick={() => download("summary")}
          >
            <Download size={17} />
            Time-range table summary CSV
          </button>
          <button
            disabled={!review}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 disabled:opacity-50"
            onClick={() => download("companion")}
          >
            <Download size={17} />
            DraflioScene shading companion JSON
          </button>
          <button className="flex items-center gap-2 rounded-lg border px-4 py-2" onClick={reset}>
            <RotateCcw size={17} />
            Start over
          </button>
          <BackLink to="/renewable-energy/solar">Back to Solar PV</BackLink>
        </section>
        <aside className="mt-8 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
          <strong>Professional limitation:</strong> this preview evaluates geometric occurrence
          only. It does not use irradiance, weather, module electrical behavior, annual
          extrapolation, or certify a design. Approval is never automatic.
        </aside>
      </main>
    </RenewablePage>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  const id = label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
  return (
    <label className="block text-sm font-medium" htmlFor={id}>
      {label}
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border bg-background px-3 py-2 focus:ring-2 focus:ring-primary"
      />
    </label>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
function unavailableDomainFinding(
  domain: "obstruction",
  receiverId: string,
  sun: SunPosition,
): ShadingFinding {
  return {
    id: `${domain}:${receiverId}:${sun.timestamp}:unavailable`,
    sourceObjectId: `${domain}-unavailable`,
    receiverObjectId: receiverId,
    domain,
    state: "not-evaluated",
    sunPosition: sun,
    timestamp: sun.timestamp,
    calculationMethod: "explicit enabled-domain availability policy",
    sampleCount: 0,
    shadedCount: 0,
    notEvaluatedCount: 1,
    warnings: ["No active reviewed obstruction is available."],
    limitations: ["No obstruction geometry is inferred."],
    ruleVersion: SHADING_RULE_VERSION,
  };
}
function SunPath({
  findings,
  activeTimestamp,
  project,
}: {
  findings: ShadingFinding[];
  activeTimestamp: string;
  project: ProjectTime;
}) {
  const positions = [
    ...new Map(findings.map((item) => [item.timestamp, item.sunPosition])).values(),
  ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const selected = positions.find((item) => item.timestamp === activeTimestamp)!;
  const point = (position: SunPosition) => ({
    x: 160 + (position.azimuthDegrees / 360) * 320,
    y: 130 - (position.elevationDegrees / 90) * 110,
  });
  const above = positions.filter((item) => !item.belowHorizon).map(point);
  const below = positions.filter((item) => item.belowHorizon).map(point);
  const selectedPoint = point(selected);
  return (
    <div className="mt-4">
      <svg
        role="img"
        aria-label="Calculated solar path with below-horizon portions dashed"
        viewBox="0 0 640 180"
        className="h-44 w-full rounded-lg border bg-background"
      >
        <line x1="160" y1="130" x2="480" y2="130" stroke="currentColor" />
        {above.length > 1 && (
          <polyline
            points={above.map((item) => `${item.x},${item.y}`).join(" ")}
            fill="none"
            stroke="#ca8a04"
            strokeWidth="3"
          />
        )}
        {below.length > 1 && (
          <polyline
            points={below.map((item) => `${item.x},${item.y}`).join(" ")}
            fill="none"
            stroke="#64748b"
            strokeDasharray="7 5"
            strokeWidth="3"
          />
        )}
        <circle cx={selectedPoint.x} cy={selectedPoint.y} r="6" fill="#dc2626" stroke="#111827" />
      </svg>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <Metric
          label="Selected local timestamp"
          value={new Intl.DateTimeFormat("en-CA", {
            timeZone: project.timezone,
            dateStyle: "medium",
            timeStyle: "long",
          }).format(new Date(selected.timestamp))}
        />
        <Metric label="Selected UTC timestamp" value={selected.timestamp} />
        <Metric label="Timezone" value={project.timezone} />
        <Metric
          label="Analysis location"
          value={`${project.latitudeDegrees}°, ${project.longitudeDegrees}°`}
        />
        <Metric label="Project north" value={`${project.projectNorthDegrees}°`} />
        <Metric label="Solar azimuth" value={`${selected.azimuthDegrees.toFixed(3)}°`} />
        <Metric label="Solar elevation" value={`${selected.elevationDegrees.toFixed(3)}°`} />
        <Metric label="Solar zenith" value={`${selected.zenithDegrees.toFixed(3)}°`} />
        <Metric
          label="Result state"
          value={selected.belowHorizon ? "below-horizon" : "calculated"}
        />
        <Metric label="Method / version" value={`${selected.method} · ${SHADING_RULE_VERSION}`} />
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">
        Playback only selects values in the validated result set. It starts no worker and performs
        no additional solar-position calculation.
      </p>
    </div>
  );
}
function Review2D({
  layout,
  terrain,
  noDataGeometry,
  findings,
  obstructions,
}: {
  layout?: LayoutReview;
  terrain?: TerrainMesh;
  noDataGeometry: NonNullable<
    NonNullable<DraflioSourceImportReview["source"]["terrain"]>["noDataGeometry"]
  >;
  findings: ShadingFinding[];
  obstructions: Obstruction[];
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number; panX: number; panY: number }>();
  const [selectedId, setSelectedId] = useState<string>();
  const [layers, setLayers] = useState({
    terrain: true,
    noData: true,
    boundary: true,
    exclusions: true,
    areas: true,
    tables: true,
    obstructions: true,
    shadows: true,
    samples: true,
    blockingPoints: true,
  });
  if (!layout?.tables.length)
    return (
      <div
        role="img"
        aria-label="2D shading review awaiting a layout"
        className="mt-4 grid h-80 place-items-center rounded-xl border border-dashed text-muted-foreground"
      >
        Import a layout to enable the 2D review.
      </div>
    );
  const points = [
      ...layout.tables.flatMap((table) => table.footprint.vertices),
      ...(layout.siteBoundary?.geometry.vertices ?? []),
      ...layout.exclusions.flatMap((item) => item.effectiveGeometry.vertices),
      ...layout.arrayAreas.flatMap((item) =>
        item.effectivePlacementRegions.flatMap((region) => region.vertices),
      ),
      ...obstructions.flatMap((item) => item.footprint),
      ...(terrain?.vertices.map((vertex) => ({ x: vertex.x, y: vertex.y })) ?? []),
      ...noDataGeometry.flatMap((shape) => shape.vertices),
      ...findings.flatMap((finding) => finding.shadowPolygon ?? []),
    ],
    sceneBounds = boundsOf(points),
    minX = sceneBounds.minX,
    maxX = sceneBounds.maxX,
    minY = sceneBounds.minY,
    maxY = sceneBounds.maxY,
    width = Math.max(1, maxX - minX),
    height = Math.max(1, maxY - minY);
  const state = new Map(findings.map((finding) => [finding.receiverObjectId, finding.state]));
  const selectedFinding = findings.find(
    (finding) => finding.id === selectedId || finding.receiverObjectId === selectedId,
  );
  const evidence = findings.flatMap((finding) => finding.sampleEvidence ?? []);
  const selectedSample = evidence.find((sample) => `sample:${sample.sampleId}` === selectedId);
  const viewWidth = (width + 4) / zoom;
  const viewHeight = (height + 4) / zoom;
  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded border px-2 py-1 focus-visible:ring-2"
          onClick={() => setZoom((value) => Math.min(20, value * 1.25))}
        >
          Zoom in
        </button>
        <button
          className="rounded border px-2 py-1 focus-visible:ring-2"
          onClick={() => setZoom((value) => Math.max(0.25, value / 1.25))}
        >
          Zoom out
        </button>
        <button
          className="rounded border px-2 py-1 focus-visible:ring-2"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          Fit site
        </button>
        <button
          className="rounded border px-2 py-1 focus-visible:ring-2"
          onClick={() => {
            if (!selectedId) return;
            const selectedPoints =
              layout.tables.find((item) => item.id === selectedId)?.footprint.vertices ??
              obstructions.find((item) => item.id === selectedId)?.footprint ??
              findings.find((item) => item.id === selectedId)?.shadowPolygon;
            if (!selectedPoints?.length) return;
            const bounds = boundsOf(selectedPoints);
            const selectedWidth = Math.max(bounds.maxX - bounds.minX, 0.01);
            const selectedHeight = Math.max(bounds.maxY - bounds.minY, 0.01);
            const nextZoom = Math.min(
              20,
              Math.max(
                0.25,
                Math.min(
                  (width + 4) / (selectedWidth * 1.2),
                  (height + 4) / (selectedHeight * 1.2),
                ),
              ),
            );
            const nextViewWidth = (width + 4) / nextZoom;
            const nextViewHeight = (height + 4) / nextZoom;
            setZoom(nextZoom);
            setPan({
              x: (bounds.minX + bounds.maxX) / 2 - (minX - 2) - nextViewWidth / 2,
              y: (bounds.minY + bounds.maxY) / 2 - (minY - 2) - nextViewHeight / 2,
            });
          }}
        >
          Fit selection
        </button>
        {Object.entries(layers).map(([name, enabled]) => (
          <label className="rounded border px-2 py-1 text-sm" key={name}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) =>
                setLayers((current) => ({ ...current, [name]: event.target.checked }))
              }
            />{" "}
            {name}
          </label>
        ))}
      </div>
      <svg
        role="img"
        aria-label="Interactive 2D shading engineering review in metres; drag to pan and wheel to zoom"
        tabIndex={0}
        className="mt-3 h-80 w-full touch-none rounded-xl border bg-background focus-visible:ring-2"
        viewBox={`${minX - 2 + pan.x} ${minY - 2 + pan.y} ${viewWidth} ${viewHeight}`}
        preserveAspectRatio="xMidYMid meet"
        onWheel={(event) => {
          event.preventDefault();
          setZoom((value) => Math.min(20, Math.max(0.25, value * (event.deltaY < 0 ? 1.1 : 0.9))));
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDrag({ x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y });
        }}
        onPointerMove={(event) => {
          if (!drag) return;
          setPan({
            x: drag.panX - ((event.clientX - drag.x) / 500) * viewWidth,
            y: drag.panY - ((event.clientY - drag.y) / 320) * viewHeight,
          });
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
          setDrag(undefined);
        }}
        onPointerCancel={() => setDrag(undefined)}
        onClick={(event) => {
          if (drag) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const transform = createShading2DTransform(
            { x: minX - 2 + pan.x, y: minY - 2 + pan.y },
            viewWidth,
            viewHeight,
            rect.width,
            rect.height,
          );
          const point = screenToProject(
            { x: event.clientX - rect.left, y: event.clientY - rect.top },
            transform,
          );
          const pointSelection = hitTestPoints(point, projectHitRadius(transform.scale), [
            ...(layers.blockingPoints ? findings : [])
              .filter((finding) => finding.blockingPoint)
              .map((finding) => ({
                id: finding.id,
                precedence: selectedId === finding.id ? 0 : 1,
                point: finding.blockingPoint!,
              })),
            ...(layers.samples ? layout.tables : []).flatMap((table) =>
              evidence
                .filter((sample) => sample.tableId === table.id)
                .map((sample) => ({
                  id: `sample:${sample.sampleId}`,
                  precedence: 0,
                  point: sample.point,
                })),
            ),
          ]);
          setSelectedId(
            pointSelection ??
              hitTestPolygons(point, [
                ...(layers.shadows ? findings : [])
                  .filter((finding) => finding.shadowPolygon?.length)
                  .map((finding) => ({
                    id: finding.id,
                    precedence: 1,
                    polygon: finding.shadowPolygon!,
                  })),
                ...(layers.obstructions ? obstructions : []).map((item) => ({
                  id: item.id,
                  precedence: 2,
                  polygon: item.footprint,
                })),
                ...(layers.tables ? layout.tables : []).map((table) => ({
                  id: table.id,
                  precedence: 3,
                  polygon: table.footprint.vertices,
                })),
                ...(layers.noData ? noDataGeometry : []).map((shape) => ({
                  id: `no-data:${shape.id}`,
                  precedence: 7,
                  polygon: shape.vertices,
                })),
              ]),
          );
        }}
      >
        <defs>
          <pattern id="no-data-hatch" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M0 8L8 0" stroke="#71717a" strokeWidth="1" />
          </pattern>
        </defs>
        {layers.terrain &&
          terrain?.triangles.map((triangle, index) => (
            <polygon
              key={`terrain-${index}`}
              points={triangle
                .map((vertexIndex) => terrain.vertices[vertexIndex])
                .map((point) => `${point.x},${point.y}`)
                .join(" ")}
              fill="none"
              stroke="#64748b"
              strokeWidth={Math.max(width, height) / 1000}
            />
          ))}
        {layers.noData &&
          noDataGeometry.map((shape) => (
            <polygon
              key={`no-data-${shape.id}`}
              points={shape.vertices.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="url(#no-data-hatch)"
              stroke="#52525b"
              strokeDasharray={`${Math.max(width, height) / 180} ${Math.max(width, height) / 220}`}
            >
              <title>
                Verified no-data geometry {shape.id}; {shape.method} {shape.methodVersion};{" "}
                {shape.provenance}
              </title>
            </polygon>
          ))}
        {layers.boundary && layout.siteBoundary && (
          <polygon
            points={layout.siteBoundary.geometry.vertices
              .map((point) => `${point.x},${point.y}`)
              .join(" ")}
            fill="none"
            stroke="#ca8a04"
            strokeWidth={Math.max(width, height) / 300}
          />
        )}
        {layers.exclusions &&
          layout.exclusions.map((item) => (
            <polygon
              key={item.id}
              points={item.effectiveGeometry.vertices
                .map((point) => `${point.x},${point.y}`)
                .join(" ")}
              fill="none"
              stroke="#b91c1c"
              strokeWidth={Math.max(width, height) / 350}
            />
          ))}
        {layers.areas &&
          layout.arrayAreas.flatMap((item) =>
            item.effectivePlacementRegions.map((region, index) => (
              <polygon
                key={`${item.id}-${index}`}
                points={region.vertices.map((point) => `${point.x},${point.y}`).join(" ")}
                fill="none"
                stroke="#2563eb"
                strokeWidth={Math.max(width, height) / 450}
              />
            )),
          )}
        {layers.shadows &&
          findings
            .filter((finding) => finding.shadowPolygon?.length)
            .map((finding) => (
              <polygon
                key={finding.id}
                points={finding.shadowPolygon!.map((point) => `${point.x},${point.y}`).join(" ")}
                fill="none"
                stroke="#dc2626"
                strokeDasharray={`${Math.max(width, height) / 150} ${Math.max(width, height) / 200}`}
                strokeWidth={Math.max(width, height) / 400}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedId(finding.id);
                }}
              />
            ))}
        {layers.samples &&
          evidence.map((sample) => (
            <SampleSymbol
              key={sample.sampleId}
              sample={sample}
              radius={Math.max(width, height) / 220}
              selected={selectedId === `sample:${sample.sampleId}`}
            />
          ))}
        {layers.blockingPoints &&
          findings
            .filter((finding) => finding.blockingPoint)
            .map((finding) => (
              <g
                key={`block-${finding.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedId(finding.id);
                }}
              >
                <circle
                  cx={finding.blockingPoint!.x}
                  cy={finding.blockingPoint!.y}
                  r={Math.max(width, height) / 180}
                  fill="none"
                  stroke="#be123c"
                  strokeWidth={Math.max(width, height) / 500}
                />
                <path
                  d={`M ${finding.blockingPoint!.x - Math.max(width, height) / 200} ${finding.blockingPoint!.y - Math.max(width, height) / 200} L ${finding.blockingPoint!.x + Math.max(width, height) / 200} ${finding.blockingPoint!.y + Math.max(width, height) / 200}`}
                  stroke="#be123c"
                />
              </g>
            ))}
        {layers.obstructions &&
          obstructions.map((item) => (
            <polygon
              key={item.id}
              points={item.footprint.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="none"
              stroke="#7c3aed"
              strokeWidth={Math.max(width, height) / 350}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedId(item.id);
              }}
            />
          ))}
        {layers.tables &&
          layout.tables.slice(0, SHADING_LIMITS.maxTables).map((table) => (
            <polygon
              key={table.id}
              points={table.footprint.vertices.map((p) => `${p.x},${p.y}`).join(" ")}
              fill={
                state.get(table.id) === "shaded"
                  ? "#dc2626"
                  : state.get(table.id) === "not-evaluated"
                    ? "#a3a3a3"
                    : "#16a34a"
              }
              fillOpacity=".55"
              stroke={selectedId === table.id ? "#000000" : "currentColor"}
              strokeWidth={Math.max(width, height) / (selectedId === table.id ? 200 : 500)}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedId(table.id);
              }}
            >
              <title>
                {table.id}: {state.get(table.id) ?? "not calculated"}
              </title>
            </polygon>
          ))}
      </svg>
      <p className="mt-2 text-sm">
        Units: metres. Grey mesh is verified terrain coverage; gold is the site boundary; red is
        exclusion; blue is array area; solid polygons are tables; purple outlines are obstruction
        footprints; dashed outlines are authoritative calculated shadow polygons. Crosshair circles
        identify validated blocking points. Sample symbols: clear = open circle, shaded = filled
        square, unavailable = triangle with bar, invalid = diamond with cross. Hatched polygons are
        explicit verified no-data geometry; absent no-data geometry remains textually Not evaluated.
      </p>
      <p className="mt-1 text-sm">
        Selected: {selectedId ?? "none"}
        {selectedFinding
          ? ` · ${selectedFinding.domain} · ${selectedFinding.state} · ${selectedFinding.shadedCount}/${selectedFinding.sampleCount} shaded samples`
          : ""}
      </p>
      {selectedSample && (
        <dl className="mt-2 grid gap-1 rounded-lg border p-3 text-sm sm:grid-cols-2">
          <Metric label="Receiver table" value={selectedSample.tableId} />
          <Metric label="Sample ID" value={selectedSample.sampleId} />
          <Metric
            label="Coordinates (m)"
            value={`${selectedSample.point.x}, ${selectedSample.point.y}`}
          />
          <Metric
            label="Domain / state"
            value={`${selectedSample.domain} / ${selectedSample.state}`}
          />
          <Metric
            label="Receiver elevation"
            value={
              selectedSample.receiverElevationMeters === undefined
                ? "Not evaluated"
                : `${selectedSample.receiverElevationMeters} m`
            }
          />
          <Metric
            label="Method"
            value={`${selectedSample.sampleMethod} · ${selectedSample.sampleMethodVersion}`}
          />
          <Metric label="Source blocker" value={selectedSample.blockerReference ?? "none"} />
          <Metric label="Warning / limitation" value={selectedSample.warning ?? "none"} />
        </dl>
      )}
    </div>
  );
}
function SampleSymbol({
  sample,
  radius,
  selected,
}: {
  sample: NonNullable<ShadingFinding["sampleEvidence"]>[number];
  radius: number;
  selected: boolean;
}) {
  const strokeWidth = selected ? radius / 2 : radius / 3;
  if (sample.state === "shaded")
    return (
      <rect
        x={sample.point.x - radius}
        y={sample.point.y - radius}
        width={radius * 2}
        height={radius * 2}
        fill="#b91c1c"
        stroke="#111827"
        strokeWidth={strokeWidth}
      />
    );
  if (sample.state === "unavailable")
    return (
      <g>
        <path
          d={`M ${sample.point.x} ${sample.point.y - radius} L ${sample.point.x + radius} ${sample.point.y + radius} L ${sample.point.x - radius} ${sample.point.y + radius} Z`}
          fill="none"
          stroke="#52525b"
          strokeWidth={strokeWidth}
        />
        <path
          d={`M ${sample.point.x - radius * 0.6} ${sample.point.y} L ${sample.point.x + radius * 0.6} ${sample.point.y}`}
          stroke="#52525b"
          strokeWidth={strokeWidth}
        />
      </g>
    );
  if (sample.state === "invalid")
    return (
      <g>
        <path
          d={`M ${sample.point.x} ${sample.point.y - radius} L ${sample.point.x + radius} ${sample.point.y} L ${sample.point.x} ${sample.point.y + radius} L ${sample.point.x - radius} ${sample.point.y} Z`}
          fill="none"
          stroke="#7f1d1d"
          strokeWidth={strokeWidth}
        />
        <path
          d={`M ${sample.point.x - radius / 2} ${sample.point.y - radius / 2} L ${sample.point.x + radius / 2} ${sample.point.y + radius / 2} M ${sample.point.x + radius / 2} ${sample.point.y - radius / 2} L ${sample.point.x - radius / 2} ${sample.point.y + radius / 2}`}
          stroke="#7f1d1d"
          strokeWidth={strokeWidth}
        />
      </g>
    );
  return (
    <circle
      cx={sample.point.x}
      cy={sample.point.y}
      r={radius}
      fill="none"
      stroke="#166534"
      strokeWidth={strokeWidth}
    />
  );
}
function parseHorizon(text: string): HorizonPoint[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      const [azimuth, elevation] = line.split(",").map(Number);
      return {
        azimuthDegrees: azimuth,
        elevationDegrees: elevation,
        source: `Engineer-entered line ${index + 1}`,
        notes: "",
        reviewStatus: "reviewed",
      };
    });
}
function localInputToInstant(value: string, project: ProjectTime) {
  if (!value) return new Date(NaN);
  const initial = new Date(`${value}:00Z`);
  if (project.fixedOffsetMinutes !== undefined)
    return new Date(initial.getTime() - project.fixedOffsetMinutes * 60_000);
  try {
    let estimate = initial;
    for (let index = 0; index < 3; index += 1) {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: project.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(estimate);
      const get = (type: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find((part) => part.type === type)?.value);
      const represented = Date.UTC(
        get("year"),
        get("month") - 1,
        get("day"),
        get("hour"),
        get("minute"),
      );
      estimate = new Date(estimate.getTime() + initial.getTime() - represented);
    }
    return estimate;
  } catch {
    return new Date(NaN);
  }
}
function isLayoutReview(value: unknown): value is LayoutReview {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LayoutReview>;
  return (
    candidate.schemaName === "draflio-layout-review" &&
    candidate.schemaVersion === "1.0" &&
    typeof candidate.projectName === "string" &&
    Array.isArray(candidate.tables) &&
    candidate.tables.length <= SHADING_LIMITS.maxTables &&
    candidate.tables.every(
      (table) =>
        table &&
        typeof table.id === "string" &&
        Array.isArray(table.footprint?.vertices) &&
        table.footprint.vertices.length >= 3 &&
        table.footprint.vertices.every(
          (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
        ),
    ) &&
    new Set(candidate.tables.map((table) => table.id)).size === candidate.tables.length
  );
}
function makeReview(
  layout: LayoutReview | undefined,
  project: ProjectTime,
  horizon: HorizonPoint[],
  obstructions: Obstruction[],
  terrain: TerrainMesh | undefined,
  enabledDomains: {
    rowToRow: boolean;
    terrain: boolean;
    horizon: boolean;
    obstruction: boolean;
  },
  findings: ShadingFinding[],
  reviewStatus: ReviewStatus,
  reviewHistory: ReviewTransition[],
): ShadingReview | undefined {
  if (!layout || !findings.length) return undefined;
  return {
    schemaName: SHADING_SCHEMA_NAME,
    schemaVersion: SHADING_SCHEMA_VERSION,
    createdAt: findings[0].timestamp,
    sourceLayoutReference: layout.projectName,
    inputs: {
      project,
      layout,
      terrain,
      horizon,
      obstructions,
      sampling: "footprint-corners-and-centre",
      samplesPerTable: 5,
      enabledDomains,
    },
    findings,
    reviewStatus,
    assumptions: ["Table terrain-sample mean is the table reference elevation."],
    limitations: [
      "Geometric fractions are not energy loss.",
      "Terrain, 3D, and manually reviewed obstruction import require a subsequent RE7 increment.",
    ],
    excludedHistory: [],
    reviewHistory,
  };
}
