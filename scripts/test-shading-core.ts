import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  calculateSunPosition,
  buildTableSpatialIndex,
  buildObstructionShadowIndex,
  combineDomainFindings,
  createObstruction,
  duplicateObstruction,
  editObstruction,
  evaluateIndexedRowShading,
  evaluateIndexedObstructions,
  evaluateHorizon,
  evaluateObstruction,
  evaluateRowShading,
  excludeObstruction,
  horizonAt,
  normalizeHorizon,
  projectShadow,
  restoreObstruction,
  reviewObstruction,
  shadingReviewBlockers,
  summarizeTimeRange,
  terrainBlocks,
  transitionShadingReview,
  tableSamples,
  validateObstruction,
  validateProject,
} from "../shared/renewableEnergy/shading/shadingCore";
import {
  findingsCsv,
  createShadingSceneCompanion,
  serializeShadingReview,
  serializeShadingSceneCompanion,
  timeRangeSummaryCsv,
} from "../shared/renewableEnergy/shading/shadingSerialization";
import {
  validateHorizonProfile,
  validateLayoutReview,
  validateObstructions,
  validateTerrainMesh,
  validateTimeRangeResponse,
} from "../shared/renewableEnergy/shading/shadingValidation";
import {
  SHADING_2D_TOLERANCE,
  createShading2DTransform,
  hitTestPoints,
  hitTestPolygons,
  projectToScreen,
  permittedShading2DError,
  projectHitRadius,
  screenToProject,
  withinShading2DTolerance,
} from "../shared/renewableEnergy/shading/shading2D";
import {
  acceptDraflioShadingSource,
  acceptDrawingObstructionSource,
  reviewDraflioShadingSource,
  reviewDrawingObstructionSource,
  ShadingImportError,
} from "../shared/renewableEnergy/shading/shadingImports";
import { createEmptyDraflioScene } from "../shared/renewableEnergy/draflioSceneSerialization";
import { prepareShading3DSceneData } from "../shared/renewableEnergy/shading/shading3D";
import {
  SHADING_RULE_VERSION,
  SHADING_SCHEMA_NAME,
  SHADING_SCHEMA_VERSION,
  type HorizonPoint,
  type ProjectTime,
  type ShadingReview,
} from "../shared/renewableEnergy/shading/shadingTypes";
import type { GeneratedTable, LayoutReview } from "../shared/renewableEnergy/layout/layoutTypes";

