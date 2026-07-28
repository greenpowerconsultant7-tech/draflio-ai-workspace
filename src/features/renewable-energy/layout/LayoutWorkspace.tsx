import { useEffect, useMemo, useRef, useState } from "react";
import { parseComponentJson } from "../../../../shared/renewableEnergy/components/componentImport";
import type {
  InverterRecord,
  PvModuleRecord,
} from "../../../../shared/renewableEnergy/components/componentTypes";
import {
  alreadyAlignedRegistration,
  applyRegistrationToPolygon,
  createExclusion,
  createReviewedPolygon,
  createTableDefinition,
  createTerrainSampler,
  editTable,
  generateTables,
  inputReadiness,
  layoutStatistics,
  parseSceneJson,
  polygonsIntersect,
  revalidateLayoutTables,
  solveSimilarityRegistration,
  validatePolygon,
} from "../../../../shared/renewableEnergy/layout/layoutCore";
import { createInwardSetback } from "../../../../shared/renewableEnergy/layout/layoutGeometry";
import {
  findingsCsv,
  layoutToDraflioScene,
  parseLayoutReview,
  serializeLayoutReview,
  tableScheduleCsv,
} from "../../../../shared/renewableEnergy/layout/layoutSerialization";
import {
  LAYOUT_ALGORITHM_VERSION,
  LAYOUT_LIMITS,
  LAYOUT_SCHEMA_NAME,
  LAYOUT_SCHEMA_VERSION,
  type ArrayArea,
  type ExclusionCategory,
  type ExclusionZone,
  type GeneratedTable,
  type LayoutReview,
  type Point2,
  type Polygon2,
  type RegistrationResult,
  type ReviewedPolygon,
  type TableDefinition,
  type TerrainLimits,
} from "../../../../shared/renewableEnergy/layout/layoutTypes";
import type { DraflioScene } from "../../../../shared/renewableEnergy/draflioSceneTypes";
import { Breadcrumbs, RenewablePage, StatusBadge } from "../RenewableShell";
import { Layout3DReview } from "./Layout3DReview";

const button =
  "rounded-xl border border-glass-border bg-card px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const input =
  "mt-1 w-full rounded-lg border border-glass-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const initialTable = {
  name: "Fixed-tilt table",
  orientation: "portrait",
  modulesAcross: "2",
  modulesHigh: "2",
  horizontalGapMeters: "0.02",
  verticalGapMeters: "0.02",
  edgeAllowanceMeters: "0",
  tiltDegrees: "20",
  azimuthDegrees: "180",
  minimumGroundClearanceMeters: "0.5",
  maximumGroundClearanceMeters: "",
};
const initialArea = {
  name: "Array area 1",
  priority: "1",
  rowPitchMeters: "6",
  columnSpacingMeters: "0.5",
  boundarySetbackMeters: "0",
  originX: "0",
  originY: "0",
  maximumTableCount: "100",
};
const initialLimits = {
  maximumSlopeDegrees: "",
  maximumCrossTableElevationDifferenceMeters: "",
  maximumRowElevationChangeMeters: "",
  minimumTerrainCoverageFraction: "",
  minimumNoDataDistanceMeters: "",
};