const utc: ProjectTime = {
  latitudeDegrees: 39.742476,
  longitudeDegrees: -105.1786,
  timezone: "UTC",
  fixedOffsetMinutes: -420,
  daylightSaving: "not-applicable-fixed-offset",
  projectNorthDegrees: 0,
};
const transform = createShading2DTransform({ x: -10, y: 5 }, 100, 50, 800, 600);
const projectPoint = { x: 17.25, y: 23.5 };
const roundTrip = screenToProject(projectToScreen(projectPoint, transform), transform);
assert.ok(Math.abs(roundTrip.x - projectPoint.x) <= SHADING_2D_TOLERANCE);
assert.ok(Math.abs(roundTrip.y - projectPoint.y) <= SHADING_2D_TOLERANCE);
let maximumTransformError = 0;
for (const fixture of [
  { minimum: { x: -0.001, y: -0.001 }, width: 0.002, height: 0.002, point: { x: 0, y: 0 } },
  {
    minimum: { x: -1e8, y: -1e8 },
    width: 2e8,
    height: 1,
    point: { x: 99_999_999, y: -99_999_999.5 },
  },
  { minimum: { x: -1, y: -1e8 }, width: 1, height: 2e8, point: { x: -0.5, y: 99_999_999 } },
  {
    minimum: { x: 1e8 - 0.01, y: -1e8 },
    width: 0.01,
    height: 10,
    point: { x: 1e8 - 0.005, y: -99_999_995 },
  },
]) {
  const candidate = createShading2DTransform(
    fixture.minimum,
    fixture.width,
    fixture.height,
    1920,
    320,
  );
  let repeated = fixture.point;
  for (let iteration = 0; iteration < 100; iteration += 1)
    repeated = screenToProject(projectToScreen(repeated, candidate), candidate);
  const error = Math.max(
    Math.abs(repeated.x - fixture.point.x),
    Math.abs(repeated.y - fixture.point.y),
  );
  maximumTransformError = Math.max(maximumTransformError, error);
  assert.ok(withinShading2DTolerance(repeated.x, fixture.point.x));
  assert.ok(withinShading2DTolerance(repeated.y, fixture.point.y));
}
assert.throws(() => createShading2DTransform({ x: 0, y: 0 }, 0, 1, 100, 100), /positive/);
assert.throws(() => createShading2DTransform({ x: Number.NaN, y: 0 }, 1, 1, 100, 100), /finite/);
assert.equal(
  hitTestPolygons({ x: 1.5, y: 0.5 }, [
    {
      id: "lower",
      precedence: 2,
      polygon: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
      ],
    },
    {
      id: "higher",
      precedence: 1,
      polygon: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
      ],
    },
  ]),
  "higher",
);
// Published NREL SPA example: 2003-10-17 12:30:30 local UTC-7, zenith 50.11162°, azimuth 194.34024°.
const reference = calculateSunPosition(new Date("2003-10-17T19:30:30.000Z"), utc);
assert.ok(
  Math.abs(reference.zenithDegrees - 50.11162) < 0.05,
  `SPA zenith difference ${reference.zenithDegrees - 50.11162}`,
);
assert.ok(
  Math.abs(reference.azimuthDegrees - 194.34024) < 0.05,
  `SPA azimuth difference ${reference.azimuthDegrees - 194.34024}`,
);
assert.deepEqual(reference, calculateSunPosition(new Date("2003-10-17T19:30:30.000Z"), utc));
for (const project of [
  { ...utc, latitudeDegrees: 0, longitudeDegrees: 0, fixedOffsetMinutes: 0 },
  { ...utc, latitudeDegrees: -33.86, longitudeDegrees: 151.2, fixedOffsetMinutes: 600 },
  { ...utc, latitudeDegrees: 78.2, longitudeDegrees: 15.6, fixedOffsetMinutes: 60 },
])
  for (const date of ["2024-02-29T12:00:00Z", "2024-06-21T00:00:00Z", "2024-12-21T12:00:00Z"]) {
    const result = calculateSunPosition(new Date(date), project);
    assert.ok(Number.isFinite(result.azimuthDegrees));
    assert.ok(result.elevationDegrees >= -90 && result.elevationDegrees <= 90);
  }
assert.equal(
  calculateSunPosition(new Date("2024-12-21T12:00:00Z"), {
    ...utc,
    latitudeDegrees: 89,
    longitudeDegrees: 0,
    fixedOffsetMinutes: 0,
  }).polarState,
  "polar-night",
);
assert.throws(() => validateProject({ ...utc, latitudeDegrees: 91 }), /Latitude/);
assert.throws(() => validateProject({ ...utc, longitudeDegrees: 181 }), /Longitude/);
assert.throws(
  () => validateProject({ ...utc, timezone: "Invalid/Zone", fixedOffsetMinutes: undefined }),
  /Timezone/,
);
assert.equal(permittedShading2DError(0, 0), 5e-8);
assert.ok(Math.abs(permittedShading2DError(1e8, 1e8) - 0.00000505) < 1e-15);
assert.throws(() => permittedShading2DError(Number.NaN, 0), /finite/);
assert.equal(projectHitRadius(100), 0.1);
assert.equal(projectHitRadius(1e-9), 10);
assert.equal(projectHitRadius(1e9), 0.01);
assert.equal(
  hitTestPoints({ x: 0, y: 0 }, 1, [
    { id: "sample", precedence: 6, point: { x: 0, y: 0 } },
    { id: "block", precedence: 1, point: { x: 0.5, y: 0 } },
  ]),
  "block",
);
assert.equal(
  hitTestPoints({ x: 0, y: 0 }, 1, [
    { id: "z-sample", precedence: 6, point: { x: 0, y: 0 } },
    { id: "a-sample", precedence: 6, point: { x: 0, y: 0 } },
  ]),
  "a-sample",
);

const horizon: HorizonPoint[] = [0, 45, 90, 135, 180, 225, 270, 315].map((azimuthDegrees) => ({
  azimuthDegrees,
  elevationDegrees: 10,
  source: "survey",
  notes: "",
  reviewStatus: "reviewed",
}));
assert.equal(horizonAt(horizon, 359), 10);
assert.equal(
  horizonAt(
    horizon.filter((point) => point.azimuthDegrees !== 45),
    45,
  ),
  undefined,
);
assert.throws(() => normalizeHorizon([...horizon, { ...horizon[0] }]), /Duplicate/);
assert.equal(
  evaluateHorizon(horizon, "T1", {
    ...reference,
    azimuthDegrees: 0,
    elevationDegrees: 5,
    belowHorizon: false,
  }).state,
  "shaded",
);

function table(id: string, x: number, elevation = 0): GeneratedTable {
  return {
    id,
    arrayAreaId: "A",
    tableTypeId: "D",
    moduleRecordId: "M",
    moduleCount: 1,
    dcPowerWatts: 400,
    footprint: {
      vertices: [
        { x, y: 0 },
        { x: x + 2, y: 0 },
        { x: x + 2, y: 1 },
        { x, y: 1 },
      ],
    },
    center: { x: x + 1, y: 0.5 },
    azimuthDegrees: 180,
    tiltDegrees: 30,
    rowIndex: 0,
    columnIndex: x,
    terrainSamples: [{ point: { x, y: 0 }, elevation }],
    reviewStatus: "reviewed",
    findings: [],
    algorithmVersion: "layout-generation-1.0",
    generationAssumptions: "test",
    editHistory: [],
  };
}
const source = table("S", 0, 1),
  receiver = table("R", 0, -1);
const highSun = { ...reference, elevationDegrees: 60, belowHorizon: false, azimuthDegrees: 0 };
assert.ok(projectShadow(source.footprint.vertices, 2, highSun).length > 0);
const row = evaluateRowShading(source, receiver, highSun);
assert.equal(row.sourceObjectId, "S");
assert.equal(row.receiverObjectId, "R");
assert.ok(row.geometricShadedFraction !== undefined);
assert.equal(
  evaluateRowShading({ ...source, terrainSamples: [] }, receiver, highSun).state,
  "not-evaluated",
);
const indexedTables = [source, receiver, table("FAR", 1_000, 0)];
const tableIndex = buildTableSpatialIndex(indexedTables);
assert.deepEqual(
  evaluateIndexedRowShading(source, tableIndex, highSun).map((finding) => finding.receiverObjectId),
  evaluateIndexedRowShading(source, tableIndex, highSun).map((finding) => finding.receiverObjectId),
);
assert.equal(tableSamples(source, "centre").length, 1);
assert.equal(tableSamples(source, "corners").length, 4);
assert.equal(tableSamples(source, "footprint-corners-and-centre").length, 5);
assert.equal(tableSamples(source, "module-grid", { rows: 1, columns: 1 }).length, 1);
assert.throws(
  () => tableSamples({ ...source, moduleCount: 2 }, "module-grid", { rows: 1, columns: 1 }),
  /module count/,
);
assert.throws(() => buildTableSpatialIndex([source, { ...source }]), /Duplicate table ID/);