export function LayoutWorkspace() {
  const [terrain, setTerrain] = useState<DraflioScene>();
  const [drawing, setDrawing] = useState<DraflioScene>();
  const [module, setModule] = useState<PvModuleRecord>();
  const [inverter, setInverter] = useState<InverterRecord>();
  const [inverterQuantity, setInverterQuantity] = useState("");
  const [registration, setRegistration] = useState<RegistrationResult>();
  const [controlsText, setControlsText] = useState("0,0,0,0\n10,0,10,0");
  const [residualThreshold, setResidualThreshold] = useState("0.1");
  const [boundaryText, setBoundaryText] = useState("0,0\n100,0\n100,100\n0,100\n0,0");
  const [boundary, setBoundary] = useState<ReviewedPolygon>();
  const [exclusions, setExclusions] = useState<ExclusionZone[]>([]);
  const [exclusionText, setExclusionText] = useState("40,40\n60,40\n60,60\n40,60\n40,40");
  const [exclusionCategory, setExclusionCategory] = useState<ExclusionCategory>(
    "other-reviewed-exclusion",
  );
  const [exclusionReason, setExclusionReason] = useState("");
  const [exclusionSetback, setExclusionSetback] = useState("0");
  const [tableForm, setTableForm] = useState<Record<string, string>>(initialTable);
  const [tableDefinition, setTableDefinition] = useState<TableDefinition>();
  const [areaForm, setAreaForm] = useState<Record<string, string>>(initialArea);
  const [areaText, setAreaText] = useState("5,5\n95,5\n95,95\n5,95\n5,5");
  const [areas, setAreas] = useState<ArrayArea[]>([]);
  const [limitsForm, setLimitsForm] = useState<Record<string, string>>(initialLimits);
  const [tables, setTables] = useState<GeneratedTable[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [show3d, setShow3d] = useState(true);
  const [duplicateOffset, setDuplicateOffset] = useState({ x: "5", y: "0" });
  const [view, setView] = useState({ x: 0, y: 0, scale: 5 });
  const [layers, setLayers] = useState({
    drawing: true,
    boundary: true,
    exclusions: true,
    areas: true,
    tables: true,
  });
  const [status, setStatus] = useState<string>("Import reviewed project inputs to begin.");
  const [error, setError] = useState<string>();
  const generation = useRef(0);
  const worker = useRef<Worker | undefined>(undefined);
  const urls = useRef<string[]>([]);
  useEffect(
    () => () => {
      generation.current += 1;
      worker.current?.terminate();
      worker.current = undefined;
      urls.current.forEach(URL.revokeObjectURL);
    },
    [],
  );
  const fail = (caught: unknown) => {
    setError(caught instanceof Error ? caught.message : "Operation failed safely.");
  };
  const invalidate = (message: string) => {
    generation.current += 1;
    worker.current?.terminate();
    worker.current = undefined;
    setTables([]);
    setSelectedId(undefined);
    setShow3d(true);
    setStatus(message);
  };
  const invalidateRegistrationDerived = (message: string) => {
    setBoundary((current) => (current?.source === "drawing" ? undefined : current));
    setExclusions((current) => current.filter((zone) => zone.source !== "drawing"));
    setAreas((current) => current.filter((area) => area.source !== "drawing"));
    invalidate(message);
  };
  const readScene = async (file: File, kind: "terrain" | "drawing") => {
    const token = ++generation.current;
    setStatus(`Reading ${kind} scene locally`);
    try {
      const text = await file.text();
      if (token !== generation.current) return;
      const scene = parseSceneJson(text, kind);
      if (kind === "terrain") setTerrain(scene);
      else setDrawing(scene);
      setRegistration(undefined);
      invalidateRegistrationDerived(
        `${kind} scene imported; registration and drawing-derived layout invalidated.`,
      );
      setError(undefined);
    } catch (caught) {
      if (token === generation.current) fail(caught);
    }
  };
  const readComponent = async (file: File) => {
    const token = ++generation.current;
    try {
      const text = await file.text();
      const records = parseComponentJson(text);
      if (token !== generation.current) return;
      const raw = JSON.parse(text) as {
        records?: { recordId?: string; reviewStatus?: string }[];
        recordId?: string;
        reviewStatus?: string;
      };
      const approvedIds = new Set(
        (raw.records ?? [raw])
          .filter((record) => record.reviewStatus === "approved-for-current-project")
          .map((record) => record.recordId),
      );
      const parsed = records.find(
        (record): record is PvModuleRecord =>
          record.componentType === "pv-module" && approvedIds.has(record.recordId),
      );
      if (!parsed) throw new Error("Import requires an approved PV-module component record.");
      const selected: PvModuleRecord = {
        ...parsed,
        reviewStatus: "approved-for-current-project",
      };
      setModule(Object.freeze(structuredClone(selected)));
      setTableDefinition(undefined);
      invalidate("Approved module imported; table definition and derived layout require review.");
      setError(undefined);
    } catch (caught) {
      if (token === generation.current) fail(caught);
    }
  };
  const readInverter = async (file: File) => {
    const token = ++generation.current;
    try {
      const text = await file.text();
      const records = parseComponentJson(text);
      if (token !== generation.current) return;
      const raw = JSON.parse(text) as {
        records?: { recordId?: string; reviewStatus?: string }[];
        recordId?: string;
        reviewStatus?: string;
      };
      const approvedIds = new Set(
        (raw.records ?? [raw])
          .filter((record) => record.reviewStatus === "approved-for-current-project")
          .map((record) => record.recordId),
      );
      const parsed = records.find(
        (record): record is InverterRecord =>
          record.componentType === "inverter" && approvedIds.has(record.recordId),
      );
      if (!parsed) throw new Error("Import requires an approved inverter component record.");
      const selected: InverterRecord = {
        ...parsed,
        reviewStatus: "approved-for-current-project",
      };
      setInverter(Object.freeze(structuredClone(selected)));
      invalidate("Approved inverter imported; capacity context updated.");
      setError(undefined);
    } catch (caught) {
      if (token === generation.current) fail(caught);
    }
  };
  const confirmAligned = () => {
    try {
      if (!terrain || !drawing) throw new Error("Import terrain and drawing scenes first.");
      setRegistration(alreadyAlignedRegistration(terrain, drawing, true));
      invalidateRegistrationDerived(
        "Already-aligned registration confirmed; drawing-derived layout invalidated.",
      );
    } catch (caught) {
      fail(caught);
    }
  };
  const solveControls = () => {
    try {
      const pairs = controlsText
        .trim()
        .split(/\r?\n/)
        .map((line, index) => {
          const values = line.split(",").map(Number);
          if (values.length !== 4 || values.some((value) => !Number.isFinite(value)))
            throw new Error(`Control row ${index + 1} requires drawing x,y and terrain x,y.`);
          return {
            id: `control-${String(index + 1).padStart(3, "0")}`,
            drawing: { x: values[0], y: values[1] },
            terrain: { x: values[2], y: values[3] },
          };
        });
      const solved = solveSimilarityRegistration(pairs, Number(residualThreshold));
      setRegistration({ ...solved, active: true, confirmed: true });
      invalidateRegistrationDerived(
        "Coordinate registration confirmed; drawing-derived layout invalidated.",
      );
    } catch (caught) {
      fail(caught);
    }
  };
  const createBoundary = () => {
    try {
      const created = createReviewedPolygon({
        id: "site-boundary-001",
        name: "Active site boundary",
        geometry: parsePolygon(boundaryText),
        source: "manual",
        sourceReference: "manual-coordinate-entry",
      });
      setBoundary({ ...created, reviewStatus: "reviewed" });
      invalidate("Site boundary updated; derived layout invalidated.");
      setError(undefined);
    } catch (caught) {
      fail(caught);
    }
  };
  const addExclusion = () => {
    try {
      if (exclusions.length >= LAYOUT_LIMITS.maxExclusions)
        throw new Error("Exclusion limit reached.");
      const polygon = createReviewedPolygon({
        id: `exclusion-${String(exclusions.length + 1).padStart(3, "0")}`,
        name: exclusionCategory,
        geometry: parsePolygon(exclusionText),
        source: "manual",
        sourceReference: "manual-coordinate-entry",
      });
      setExclusions((current) => [
        ...current,
        {
          ...createExclusion(polygon, exclusionCategory, exclusionReason, Number(exclusionSetback)),
          reviewStatus: "reviewed",
        },
      ]);
      invalidate("Exclusion added; derived layout invalidated.");
      setError(undefined);
    } catch (caught) {
      fail(caught);
    }
  };
  const defineTable = () => {
    try {
      if (!module) throw new Error("Import an approved module first.");
      const definition = createTableDefinition({
        id: "table-type-001",
        name: tableForm.name,
        module,
        orientation: tableForm.orientation as "portrait" | "landscape",
        modulesAcross: Number(tableForm.modulesAcross),
        modulesHigh: Number(tableForm.modulesHigh),
        horizontalGapMeters: Number(tableForm.horizontalGapMeters),
        verticalGapMeters: Number(tableForm.verticalGapMeters),
        edgeAllowanceMeters: Number(tableForm.edgeAllowanceMeters),
        tiltDegrees: Number(tableForm.tiltDegrees),
        azimuthDegrees: Number(tableForm.azimuthDegrees),
        minimumGroundClearanceMeters: Number(tableForm.minimumGroundClearanceMeters),
        maximumGroundClearanceMeters: optionalNumber(tableForm.maximumGroundClearanceMeters),
      });
      setTableDefinition(definition);
      invalidate("Table definition updated; derived layout invalidated.");
      setError(undefined);
    } catch (caught) {
      fail(caught);
    }
  };
  const addArea = () => {
    try {
      if (!boundary || !tableDefinition)
        throw new Error("Review a boundary and table definition first.");
      const polygon = createReviewedPolygon({
        id: `array-area-${String(areas.length + 1).padStart(3, "0")}`,
        name: areaForm.name,
        geometry: parsePolygon(areaText),
        source: "manual",
        sourceReference: "manual-coordinate-entry",
      });
      if (validatePolygon(polygon.geometry).length) throw new Error("Array area is invalid.");
      const setback = createInwardSetback(polygon.geometry, Number(areaForm.boundarySetbackMeters));
      if (setback.collapsed)
        throw new Error("The array-area setback collapses the permitted placement region.");
      if (setback.effectiveRegions.length > 1)
        throw new Error(
          "The setback creates multiple placement regions; explicit region review is required.",
        );
      const area: ArrayArea = {
        ...polygon,
        warnings: areas
          .filter((existing) => polygonsIntersect(existing.geometry, polygon.geometry))
          .map((existing) => `Array area overlaps ${existing.id}; engineering review required.`),
        reviewStatus: "reviewed",
        priority: Number(areaForm.priority),
        tableTypeId: tableDefinition.id,
        azimuthDegrees: Number(tableForm.azimuthDegrees),
        rowPitchMeters: Number(areaForm.rowPitchMeters),
        columnSpacingMeters: Number(areaForm.columnSpacingMeters),
        boundarySetbackMeters: Number(areaForm.boundarySetbackMeters),
        effectivePlacementRegions: setback.effectiveRegions,
        setbackAlgorithmVersion: setback.algorithmVersion,
        minimumTableSpacingMeters: Number(areaForm.columnSpacingMeters),
        origin: { x: Number(areaForm.originX), y: Number(areaForm.originY) },
        generationDirection: "positive-x",
        maximumTableCount: Number(areaForm.maximumTableCount),
      };
      setAreas((current) => [
        ...current.map((existing) =>
          polygonsIntersect(existing.geometry, area.geometry)
            ? {
                ...existing,
                warnings: [
                  ...existing.warnings,
                  `Array area overlaps ${area.id}; engineering review required.`,
                ],
              }
            : existing,
        ),
        area,
      ]);
      invalidate("Array area added; derived layout invalidated.");
      setError(undefined);
    } catch (caught) {
      fail(caught);
    }
  };
  const terrainLimits = useMemo(
    (): TerrainLimits =>
      Object.fromEntries(
        Object.entries(limitsForm)
          .filter(([, value]) => value !== "")
          .map(([key, value]) => [key, Number(value)]),
      ),
    [limitsForm],
  );
  const terrainSampler = useMemo(
    () => (terrain ? createTerrainSampler(terrain) : undefined),
    [terrain],
  );
  const eligibleDrawingPolygons = useMemo(
    () =>
      (drawing?.objects ?? [])
        .filter(
          (object) =>
            object.kind === "annotation" &&
            object.geometry.type === "polyline" &&
            object.geometry.closed &&
            object.reviewStatus === "approved" &&
            object.metadata.sourceReviewState === "accepted",
        )
        .flatMap((object) => {
          if (object.kind !== "annotation" || object.geometry.type !== "polyline") return [];
          const original: Polygon2 = {
            vertices: object.geometry.points.map((point) => ({ x: point.x, y: point.y })),
          };
          return validatePolygon(original).length
            ? []
            : [{ object, original, sourcePage: object.sourceReferences[0]?.pageNumber }];
        })
        .sort((left, right) => left.object.id.localeCompare(right.object.id)),
    [drawing],
  );
  const registeredDrawingPolygons = useMemo(
    () =>
      registration?.confirmed
        ? eligibleDrawingPolygons.map((entry) => ({
            id: entry.object.id,
            geometry: applyRegistrationToPolygon(entry.original, registration),
          }))
        : [],
    [eligibleDrawingPolygons, registration],
  );
  const drawingPolygon = (objectId: string) => {
    if (!registration?.confirmed)
      throw new Error("Confirm drawing-to-terrain registration before selecting geometry.");
    const candidate = eligibleDrawingPolygons.find((entry) => entry.object.id === objectId);
    if (!candidate) throw new Error("Drawing polygon is not eligible for selection.");
    const transformed = applyRegistrationToPolygon(candidate.original, registration);
    const immutableOriginal = createReviewedPolygon({
      id: `drawing-original-${candidate.object.id}`,
      name: candidate.object.name,
      geometry: candidate.original,
      source: "drawing",
      sourceReference: candidate.object.id,
    }).originalGeometry;
    return {
      candidate,
      reviewed: {
        ...createReviewedPolygon({
          id: `drawing-${candidate.object.id}`,
          name: candidate.object.name,
          geometry: transformed,
          source: "drawing",
          sourceReference: candidate.object.id,
        }),
        originalGeometry: immutableOriginal,
        reviewStatus: "reviewed" as const,
      },
    };
  };
  const selectDrawingBoundary = (objectId: string) => {
    try {
      const { reviewed } = drawingPolygon(objectId);
      setBoundary({ ...reviewed, id: "site-boundary-001" });
      invalidate("Drawing-derived site boundary selected; derived layout invalidated.");
    } catch (caught) {
      fail(caught);
    }
  };
  const selectDrawingExclusion = (objectId: string) => {
    try {
      const { reviewed } = drawingPolygon(objectId);
      if (boundary?.sourceReference === objectId)
        throw new Error("This polygon is already the active boundary; role conflict rejected.");
      setExclusions((current) => [
        ...current,
        {
          ...createExclusion(
            reviewed,
            exclusionCategory,
            exclusionReason,
            Number(exclusionSetback),
          ),
          reviewStatus: "reviewed",
        },
      ]);
      invalidate("Drawing-derived exclusion selected; derived layout invalidated.");
    } catch (caught) {
      fail(caught);
    }
  };
  const selectDrawingArea = (objectId: string) => {
    try {
      if (!tableDefinition) throw new Error("Define the table type first.");
      const { reviewed } = drawingPolygon(objectId);
      if (
        boundary?.sourceReference === objectId ||
        exclusions.some((zone) => zone.sourceReference === objectId)
      )
        throw new Error("This polygon already has an incompatible reviewed role.");
      const setback = createInwardSetback(
        reviewed.geometry,
        Number(areaForm.boundarySetbackMeters),
      );
      if (setback.collapsed || setback.effectiveRegions.length !== 1)
        throw new Error("Drawing area setback requires explicit topology review.");
      setAreas((current) => [
        ...current,
        {
          ...reviewed,
          id: `array-area-${String(current.length + 1).padStart(3, "0")}`,
          priority: Number(areaForm.priority),
          tableTypeId: tableDefinition.id,
          azimuthDegrees: Number(tableForm.azimuthDegrees),
          rowPitchMeters: Number(areaForm.rowPitchMeters),
          columnSpacingMeters: Number(areaForm.columnSpacingMeters),
          boundarySetbackMeters: Number(areaForm.boundarySetbackMeters),
          effectivePlacementRegions: setback.effectiveRegions,
          setbackAlgorithmVersion: setback.algorithmVersion,
          minimumTableSpacingMeters: Number(areaForm.columnSpacingMeters),
          origin: { x: Number(areaForm.originX), y: Number(areaForm.originY) },
          generationDirection: "positive-x",
          maximumTableCount: Number(areaForm.maximumTableCount),
        },
      ]);
      invalidate("Drawing-derived array area selected; derived layout invalidated.");
    } catch (caught) {
      fail(caught);
    }
  };
  const generate = () => {
    try {
      if (
        !terrain ||
        !drawing ||
        !registration?.active ||
        !module ||
        !boundary ||
        !tableDefinition ||
        !areas.length
      )
        throw new Error("All mandatory readiness items must be valid before generation.");
      const token = ++generation.current;
      worker.current?.terminate();
      const active = new Worker(new URL("./layoutWorker.ts", import.meta.url), {
        type: "module",
      });
      worker.current = active;
      setStatus("Generating deterministic preliminary layout");
      active.onmessage = (event: MessageEvent<unknown>) => {
        if (!event.data || typeof event.data !== "object") {
          if (token === generation.current) fail(new Error("Malformed worker response rejected."));
          return;
        }
        const message = event.data as {
          type?: unknown;
          generation?: unknown;
          tables?: unknown;
          message?: unknown;
          progress?: { stage?: unknown; percent?: unknown };
        };
        if (message.generation !== token || token !== generation.current) return;
        if (
          message.type === "progress" &&
          typeof message.progress?.stage === "string" &&
          typeof message.progress.percent === "number"
        ) {
          setStatus(
            `${message.progress.stage.replaceAll("-", " ")} — ${message.progress.percent}%`,
          );
          return;
        }
        if (
          message.type === "result" &&
          validGeneratedTables(message.tables, areas, tableDefinition)
        ) {
          worker.current = undefined;
          active.terminate();
          setTables(message.tables as GeneratedTable[]);
          setStatus(`Generated ${message.tables.length} tables — engineering review required.`);
          setError(undefined);
          return;
        }
        if (message.type === "error" && typeof message.message === "string") {
          worker.current = undefined;
          active.terminate();
          fail(new Error(message.message));
          return;
        }
        fail(new Error("Malformed worker response rejected."));
      };
      active.onerror = () => {
        if (token !== generation.current) return;
        worker.current = undefined;
        active.terminate();
        fail(new Error("Layout worker failed safely."));
      };
      active.postMessage({
        type: "generate",
        generation: token,
        areas,
        table: tableDefinition,
        boundary,
        exclusions,
        terrainLimits,
        terrainScene: terrain,
      });
    } catch (caught) {
      fail(caught);
    }
  };
  const cancel = () => {
    worker.current?.terminate();
    worker.current = undefined;
    generation.current += 1;
    setTables([]);
    setStatus("Generation cancelled safely; reviewed inputs retained.");
  };
  const selected = tables.find((table) => table.id === selectedId);
  const findingSummary = Array.from(
    tables
      .flatMap((table) => table.findings)
      .reduce((summary, finding) => {
        const key = `${finding.code}: ${finding.status}`;
        summary.set(key, (summary.get(key) ?? 0) + 1);
        return summary;
      }, new Map<string, number>()),
  ).sort(([left], [right]) => left.localeCompare(right));
  const revalidateAll = (next: GeneratedTable[]) => {
    if (!boundary) return next;
    return revalidateLayoutTables(next, areas, boundary, exclusions, terrainLimits, terrainSampler);
  };
  const changeSelected = (action: Parameters<typeof editTable>[1]) => {
    if (!selected) return;
    try {
      setTables((current) =>
        revalidateAll(
          current.map((table) => (table.id === selected.id ? editTable(table, action) : table)),
        ),
      );
    } catch (caught) {
      fail(caught);
    }
  };
  const setSelectedReviewStatus = (reviewStatus: GeneratedTable["reviewStatus"]) => {
    if (!selected) return;
    if (
      reviewStatus === "approved-for-preliminary-draflio-workflow" &&
      selected.findings.some(
        (finding) => finding.status === "fail" || finding.status === "not-evaluated",
      )
    ) {
      setError("Resolve failing and not-evaluated findings before preliminary workflow approval.");
      return;
    }
    setTables((current) =>
      revalidateAll(
        current.map((table) =>
          table.id === selected.id
            ? {
                ...table,
                reviewStatus,
                editHistory: [
                  ...table.editHistory,
                  {
                    sequence: table.editHistory.length + 1,
                    action: "review-status",
                    detail: reviewStatus,
                  },
                ],
              }
            : table,
        ),
      ),
    );
  };
  const duplicateSelected = () => {
    if (!selected || tables.length >= LAYOUT_LIMITS.maxTables) return;
    const offsetX = Number(duplicateOffset.x);
    const offsetY = Number(duplicateOffset.y);
    if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)) {
      setError("Duplicate offsets must be finite metric coordinates.");
      return;
    }
    const copies = tables.filter((table) =>
      table.id.startsWith(`${selected.id}-manual-copy-`),
    ).length;
    const duplicate = editTable(
      {
        ...structuredClone(selected),
        id: `${selected.id}-manual-copy-${String(copies + 1).padStart(3, "0")}`,
        reviewStatus: "unresolved",
        editHistory: [],
      },
      {
        type: "move",
        center: { x: selected.center.x + offsetX, y: selected.center.y + offsetY },
      },
    );
    setTables((current) => revalidateAll([...current, duplicate]));
    setSelectedId(duplicate.id);
  };
  const deleteSelectedManualTable = () => {
    if (!selected?.id.includes("-manual-copy-")) {
      setError("Only a manually duplicated table may be deleted.");
      return;
    }
    setTables((current) => revalidateAll(current.filter((table) => table.id !== selected.id)));
    setSelectedId(undefined);
  };
  const stats = boundary ? layoutStatistics(boundary, exclusions, areas, tables) : undefined;
  const readiness = inputReadiness({
    terrain,
    drawing,
    module,
    registration,
    boundary,
    exclusions,
    table: tableDefinition,
    areas,
    tables,
  });
  const review = (): LayoutReview => ({
    schemaName: LAYOUT_SCHEMA_NAME,
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    projectName: "Browser-local solar layout",
    coordinateSystem: "registered-local-metric",
    inputs: {
      terrainScene: terrain,
      drawingScene: drawing,
      module,
      inverter,
    },
    ...(inverter &&
    Number.isSafeInteger(Number(inverterQuantity)) &&
    Number(inverterQuantity) > 0 &&
    stats
      ? {
          inverterCapacityContext: {
            inverterRecordId: inverter.recordId,
            quantity: Number(inverterQuantity),
            ratedAcPowerWatts: inverter.parameters.ratedAcPower.normalizedValue,
            totalAcPowerWatts:
              inverter.parameters.ratedAcPower.normalizedValue * Number(inverterQuantity),
            layoutDcAcRatio:
              stats.dcCapacityWatts /
              (inverter.parameters.ratedAcPower.normalizedValue * Number(inverterQuantity)),
            assumptionSource: "engineer-entered" as const,
            limitation:
              "Capacity context only; no stringing, assignment, compatibility, or optimisation.",
          },
        }
      : {}),
    registration,
    siteBoundary: boundary,
    exclusions,
    terrainLimits,
    tableDefinitions: tableDefinition ? [tableDefinition] : [],
    arrayAreas: areas,
    tables,
    findings: tables.flatMap((table) => table.findings),
    statistics: stats,
    reviewStatus: "generated-review-required",
    limitations: [
      "Preliminary local-coordinate layout only; not approved for construction.",
      "No shading, energy simulation, structural design, grading, drainage, roads, or electrical design.",
      "Polygon setbacks use bounded millimetre integer scaling and require review when topology changes.",
    ],
    algorithmVersions: [LAYOUT_ALGORITHM_VERSION],
  });
  const download = (content: string, name: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    urls.current.push(url);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    try {
      anchor.click();
    } finally {
      queueMicrotask(() => {
        URL.revokeObjectURL(url);
        urls.current = urls.current.filter((candidate) => candidate !== url);
      });
    }
  };
  const startOver = () => {
    generation.current += 1;
    worker.current?.terminate();
    worker.current = undefined;
    urls.current.forEach(URL.revokeObjectURL);
    urls.current = [];
    setTerrain(undefined);
    setDrawing(undefined);
    setModule(undefined);
    setInverter(undefined);
    setInverterQuantity("");
    setRegistration(undefined);
    setControlsText("0,0,0,0\n10,0,10,0");
    setResidualThreshold("0.1");
    setBoundaryText("0,0\n100,0\n100,100\n0,100\n0,0");
    setBoundary(undefined);
    setExclusions([]);
    setExclusionText("40,40\n60,40\n60,60\n40,60\n40,40");
    setExclusionCategory("other-reviewed-exclusion");
    setExclusionReason("");
    setExclusionSetback("0");
    setTableDefinition(undefined);
    setTableForm(initialTable);
    setLimitsForm(initialLimits);
    setAreas([]);
    setAreaForm(initialArea);
    setAreaText("5,5\n95,5\n95,95\n5,95\n5,5");
    setTables([]);
    setSelectedId(undefined);
    setError(undefined);
    setStatus("Import reviewed project inputs to begin.");
  };
  return (
    <RenewablePage>
      <Breadcrumbs
        items={[
          { label: "Renewable Energy", to: "/renewable-energy" },
          { label: "Solar PV", to: "/renewable-energy/solar" },
          { label: "Terrain-aware Layout" },
        ]}
      />
      <section className="border-b border-glass-border py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <StatusBadge>LAYOUT ENGINEERING TECHNICAL PREVIEW</StatusBadge>
          <h1 className="mt-4 text-4xl font-bold">
            Solar Site Registration and Terrain-Aware Layout
          </h1>
          <p className="mt-4 max-w-4xl text-muted-foreground">
            Deterministic local-coordinate registration, reviewed constraints, declared table
            geometry, and preliminary layout review. No optimisation, shading, energy yield,
            structural approval, grading, or construction readiness is claimed.
          </p>
        </div>
      </section>
      <main className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
        {error && (
          <p role="alert" className="rounded-xl bg-destructive/10 p-4">
            {error}
          </p>
        )}
        <p aria-live="polite" className="rounded-xl bg-card p-4">
          {status}
        </p>
        <section className="rounded-2xl border p-5">
          <h2 className="text-2xl font-semibold">1. Project inputs and readiness</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <FileField
              label="Terrain DraflioScene JSON"
              onFile={(file) => void readScene(file, "terrain")}
            />
            <FileField
              label="Drawing DraflioScene JSON"
              onFile={(file) => void readScene(file, "drawing")}
            />
            <FileField
              label="Approved module or library JSON"
              onFile={(file) => void readComponent(file)}
            />
            <FileField
              label="Optional approved inverter JSON"
              onFile={(file) => void readInverter(file)}
            />
          </div>
          <dl className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {Object.entries(readiness).map(([name, state]) => (
              <div key={name} className="rounded-lg bg-card p-3">
                <dt className="font-medium">{name}</dt>
                <dd>{state}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Limits: 10 MB scenes; {formatInteger(LAYOUT_LIMITS.maxTerrainVertices)} terrain
            vertices; {formatInteger(LAYOUT_LIMITS.maxTables)} tables; {LAYOUT_LIMITS.maxArrayAreas}{" "}
            array areas.
          </p>
          {inverter && (
            <div className="mt-4 rounded-xl border p-4">
              <h3 className="font-semibold">Optional inverter capacity context</h3>
              <p>
                {inverter.manufacturer} {inverter.model}; rated AC{" "}
                {inverter.parameters.ratedAcPower.normalizedValue} W; maximum DC{" "}
                {inverter.parameters.maximumDcPower?.normalizedValue ?? "not supplied"} W; MPPT
                topology{" "}
                {inverter.parameters.mpptTrackers
                  ? `${inverter.parameters.mpptTrackers} trackers`
                  : "not supplied"}
                .
              </p>
              <Field
                label="Preliminary inverter quantity (explicit)"
                value={inverterQuantity}
                onChange={setInverterQuantity}
              />
              {(() => {
                const quantity = Number(inverterQuantity);
                if (inverterQuantity === "" || !Number.isSafeInteger(quantity) || quantity <= 0)
                  return (
                    <p className="mt-2">
                      Total AC capacity and DC/AC ratio: Not evaluated — enter a positive integer
                      quantity. No stringing, assignment, compatibility, or optimisation is implied.
                    </p>
                  );
                const acWatts = quantity * inverter.parameters.ratedAcPower.normalizedValue;
                return (
                  <p className="mt-2">
                    Preliminary total AC {acWatts} W; layout DC/AC ratio{" "}
                    {stats ? (stats.dcCapacityWatts / acWatts).toFixed(4) : "not evaluated"}.
                    Capacity context only; no electrical compatibility conclusion.
                  </p>
                );
              })()}
            </div>
          )}
        </section>
        <section className="rounded-2xl border p-5">
          <h2 className="text-2xl font-semibold">2. Coordinate registration</h2>
          <button className={`${button} mt-3`} onClick={confirmAligned}>
            Confirm already aligned
          </button>
          <label className="mt-4 block text-sm font-medium">
            Control pairs: drawing x,y,terrain x,y — one pair per line
            <textarea
              className={input}
              rows={4}
              value={controlsText}
              onChange={(event) => {
                setControlsText(event.target.value);
                setRegistration(undefined);
                invalidateRegistrationDerived(
                  "Control points changed; registration confirmation and drawing-derived geometry are stale.",
                );
              }}
            />
          </label>
          <Field
            label="Residual warning threshold (m)"
            value={residualThreshold}
            onChange={setResidualThreshold}
          />
          <button className={`${button} mt-3`} onClick={solveControls}>
            Solve and confirm similarity registration
          </button>
          {registration && (
            <div className="mt-4 rounded-xl bg-card p-4 text-sm">
              <p>
                {registration.method}; drawing-to-terrain; {registration.pointCount} controls
              </p>
              <p>
                Translation {registration.translation.x}, {registration.translation.y} m; rotation{" "}
                {registration.rotationDegrees}°; uniform scale {registration.scale}
              </p>
              <p>
                RMS residual {registration.rmsResidual} m; maximum {registration.maximumResidual} m
              </p>
              <p>
                Registration status: confirmed and active; authoritative direction is drawing
                coordinates to terrain local metric coordinates. Order: uniform scale, rotation,
                then translation.
              </p>
              {eligibleDrawingPolygons[0] &&
                (() => {
                  const transformed = applyRegistrationToPolygon(
                    eligibleDrawingPolygons[0].original,
                    registration,
                  );
                  const xs = transformed.vertices.map((point) => point.x);
                  const ys = transformed.vertices.map((point) => point.y);
                  return (
                    <p>
                      First eligible transformed bounds: x {Math.min(...xs)} to {Math.max(...xs)} m;
                      y {Math.min(...ys)} to {Math.max(...ys)} m.
                    </p>
                  );
                })()}
              <ul>
                {registration.residuals.map((residual) => (
                  <li key={residual.controlId}>
                    {residual.controlId}: {residual.distance} m
                  </li>
                ))}
              </ul>
              {registration.warnings.map((warning) => (
                <p key={warning}>Warning: {warning}</p>
              ))}
            </div>
          )}
        </section>
        <section className="rounded-2xl border p-5">
          <h2 className="text-2xl font-semibold">Reviewed drawing polygons</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Eligible accepted closed polygons remain immutable in drawing coordinates. Selection
            creates a separately registered drawing-to-terrain geometry with its source object ID.
          </p>
          {eligibleDrawingPolygons.length ? (
            <ul className="mt-3 space-y-3">
              {eligibleDrawingPolygons.map(({ object, original, sourcePage }) => (
                <li key={object.id} className="rounded-xl border p-3">
                  <p>
                    {object.name}; object {object.id}; page {sourcePage ?? "not supplied"};{" "}
                    classification {String(object.metadata.classification ?? "not supplied")};
                    calibration {String(object.metadata.calibrationId ?? "not supplied")};{" "}
                    {object.reviewStatus}; {original.vertices.length - 1} boundary segments.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button className={button} onClick={() => selectDrawingBoundary(object.id)}>
                      Use as site boundary
                    </button>
                    <button className={button} onClick={() => selectDrawingExclusion(object.id)}>
                      Use as exclusion
                    </button>
                    <button className={button} onClick={() => selectDrawingArea(object.id)}>
                      Use as array area
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3">No eligible reviewed closed drawing polygon.</p>
          )}
        </section>
        <section className="rounded-2xl border p-5">
          <h2 className="text-2xl font-semibold">3. Boundary and exclusions</h2>
          <PolygonField
            label="Manual site boundary coordinates (x,y metres)"
            value={boundaryText}
            onChange={setBoundaryText}
          />
          <button className={`${button} mt-3`} onClick={createBoundary}>
            Review active site boundary
          </button>
          {boundary && (
            <p className="mt-3">
              Site area: {boundary.areaSquareMeters.toFixed(2)} m² (
              {(boundary.areaSquareMeters / 10_000).toFixed(4)} ha); local metric coordinates;
              reviewed.
            </p>
          )}
          <h3 className="mt-6 text-lg font-semibold">Exclusion zone</h3>
          <PolygonField
            label="Exclusion coordinates (x,y metres)"
            value={exclusionText}
            onChange={setExclusionText}
          />
          <label className="mt-3 block text-sm">
            Category
            <select
              className={input}
              value={exclusionCategory}
              onChange={(event) => setExclusionCategory(event.target.value as ExclusionCategory)}
            >
              {exclusionCategories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <Field
            label="Engineer-entered reason"
            value={exclusionReason}
            onChange={setExclusionReason}
          />
          <Field
            label="Exclusion setback meters"
            value={exclusionSetback}
            onChange={setExclusionSetback}
          />
          <button className={`${button} mt-3`} onClick={addExclusion}>
            Add reviewed exclusion
          </button>
          {exclusions.map((zone) => (
            <p key={zone.id} className="mt-2">
              {zone.id}: {zone.category}; {zone.reason}; setback {zone.setbackMeters ?? 0} m;
              reviewed
            </p>
          ))}
        </section>
        <section className="rounded-2xl border p-5">
          <h2 className="text-2xl font-semibold">4. Mounting, table, and terrain assumptions</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(tableForm).map(([name, value]) =>
              name === "orientation" ? (
                <label key={name} className="text-sm">
                  Orientation
                  <select
                    className={input}
                    value={value}
                    onChange={(event) =>
                      setTableForm((current) => ({ ...current, orientation: event.target.value }))
                    }
                  >
                    <option>portrait</option>
                    <option>landscape</option>
                  </select>
                </label>
              ) : (
                <Field
                  key={name}
                  label={label(name)}
                  value={value}
                  onChange={(next) => setTableForm((current) => ({ ...current, [name]: next }))}
                />
              ),
            )}
          </div>
          <button className={`${button} mt-3`} onClick={defineTable}>
            Calculate table definition
          </button>
          {tableDefinition && (
            <p className="mt-3">
              Module envelope from approved record {tableDefinition.moduleRecordId}; table{" "}
              {tableDefinition.widthMeters} m × {tableDefinition.slopeLengthMeters} m slope length;
              projected depth {tableDefinition.projectedDepthMeters} m;{" "}
              {tableDefinition.moduleCount} modules; {tableDefinition.dcPowerWatts} W DC.
            </p>
          )}
          <h3 className="mt-6 text-lg font-semibold">
            Engineer-entered terrain buildability limits (optional)
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Object.entries(limitsForm).map(([name, value]) => (
              <Field
                key={name}
                label={label(name)}
                value={value}
                onChange={(next) => setLimitsForm((current) => ({ ...current, [name]: next }))}
              />
            ))}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            No grading, drainage, structural conclusion, or hidden default is applied. Missing
            terrain samples produce Not evaluated.
          </p>
        </section>
        <section className="rounded-2xl border p-5">
          <h2 className="text-2xl font-semibold">5. Array areas and deterministic generation</h2>
          <PolygonField
            label="Array-area coordinates (x,y metres)"
            value={areaText}
            onChange={setAreaText}
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(areaForm).map(([name, value]) => (
              <Field
                key={name}
                label={label(name)}
                value={value}
                onChange={(next) => setAreaForm((current) => ({ ...current, [name]: next }))}
              />
            ))}
          </div>
          <button className={`${button} mt-3`} onClick={addArea}>
            Add reviewed array area
          </button>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={button} onClick={generate}>
              Generate deterministic tables
            </button>
            <button className={button} onClick={cancel}>
              Cancel generation
            </button>
          </div>
          {areas.map((area) => (
            <p key={area.id} className="mt-2">
              {area.id}: {area.name}; {area.areaSquareMeters.toFixed(2)} m²; pitch{" "}
              {area.rowPitchMeters} m; spacing {area.columnSpacingMeters} m.{" "}
              {area.warnings.join(" ")}
            </p>
          ))}
        </section>
        <Layout2D
          boundary={boundary?.geometry}
          drawingPolygons={registeredDrawingPolygons}
          exclusions={exclusions}
          areas={areas}
          tables={tables}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          view={view}
          setView={setView}
          layers={layers}
          setLayers={setLayers}
        />
        <section className="rounded-2xl border p-4">
          <button className={button} onClick={() => setShow3d((visible) => !visible)}>
            {show3d ? "Close 3D review" : "Open 3D review"}
          </button>
          <p className="mt-2 text-sm">
            The complete 2D review remains mounted and usable when 3D is closed or unavailable.
          </p>
        </section>
        {show3d && (
          <Layout3DReview
            tables={tables}
            boundary={boundary?.geometry}
            terrainScene={terrain}
            drawingScene={drawing}
            selectedId={selectedId}
            registration={registration}
            exclusions={exclusions}
            areas={areas}
            terrainSampler={terrainSampler}
          />
        )}
        <section className="rounded-2xl border p-5">
          <h2 className="text-2xl font-semibold">Layout findings register</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Failing tables remain in the generated layout for explicit engineering review.
          </p>
          <ul className="mt-3 text-sm" aria-label="Finding counts by code and result">
            {findingSummary.map(([label, count]) => (
              <li key={label}>
                {label} ({count})
              </li>
            ))}
          </ul>
          <ul className="mt-3 max-h-80 overflow-auto text-sm">
            {tables
              .flatMap((table) => table.findings)
              .filter((finding) => finding.status !== "pass")
              .slice(0, 500)
              .map((finding, index) => (
                <li key={`${finding.affectedObjectId}-${finding.code}-${index}`}>
                  {finding.affectedObjectId}: {finding.code}: {finding.status} —{" "}
                  {finding.explanation}
                </li>
              ))}
          </ul>
        </section>
        <section className="rounded-2xl border p-5">
          <h2 className="text-2xl font-semibold">Selected table and findings</h2>
          {selected ? (
            <>
              <p>
                {selected.id}; centre {selected.center.x}, {selected.center.y} m; row{" "}
                {selected.rowIndex}; column {selected.columnIndex}; status {selected.reviewStatus}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field
                  label="Duplicate east offset meters"
                  value={duplicateOffset.x}
                  onChange={(value) => setDuplicateOffset((current) => ({ ...current, x: value }))}
                />
                <Field
                  label="Duplicate north offset meters"
                  value={duplicateOffset.y}
                  onChange={(value) => setDuplicateOffset((current) => ({ ...current, y: value }))}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className={button}
                  onClick={() =>
                    changeSelected({
                      type: "move",
                      center: { x: selected.center.x + 1, y: selected.center.y },
                    })
                  }
                >
                  Move +1 m east
                </button>
                <button
                  className={button}
                  onClick={() =>
                    changeSelected({
                      type: "rotate",
                      azimuthDegrees: (selected.azimuthDegrees + 5) % 360,
                    })
                  }
                >
                  Rotate +5°
                </button>
                <button className={button} onClick={() => changeSelected({ type: "exclude" })}>
                  Exclude table
                </button>
                <button className={button} onClick={() => changeSelected({ type: "restore" })}>
                  Restore unresolved
                </button>
                <button className={button} onClick={() => setSelectedReviewStatus("reviewed")}>
                  Mark reviewed
                </button>
                <button
                  className={button}
                  onClick={() =>
                    setSelectedReviewStatus("approved-for-preliminary-draflio-workflow")
                  }
                >
                  Approve for preliminary Draflio workflow
                </button>
                <button className={button} onClick={() => setSelectedReviewStatus("unresolved")}>
                  Revoke preliminary approval
                </button>
                <button className={button} onClick={duplicateSelected}>
                  Duplicate safely
                </button>
                <button className={button} onClick={deleteSelectedManualTable}>
                  Delete manual duplicate
                </button>
              </div>
              <ul className="mt-3">
                {selected.findings.map((finding) => (
                  <li key={finding.code}>
                    {finding.code}: {finding.status} — {finding.explanation}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>Select a table in the 2D review.</p>
          )}
        </section>
        {stats && (
          <section className="rounded-2xl border p-5">
            <h2 className="text-2xl font-semibold">Layout statistics</h2>
            <p>
              Generated {stats.generatedTableCount}; accepted {stats.acceptedTableCount}; excluded{" "}
              {stats.excludedTableCount}; unresolved {stats.unresolvedTableCount}. Counts include
              failing and unresolved tables unless excluded.
            </p>
            <p>
              {stats.moduleCount} modules; preliminary DC capacity {stats.dcCapacityWatts} W.
            </p>
            <p>
              GCR {stats.groundCoverageRatio.toFixed(6)} — {stats.groundCoverageMethod}.
            </p>
            <p>
              Terrain coverage{" "}
              {stats.terrainCoverageFraction === undefined
                ? "Not evaluated"
                : stats.terrainCoverageFraction.toFixed(4)}
              .
            </p>
          </section>
        )}
        <section className="flex flex-wrap gap-2 rounded-2xl border p-5">
          <button
            className={button}
            disabled={!tables.length}
            onClick={() =>
              download(
                `${JSON.stringify(layoutToDraflioScene(review()), null, 2)}\n`,
                "draflio-layout-scene.json",
                "application/json",
              )
            }
          >
            Download layout DraflioScene JSON
          </button>
          <button
            className={button}
            disabled={!tables.length}
            onClick={() =>
              download(
                serializeLayoutReview(review()),
                "draflio-layout-review.json",
                "application/json",
              )
            }
          >
            Download layout-review JSON
          </button>
          <button
            className={button}
            disabled={!tables.length}
            onClick={() =>
              download(
                findingsCsv(tables.flatMap((table) => table.findings)),
                "draflio-layout-findings.csv",
                "text/csv",
              )
            }
          >
            Download layout findings CSV
          </button>
          <button
            className={button}
            disabled={!tables.length}
            onClick={() =>
              download(tableScheduleCsv(review()), "draflio-table-schedule.csv", "text/csv")
            }
          >
            Download table schedule CSV
          </button>
          <FileField
            label="Restore layout-review JSON"
            onFile={(file) =>
              void file.text().then((text) => {
                try {
                  const parsed = parseLayoutReview(text);
                  setRegistration(parsed.registration);
                  setBoundary(parsed.siteBoundary);
                  setExclusions(parsed.exclusions);
                  setAreas(parsed.arrayAreas);
                  setTableDefinition(parsed.tableDefinitions[0]);
                  setTables(parsed.tables);
                  setStatus("Reviewed layout JSON restored locally.");
                } catch (caught) {
                  fail(caught);
                }
              })
            }
          />
          <button className={button} onClick={startOver}>
            Start over
          </button>
        </section>
      </main>
    </RenewablePage>
  );
}

function Layout2D(props: {
  boundary?: Polygon2;
  drawingPolygons: readonly { id: string; geometry: Polygon2 }[];
  exclusions: readonly ExclusionZone[];
  areas: readonly ArrayArea[];
  tables: readonly GeneratedTable[];
  selectedId?: string;
  setSelectedId: (id: string) => void;
  view: { x: number; y: number; scale: number };
  setView: React.Dispatch<React.SetStateAction<{ x: number; y: number; scale: number }>>;
  layers: Record<"drawing" | "boundary" | "exclusions" | "areas" | "tables", boolean>;
  setLayers: React.Dispatch<
    React.SetStateAction<
      Record<"drawing" | "boundary" | "exclusions" | "areas" | "tables", boolean>
    >
  >;
}) {
  const drag = useRef<{ x: number; y: number; viewX: number; viewY: number } | undefined>(
    undefined,
  );
  const polygon = (geometry: Polygon2) =>
    geometry.vertices.map((point) => `${point.x},${-point.y}`).join(" ");
  const fitGeometry = (geometry?: Polygon2) => {
    if (!geometry?.vertices.length) return;
    const xs = geometry.vertices.map((point) => point.x);
    const ys = geometry.vertices.map((point) => point.y);
    const width = Math.max(Math.max(...xs) - Math.min(...xs), 1);
    const height = Math.max(Math.max(...ys) - Math.min(...ys), 1);
    const scale = Math.max(0.1, Math.min(100, Math.min(900 / width, 400 / height)));
    const visibleWidth = 1000 / scale;
    const visibleHeight = 500 / scale;
    props.setView({
      x: (Math.min(...xs) + Math.max(...xs) - visibleWidth) / 2,
      y: -(Math.min(...ys) + Math.max(...ys) + visibleHeight) / 2,
      scale,
    });
  };
  const selected = props.tables.find((table) => table.id === props.selectedId);
  return (
    <section className="rounded-2xl border p-5">
      <h2 className="text-2xl font-semibold">2D review studio</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className={button}
          onClick={() => props.setView((view) => ({ ...view, scale: view.scale * 1.2 }))}
        >
          Zoom in
        </button>
        <button
          className={button}
          onClick={() => props.setView((view) => ({ ...view, scale: view.scale / 1.2 }))}
        >
          Zoom out
        </button>
        <button className={button} onClick={() => fitGeometry(props.boundary)}>
          Fit site
        </button>
        <button
          className={button}
          disabled={!selected}
          onClick={() => fitGeometry(selected?.footprint)}
        >
          Fit selection
        </button>
        <button className={button} onClick={() => props.setView({ x: 0, y: 0, scale: 5 })}>
          Reset view
        </button>
        {Object.keys(props.layers).map((name) => (
          <label key={name} className="rounded-lg border p-2 text-sm">
            <input
              type="checkbox"
              checked={props.layers[name as keyof typeof props.layers]}
              onChange={(event) =>
                props.setLayers((layers) => ({ ...layers, [name]: event.target.checked }))
              }
            />{" "}
            {name}
          </label>
        ))}
      </div>
      <svg
        aria-label="Interactive 2D solar layout review in metres"
        className="mt-3 h-[520px] w-full touch-none rounded-xl bg-background"
        viewBox={`${props.view.x} ${props.view.y - 500 / props.view.scale} ${1000 / props.view.scale} ${500 / props.view.scale}`}
        onWheel={(event) => {
          event.preventDefault();
          props.setView((view) => ({
            ...view,
            scale: Math.max(0.1, Math.min(100, view.scale * (event.deltaY < 0 ? 1.1 : 0.9))),
          }));
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            viewX: props.view.x,
            viewY: props.view.y,
          };
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          props.setView((view) => ({
            ...view,
            x: drag.current!.viewX - (event.clientX - drag.current!.x) / view.scale,
            y: drag.current!.viewY - (event.clientY - drag.current!.y) / view.scale,
          }));
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
          drag.current = undefined;
        }}
        onPointerCancel={() => {
          drag.current = undefined;
        }}
        onLostPointerCapture={() => {
          drag.current = undefined;
        }}
      >
        {props.layers.drawing &&
          props.drawingPolygons.map((reference) => (
            <polyline
              key={reference.id}
              points={polygon(reference.geometry)}
              fill="none"
              stroke="#60a5fa"
              strokeDasharray="1 1"
              strokeWidth="0.2"
            />
          ))}
        {props.layers.boundary && props.boundary && (
          <polygon
            points={polygon(props.boundary)}
            fill="none"
            stroke="#f5d76e"
            strokeWidth="0.4"
          />
        )}
        {props.layers.exclusions &&
          props.exclusions.map((zone) => (
            <polygon
              key={zone.id}
              points={polygon(zone.geometry)}
              fill="rgba(239,68,68,.25)"
              stroke="#ef4444"
              strokeWidth="0.3"
            />
          ))}
        {props.layers.areas &&
          props.areas.map((area) => (
            <polygon
              key={area.id}
              points={polygon(area.geometry)}
              fill="rgba(59,130,246,.08)"
              stroke="#3b82f6"
              strokeWidth="0.3"
            />
          ))}
        {props.layers.tables &&
          props.tables.map((table) => (
            <polygon
              key={table.id}
              tabIndex={0}
              role="button"
              aria-label={`${table.id}, ${table.reviewStatus}`}
              points={polygon(table.footprint)}
              fill={
                table.id === props.selectedId
                  ? "#facc15"
                  : table.reviewStatus === "excluded"
                    ? "#9ca3af"
                    : table.findings.some((finding) => finding.status === "fail")
                      ? "#ef4444"
                      : "#22c55e"
              }
              stroke="#111827"
              strokeWidth="0.15"
              onClick={() => props.setSelectedId(table.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") props.setSelectedId(table.id);
              }}
            />
          ))}
      </svg>
      <p className="mt-2 text-sm">
        Legend: registered drawing blue dashed; boundary gold outline; exclusion red hatch area;
        array blue outline; table green no failing finding, red failing, grey excluded, yellow
        selected. Units: metres.
      </p>
    </section>
  );
}
function FileField({ label, onFile }: { label: string; onFile: (file: File) => void }) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input
        className="mt-2 block w-full text-sm"
        type="file"
        accept=".json,application/json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
        }}
      />
    </label>
  );
}
function Field({
  label: text,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium">
      {text}
      <input className={input} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
function PolygonField({
  label: text,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-3 block text-sm font-medium">
      {text}
      <textarea
        className={input}
        rows={5}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function formatInteger(value: number) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function validGeneratedTables(
  value: unknown,
  areas: readonly ArrayArea[],
  table: TableDefinition,
): value is GeneratedTable[] {
  if (!Array.isArray(value) || value.length > LAYOUT_LIMITS.maxTables) return false;
  const areaIds = new Set(areas.map((area) => area.id));
  const ids = new Set<string>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") return false;
    const generated = candidate as Partial<GeneratedTable>;
    if (
      typeof generated.id !== "string" ||
      ids.has(generated.id) ||
      !generated.arrayAreaId ||
      !areaIds.has(generated.arrayAreaId) ||
      generated.tableTypeId !== table.id ||
      !generated.center ||
      !Number.isFinite(generated.center.x) ||
      !Number.isFinite(generated.center.y) ||
      !generated.footprint ||
      !Array.isArray(generated.footprint.vertices) ||
      generated.footprint.vertices.some(
        (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y),
      ) ||
      !Array.isArray(generated.findings) ||
      !Array.isArray(generated.editHistory)
    )
      return false;
    ids.add(generated.id);
  }
  return true;
}

function parsePolygon(text: string): Polygon2 {
  return {
    vertices: text
      .trim()
      .split(/\r?\n/)
      .map((line, index): Point2 => {
        const values = line.split(",").map(Number);
        if (values.length !== 2 || values.some((value) => !Number.isFinite(value)))
          throw new Error(`Polygon row ${index + 1} requires finite x,y coordinates.`);
        return { x: values[0], y: values[1] };
      }),
  };
}
function optionalNumber(value: string) {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Optional numeric value must be finite.");
  return parsed;
}
function label(name: string) {
  return name.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase());
}
const exclusionCategories: ExclusionCategory[] = [
  "statutory-setback",
  "access-restriction",
  "environmental-exclusion",
  "water-body",
  "building",
  "road-reserve",
  "electrical-clearance",
  "terrain-restriction",
  "temporary-exclusion",
  "other-reviewed-exclusion",
];