const box = {
  id: "B",
  classification: "building-box" as const,
  footprint: [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: 1 },
    { x: 0, y: 1 },
  ],
  baseElevationMeters: 0,
  heightMeters: 4,
  source: "survey",
  notes: "Explicit test envelope",
  reviewStatus: "reviewed" as const,
  uncertaintyMeters: 0.2,
  provenance: "engineer review",
  creationMethod: "manual" as const,
  lifecycleHistory: [
    { sequence: 1, action: "created" as const, detail: "Created." },
    { sequence: 2, action: "reviewed" as const, detail: "Reviewed." },
  ],
};
validateObstruction(box);
assert.equal(evaluateObstruction(box, receiver, highSun).domain, "obstruction");
const obstructionIndex = buildObstructionShadowIndex([box], highSun);
assert.deepEqual(
  evaluateIndexedObstructions(obstructionIndex, receiver, highSun),
  evaluateIndexedObstructions(obstructionIndex, receiver, highSun),
);
assert.equal(buildObstructionShadowIndex([], highSun).obstructions.size, 0);
assert.throws(() => buildObstructionShadowIndex([box, { ...box }], highSun), /Duplicate/);
assert.throws(() => validateObstruction({ ...box, heightMeters: 0 }), /height/);
const { lifecycleHistory: _history, reviewStatus: _status, ...boxInput } = box;
const lifecycleDraft = createObstruction({
  ...boxInput,
  id: "L",
});
assert.equal(lifecycleDraft.reviewStatus, "draft");
const lifecycleReviewed = reviewObstruction(lifecycleDraft);
assert.equal(lifecycleReviewed.reviewStatus, "reviewed");
assert.equal(editObstruction(lifecycleReviewed, { heightMeters: 5 }).reviewStatus, "draft");
assert.equal(excludeObstruction(lifecycleReviewed).reviewStatus, "excluded");
assert.equal(restoreObstruction(excludeObstruction(lifecycleReviewed)).reviewStatus, "restored");
assert.equal(duplicateObstruction(lifecycleReviewed, ["L-copy-1"]).id, "L-copy-2");
const mesh = {
  vertices: [
    { x: -10, y: -1, z: 0 },
    { x: 10, y: -1, z: 0 },
    { x: 0, y: 10, z: 10 },
  ],
  triangles: [[0, 1, 2] as [number, number, number]],
};
assert.equal(
  terrainBlocks(mesh, { x: 0, y: 0, z: 1 }, { ...highSun, elevationDegrees: 20, azimuthDegrees: 0 })
    .state,
  "blocked",
);
assert.throws(
  () => terrainBlocks({ vertices: mesh.vertices, triangles: [] }, { x: 0, y: 0, z: 1 }, highSun),
  /no triangles/,
);

const layout = {
  schemaName: "draflio-layout-review",
  schemaVersion: "1.0",
  projectName: "Test",
  coordinateSystem: "registered-local-metric",
  inputs: {},
  exclusions: [],
  terrainLimits: {},
  tableDefinitions: [],
  arrayAreas: [],
  tables: [source, receiver],
  findings: [],
  reviewStatus: "reviewed",
  limitations: [],
  algorithmVersions: [],
} as LayoutReview;
const registeredLayout: LayoutReview = {
  ...structuredClone(layout),
  registration: {
    method: "already-aligned",
    active: true,
    confirmed: true,
    pointCount: 0,
    translation: { x: 0, y: 0 },
    rotationDegrees: 0,
    scale: 1,
    rmsResidual: 0,
    maximumResidual: 0,
    residuals: [],
    transformDirection: "drawing-to-terrain",
    warningThresholdMeters: 0.1,
    warnings: [],
    algorithmVersion: "similarity-registration-1.0",
  },
};
const sourceScene = createEmptyDraflioScene("Test source");
sourceScene.sceneId = "00000000-0000-4000-8000-000000000010";
sourceScene.coordinateSystem = { type: "local", name: "Registered local metric" };
sourceScene.reviewSummary.status = "approved";
const sourceEnvelope = {
  sourceType: "draflio-scene-authoritative-layout",
  schemaVersion: "1.0",
  calculationVersion: SHADING_RULE_VERSION,
  projectReference: "Test",
  sourceSceneReference: sourceScene.sceneId,
  coordinateSystem: "registered-local-metric",
  units: "metres",
  registrationState: "confirmed",
  sourceReviewState: "approved",
  terrainRequired: false,
  scene: sourceScene,
  layoutReview: registeredLayout,
  provenance: "RE6A reviewed layout export.",
} as const;
const sourceImport = reviewDraflioShadingSource(sourceEnvelope, "Test");
assert.equal(sourceImport.state, "confirmation-required");
assert.throws(() => acceptDraflioShadingSource(sourceImport, false), /confirmation/);
assert.equal(acceptDraflioShadingSource(sourceImport, true).layoutReview.projectName, "Test");
assert.throws(() => reviewDraflioShadingSource(sourceEnvelope, "Other"), /Cross-project/);
assert.throws(
  () => reviewDraflioShadingSource({ ...sourceEnvelope, schemaVersion: "2.0" }, "Test"),
  /unsupported/,
);
const drawingEnvelope = {
  sourceType: "drawing-to-scene-obstructions",
  schemaVersion: "1.0",
  projectReference: "Test",
  drawingReference: "drawing-a",
  coordinateSystem: "registered-local-metric",
  units: "metres",
  registrationState: "confirmed",
  sourceReviewState: "reviewed",
  provenance: "RE4A reviewed vector source.",
  records: [
    {
      id: "wall-a",
      pageReference: 1,
      sourceObjectReference: "drawing-object-wall-a",
      footprint: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 1 },
        { x: 0, y: 1 },
        { x: 0, y: 0 },
      ],
      heightMeters: 2,
      baseElevationMeters: 0,
      baseElevationBasis: "explicit",
      classification: "wall",
      uncertaintyMeters: 0.1,
      provenance: "Reviewed object wall-a.",
      creationMethod: "reviewed-drawing",
    },
  ],
} as const;
const drawingImport = reviewDrawingObstructionSource(drawingEnvelope, "Test", ["drawing-wall-a"]);
assert.equal(drawingImport.records[0].id, "drawing-wall-a-1");
assert.equal(drawingImport.records[0].reviewStatus, "draft");
assert.equal(drawingImport.records[0].drawingProvenance?.originalId, "wall-a");
assert.throws(() => acceptDrawingObstructionSource(drawingImport, false), /confirmation/);
assert.equal(acceptDrawingObstructionSource(drawingImport, true).length, 1);
assert.throws(() => reviewDrawingObstructionSource(drawingEnvelope, "Other", []), /Cross-project/);
const rejectScene = (
  name: string,
  mutate: (candidate: Record<string, unknown>) => void,
  pattern: RegExp,
) => {
  const candidate = structuredClone(sourceEnvelope) as unknown as Record<string, unknown>;
  mutate(candidate);
  assert.throws(() => reviewDraflioShadingSource(candidate, "Test"), pattern, name);
};
assert.throws(() => reviewDraflioShadingSource(null, "Test"), /JSON object/);
assert.throws(() => reviewDraflioShadingSource([], "Test"), /JSON object/);
rejectScene("wrong schema", (value) => (value.sourceType = "wrong"), /unsupported/);
rejectScene("wrong version", (value) => (value.schemaVersion = "2.0"), /unsupported/);
rejectScene("wrong calculation", (value) => (value.calculationVersion = "wrong"), /incompatible/);
rejectScene("missing project", (value) => delete value.projectReference, /Project reference/);
rejectScene("missing identity", (value) => delete value.sourceSceneReference, /Source-scene/);
rejectScene(
  "coordinate mismatch",
  (value) => (value.coordinateSystem = "geographic"),
  /coordinate/,
);
rejectScene("unit mismatch", (value) => (value.units = "feet"), /coordinate/);
rejectScene("unregistered", (value) => (value.registrationState = "unresolved"), /coordinate/);
rejectScene(
  "unreviewed layout",
  (value) => {
    (value.layoutReview as LayoutReview).reviewStatus = "draft";
  },
  /authoritative/,
);
rejectScene(
  "duplicate tables",
  (value) => {
    const candidate = value.layoutReview as LayoutReview;
    candidate.tables = [...candidate.tables, structuredClone(candidate.tables[0])];
  },
  /Duplicate table/,
);
rejectScene(
  "non-finite table",
  (value) => {
    (value.layoutReview as LayoutReview).tables[0].footprint.vertices[0].x = Number.NaN;
  },
  /non-finite/,
);
rejectScene(
  "zero-area table",
  (value) => {
    (value.layoutReview as LayoutReview).tables[0].footprint.vertices = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
  },
  /area/,
);
rejectScene("missing required terrain", (value) => (value.terrainRequired = true), /required/);
rejectScene(
  "excessive tables",
  (value) => {
    const candidate = value.layoutReview as LayoutReview;
    candidate.tables = Array.from({ length: 10_001 }, (_, index) => ({
      ...structuredClone(candidate.tables[0]),
      id: `limit-table-${index}`,
    }));
  },
  /invalid or excessive/,
);
const terrainEnvelope = {
  ...structuredClone(sourceEnvelope),
  terrainRequired: true,
  terrain: {
    reviewState: "verified" as const,
    provenance: "Verified survey mesh.",
    mesh: {
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
        { x: 0, y: 10, z: 1 },
        { x: 10, y: 10, z: 1 },
      ],
      triangles: [
        [0, 1, 2],
        [1, 3, 2],
      ] as [number, number, number][],
    },
  },
};
const rejectTerrain = (
  name: string,
  mutate: (candidate: typeof terrainEnvelope) => void,
  pattern: RegExp,
) => {
  const candidate = structuredClone(terrainEnvelope);
  mutate(candidate);
  assert.throws(() => reviewDraflioShadingSource(candidate, "Test"), pattern, name);
};
rejectTerrain(
  "unverified terrain",
  (value) => {
    value.terrain.reviewState = "draft" as "verified";
  },
  /not verified/,
);
rejectTerrain(
  "non-finite vertex",
  (value) => {
    value.terrain.mesh.vertices[0].z = Number.NaN;
  },
  /finite/,
);
rejectTerrain(
  "invalid index",
  (value) => {
    value.terrain.mesh.triangles[0] = [0, 1, 99];
  },
  /invalid/,
);
rejectTerrain(
  "repeated index",
  (value) => {
    value.terrain.mesh.triangles[0] = [0, 1, 1];
  },
  /invalid/,
);
rejectTerrain(
  "duplicate triangle",
  (value) => {
    value.terrain.mesh.triangles[1] = [2, 1, 0];
  },
  /duplicates/,
);
rejectTerrain(
  "degenerate triangle",
  (value) => {
    value.terrain.mesh.vertices[2] = { x: 2, y: 0, z: 0 };
  },
  /degenerate/,
);
const rejectDrawing = (
  name: string,
  mutate: (candidate: Record<string, unknown>) => void,
  pattern: RegExp,
) => {
  const candidate = structuredClone(drawingEnvelope) as unknown as Record<string, unknown>;
  mutate(candidate);
  assert.throws(() => reviewDrawingObstructionSource(candidate, "Test", []), pattern, name);
};
rejectDrawing("wrong schema", (value) => (value.sourceType = "wrong"), /unsupported/);
rejectDrawing("wrong version", (value) => (value.schemaVersion = "2.0"), /unsupported/);
rejectDrawing("cross project", (value) => (value.projectReference = "Other"), /Cross-project/);
rejectDrawing("missing drawing", (value) => delete value.drawingReference, /Drawing reference/);
rejectDrawing("unregistered", (value) => (value.registrationState = "unresolved"), /confirmed/i);
rejectDrawing("coordinate system", (value) => (value.coordinateSystem = "geographic"), /metric/);
rejectDrawing("units", (value) => (value.units = "feet"), /metres/);
rejectDrawing("unreviewed", (value) => (value.sourceReviewState = "draft"), /reviewed/);
rejectDrawing(
  "open footprint",
  (value) => {
    (value.records as Record<string, unknown>[])[0].footprint = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];
  },
  /closed/,
);
for (const [name, vertices, pattern] of [
  [
    "self intersection",
    [
      { x: 0, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
      { x: 2, y: 0 },
      { x: 0, y: 0 },
    ],
    /self-intersection|area/,
  ],
  [
    "duplicate consecutive",
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: 0 },
    ],
    /duplicate consecutive/,
  ],
  [
    "too few",
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 0 },
    ],
    /three unique/,
  ],
] as const)
  rejectDrawing(
    name,
    (value) => {
      (value.records as Record<string, unknown>[])[0].footprint = structuredClone(vertices);
    },
    pattern,
  );
rejectDrawing(
  "non-finite footprint",
  (value) => {
    ((value.records as Record<string, unknown>[])[0].footprint as { x: number; y: number }[])[0].x =
      Number.NaN;
  },
  /non-finite/,
);
rejectDrawing(
  "missing base basis",
  (value) => {
    delete (value.records as Record<string, unknown>[])[0].baseElevationBasis;
  },
  /basis/,
);
rejectDrawing(
  "unsupported classification",
  (value) => {
    (value.records as Record<string, unknown>[])[0].classification = "unknown";
  },
  /classification/,
);
rejectDrawing(
  "missing provenance",
  (value) => {
    delete (value.records as Record<string, unknown>[])[0].provenance;
  },
  /provenance/,
);
rejectDrawing(
  "missing source object",
  (value) => {
    delete (value.records as Record<string, unknown>[])[0].sourceObjectReference;
  },
  /source-object/,
);
for (const [field, invalid, pattern] of [
  ["heightMeters", undefined, /height/],
  ["heightMeters", Number.NaN, /height/],
  ["heightMeters", -1, /height/],
  ["baseElevationMeters", undefined, /base elevation/],
  ["baseElevationMeters", Number.NaN, /base elevation/],
  ["uncertaintyMeters", undefined, /uncertainty/],
  ["uncertaintyMeters", -1, /uncertainty/],
] as const)
  rejectDrawing(
    `${field} ${String(invalid)}`,
    (value) => {
      (value.records as Record<string, unknown>[])[0][field] = invalid;
    },
    pattern,
  );
rejectDrawing(
  "invalid terrain reference",
  (value) => {
    const record = (value.records as Record<string, unknown>[])[0];
    record.baseElevationBasis = "verified-terrain-reference";
    record.terrainReference = "unknown";
  },
  /terrain reference/,
);
rejectDrawing(
  "duplicate ID",
  (value) => {
    const record = (value.records as Record<string, unknown>[])[0];
    value.records = [record, structuredClone(record)];
  },
  /Duplicate source/,
);
rejectDrawing(
  "excessive objects",
  (value) => {
    const record = (value.records as Record<string, unknown>[])[0];
    value.records = Array.from({ length: 501 }, (_, index) => ({
      ...structuredClone(record),
      id: `source-${index}`,
    }));
  },
  /excessive/,
);
rejectDrawing(
  "excessive footprint vertices",
  (value) => {
    const vertices = Array.from({ length: 1_000 }, (_, index) => ({
      x: Math.cos((index / 999) * Math.PI * 2),
      y: Math.sin((index / 999) * Math.PI * 2),
    }));
    vertices.push({ ...vertices[0] });
    (value.records as Record<string, unknown>[])[0].footprint = vertices;
  },
  /vertex limit/,
);
assert.throws(
  () =>
    validateTerrainMesh({
      vertices: Array.from({ length: 250_001 }, () => ({ x: 0, y: 0, z: 0 })),
      triangles: [],
    }),
  /vertex or triangle limit/,
);
assert.throws(
  () =>
    validateTerrainMesh({
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
      ],
      triangles: Array.from({ length: 500_001 }, () => [0, 1, 2]),
    }),
  /vertex or triangle limit/,
);
try {
  reviewDrawingObstructionSource({ ...drawingEnvelope, drawingReference: "" }, "Test", []);
  assert.fail("Missing drawing reference was accepted.");
} catch (error) {
  assert(error instanceof ShadingImportError);
  assert.equal(error.category, "MISSING_OR_MALFORMED_TEXT");
}
assert.equal(
  prepareShading3DSceneData(registeredLayout, mesh, [box], [row]).tables.length,
  registeredLayout.tables.length,
);
const review: ShadingReview = {
  schemaName: SHADING_SCHEMA_NAME,
  schemaVersion: SHADING_SCHEMA_VERSION,
  createdAt: reference.timestamp,
  sourceLayoutReference: "Test",
  inputs: {
    project: utc,
    layout,
    horizon,
    obstructions: [box],
    sampling: "footprint-corners-and-centre",
    samplesPerTable: 5,
  },
  findings: [row],
  reviewStatus: "calculated-review-required",
  assumptions: [],
  limitations: ["Not energy loss."],
  excludedHistory: [],
};
assert.notEqual(validateLayoutReview(layout), layout);
assert.throws(
  () => validateLayoutReview({ ...layout, tables: [source, { ...source }] }),
  /Duplicate table ID/,
);
assert.equal(validateHorizonProfile(horizon).length, horizon.length);
assert.equal(validateObstructions([box]).length, 1);
assert.throws(() => validateObstructions([box, { ...box }]), /Duplicate obstruction ID/);
assert.equal(
  validateTimeRangeResponse({
    type: "progress",
    generation: 1,
    stage: "validating-inputs",
    percent: 5,
  }).type,
  "progress",
);
assert.throws(
  () => validateTimeRangeResponse({ type: "progress", generation: 1, stage: "", percent: 101 }),
  /Malformed worker progress/,
);
assert.equal(serializeShadingReview(review), serializeShadingReview(review));
assert.match(findingsCsv(review), /geometric_fraction/);
assert.equal(row.ruleVersion, SHADING_RULE_VERSION);
assert.equal(combineDomainFindings(receiver.id, highSun, [row]).state, "shaded");
assert.equal(
  combineDomainFindings(receiver.id, highSun, [{ ...row, state: "not-evaluated" }]).state,
  "not-evaluated",
);
assert.equal(
  combineDomainFindings(receiver.id, { ...highSun, belowHorizon: true }, [row]).state,
  "below-horizon",
);
const timeSummary = summarizeTimeRange([combineDomainFindings(receiver.id, highSun, [row])], 1);
assert.equal(timeSummary.requestedTimestamps, 1);
assert.equal(timeSummary.shadedTimestamps, 1);
const companion = createShadingSceneCompanion(review, timeSummary);
assert.equal(serializeShadingSceneCompanion(companion), serializeShadingSceneCompanion(companion));
assert.throws(
  () =>
    serializeShadingSceneCompanion({
      ...companion,
      projectReference: "cross-project",
    }),
  /incompatible/,
);
const circularCompanion = structuredClone(companion) as typeof companion & { circular?: unknown };
circularCompanion.circular = circularCompanion;
assert.throws(() => serializeShadingSceneCompanion(circularCompanion), /Circular/);
assert.deepEqual(shadingReviewBlockers([row], false, false), []);
assert.match(shadingReviewBlockers([], true, true).join(" "), /stale/);
for (const [context, expected] of [
  [{ workerValidationFailed: true }, "validation failed"],
  [{ sourceUnreviewed: true }, "unreviewed"],
  [{ layoutAuthoritative: false }, "not authoritative"],
  [{ terrainVerified: false }, "not verified"],
  [{ obstructionReviewInvalid: true }, "not properly reviewed"],
  [{ invalidGeometry: true }, "invalid geometry"],
  [{ inputsChanged: true }, "inputs changed"],
  [{ exportValidationFailed: true }, "export validation failed"],
] as const)
  assert.match(shadingReviewBlockers([row], false, false, context).join(" "), new RegExp(expected));
const governanceHistory = transitionShadingReview(
  "draft",
  "calculated-review-required",
  [],
  [],
  reference.timestamp,
);
assert.equal(
  transitionShadingReview(
    "calculated-review-required",
    "reviewed",
    governanceHistory,
    [],
    reference.timestamp,
  ).length,
  2,
);
assert.throws(
  () =>
    transitionShadingReview(
      "calculated-review-required",
      "reviewed",
      governanceHistory,
      ["coverage missing"],
      reference.timestamp,
    ),
  /blocked/,
);
assert.throws(
  () => transitionShadingReview("draft", "reviewed", [], [], reference.timestamp),
  /not permitted/,
);
assert.match(timeRangeSummaryCsv(timeSummary), /geometrically_shaded/);
assert.match(
  timeRangeSummaryCsv({
    ...timeSummary,
    tables: [{ ...timeSummary.tables[0], tableId: "=1+1" }],
  }),
  /"'=1\+1"/,
);

const started = performance.now();
for (let index = 0; index < 10_000; index += 1)
  calculateSunPosition(new Date(1704067200000 + index * 60_000), utc);
console.log(
  JSON.stringify({
    status: "passed",
    reference: {
      expectedZenith: 50.11162,
      actualZenith: reference.zenithDegrees,
      expectedAzimuth: 194.34024,
      actualAzimuth: reference.azimuthDegrees,
      toleranceDegrees: 0.05,
    },
    solarPositions10000Ms: Number((performance.now() - started).toFixed(1)),
    maximumTransformRoundTripError: maximumTransformError,
  }),
);
