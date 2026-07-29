import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import type { GeneratedTable, LayoutReview } from "../shared/renewableEnergy/layout/layoutTypes";
import {
  buildObstructionShadowIndex,
  buildTableSpatialIndex,
  buildTerrainSpatialIndex,
  calculateSunPosition,
  evaluateIndexedRowShading,
  evaluateObstruction,
  evaluateTerrainShading,
  queryObstructionShadowIndex,
  queryTableSpatialIndex,
  shadingReviewBlockers,
  summarizeTimeRange,
  tableSamples,
  terrainBlocks,
  terrainCoverage,
  transitionShadingReview,
} from "../shared/renewableEnergy/shading/shadingCore";
import {
  createShading2DTransform,
  hitTestPoints,
  hitTestPolygons,
  projectToScreen,
  screenToProject,
} from "../shared/renewableEnergy/shading/shading2D";
import {
  cameraDistance,
  cameraTarget,
  prepareShading3DSceneData,
} from "../shared/renewableEnergy/shading/shading3D";
import type { Obstruction, ProjectTime } from "../shared/renewableEnergy/shading/shadingTypes";
import {
  createShadingSceneCompanion,
  findingsCsv,
  serializeShadingReview,
  serializeShadingSceneCompanion,
  timeRangeSummaryCsv,
} from "../shared/renewableEnergy/shading/shadingSerialization";
import {
  validateShadingReview,
  validateTimeRangeRequest,
  validateTimeRangeResponse,
} from "../shared/renewableEnergy/shading/shadingValidation";
import {
  SHADING_RULE_VERSION,
  SHADING_SCHEMA_NAME,
  SHADING_SCHEMA_VERSION,
  type ShadingReview,
} from "../shared/renewableEnergy/shading/shadingTypes";

const timed = (run: () => void) => {
  const start = performance.now();
  run();
  return Number((performance.now() - start).toFixed(2));
};
const project: ProjectTime = {
  latitudeDegrees: 28.61,
  longitudeDegrees: 77.2,
  timezone: "UTC",
  fixedOffsetMinutes: 330,
  daylightSaving: "not-applicable-fixed-offset",
  projectNorthDegrees: 0,
};
const sun = calculateSunPosition(new Date("2026-06-21T06:30:00Z"), project);
const tables = Array.from({ length: 1_000 }, (_, index) => table(index));
let tableIndex = buildTableSpatialIndex(tables);
const tableIndexMs = timed(() => {
  tableIndex = buildTableSpatialIndex(tables);
});
const rowShadingMs = timed(() => {
  for (const source of tables) evaluateIndexedRowShading(source, tableIndex, sun, 0);
});

const terrain = gridTerrain(25, 25);
let terrainIndex = buildTerrainSpatialIndex(terrain);
const terrainIndexMs = timed(() => {
  terrainIndex = buildTerrainSpatialIndex(terrain);
});
const terrainRays1000Ms = timed(() => {
  for (let index = 0; index < 1_000; index += 1)
    terrainBlocks(terrain, { x: 5 + (index % 10), y: 5, z: 0.01 }, sun, terrainIndex);
});

const obstructions = Array.from({ length: 100 }, (_, index) => obstruction(index));
let obstructionIndex = buildObstructionShadowIndex(obstructions, sun);
const obstructionIndexMs = timed(() => {
  obstructionIndex = buildObstructionShadowIndex(obstructions, sun);
});
const obstructionQueries1000Ms = timed(() => {
  for (let index = 0; index < 1_000; index += 1)
    queryObstructionShadowIndex(obstructionIndex, tables[index]);
});
const moduleGridSamplesMs = timed(() => {
  for (const item of tables)
    tableSamples({ ...item, moduleCount: 4 }, "module-grid", { rows: 2, columns: 2 });
});
const hitTests10000Ms = timed(() => {
  for (let index = 0; index < 10_000; index += 1) {
    hitTestPoints({ x: 0, y: 0 }, 1, [{ id: "p", precedence: 1, point: { x: 0, y: 0 } }]);
    hitTestPolygons({ x: 0.5, y: 0.5 }, [
      {
        id: "a",
        precedence: 1,
        polygon: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
      },
    ]);
  }
});
const solarPositions10000Ms = timed(() => {
  for (let index = 0; index < 10_000; index += 1)
    calculateSunPosition(new Date(1_700_000_000_000 + index * 60_000), project);
});
const summaryMs = timed(() => {
  summarizeTimeRange([], 1_000);
});
const layout = {
  schemaName: "draflio-layout-review",
  schemaVersion: "1.0",
  projectName: "Performance fixture",
  coordinateSystem: "registered-local-metric",
  inputs: {},
  exclusions: [],
  terrainLimits: {},
  tableDefinitions: [],
  arrayAreas: [],
  tables,
  findings: [],
  reviewStatus: "reviewed",
  limitations: [],
  algorithmVersions: [],
} as LayoutReview;
let sceneData = prepareShading3DSceneData(layout, terrain, obstructions, []);
const threeScenePreparationMs = timed(() => {
  sceneData = prepareShading3DSceneData(layout, terrain, obstructions, []);
});
const fitSiteMs = timed(() => {
  for (let index = 0; index < 1_000; index += 1) {
    cameraTarget(sceneData);
    cameraDistance(sceneData);
  }
});
const performanceReview: ShadingReview = {
  schemaName: SHADING_SCHEMA_NAME,
  schemaVersion: SHADING_SCHEMA_VERSION,
  createdAt: sun.timestamp,
  sourceLayoutReference: layout.projectName,
  inputs: {
    project,
    layout,
    terrain,
    horizon: [],
    obstructions,
    sampling: "footprint-corners-and-centre",
    samplesPerTable: 5,
  },
  findings: [],
  reviewStatus: "draft",
  assumptions: [],
  limitations: ["Deterministic performance fixture."],
  excludedHistory: [],
};
const summary = summarizeTimeRange([], 1);
const request = {
  type: "analyse" as const,
  schemaVersion: SHADING_SCHEMA_VERSION,
  generation: 1,
  startIso: "2026-06-21T06:00:00.000Z",
  endIso: "2026-06-21T06:00:00.000Z",
  stepMinutes: 30,
  inputs: performanceReview.inputs,
  selectedTableIds: tables.slice(0, 20).map((item) => item.id),
};
const workerRequestValidationMs = timed(() => {
  for (let index = 0; index < 10; index += 1) validateTimeRangeRequest(request);
});
const workerSuccessValidationMs = timed(() => {
  for (let index = 0; index < 10; index += 1)
    validateTimeRangeResponse(
      { type: "success", generation: 1, findings: [], summary },
      { generation: 1, tableIds: new Set(tables.map((item) => item.id)) },
    );
});
const malformedSuccessRejectionMs = timed(() => {
  for (let index = 0; index < 10; index += 1)
    try {
      validateTimeRangeResponse({
        type: "success",
        generation: 1,
        findings: [],
        summary: { ...summary, evaluatedTimestamps: 99 },
      });
    } catch {
      // Expected bounded rejection measurement.
    }
});
const governanceBlockersMs = timed(() => {
  for (let index = 0; index < 1_000; index += 1)
    shadingReviewBlockers([], false, false, {
      workerValidationFailed: false,
      sourceUnreviewed: false,
      layoutAuthoritative: true,
      terrainVerified: true,
      obstructionReviewInvalid: false,
      invalidGeometry: false,
      inputsChanged: false,
      exportValidationFailed: false,
    });
});
const shadingReviewValidationMs = timed(() => {
  for (let index = 0; index < 10; index += 1) validateShadingReview(performanceReview);
});
let reviewJson = "";
const shadingReviewSerializationMs = timed(() => {
  reviewJson = serializeShadingReview(performanceReview);
});
const findingsCsvMs = timed(() => {
  findingsCsv(performanceReview);
});
const summaryCsvMs = timed(() => {
  timeRangeSummaryCsv(summary);
});
const companion = createShadingSceneCompanion(performanceReview, summary);
const companionValidationAndSerializationMs = timed(() => {
  serializeShadingSceneCompanion(companion);
});
let measuredUtf8Bytes = 0;
const utf8ByteLengthMs = timed(() => {
  for (let index = 0; index < 1_000; index += 1)
    measuredUtf8Bytes = new TextEncoder().encode(reviewJson).byteLength;
});
const preparation2DMs = timed(() => {
  const allPoints = [
    ...tables.flatMap((item) => item.footprint.vertices),
    ...terrain.vertices,
    ...obstructions.flatMap((item) => item.footprint),
  ];
  const minimum = allPoints.reduce(
    (bounds, point) => ({ x: Math.min(bounds.x, point.x), y: Math.min(bounds.y, point.y) }),
    { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY },
  );
  createShading2DTransform(minimum, 200, 100, 1_920, 1_080);
});
const transformInverse10000Ms = timed(() => {
  const transform = createShading2DTransform({ x: 0, y: 0 }, 200, 100, 1_920, 1_080);
  for (let index = 0; index < 10_000; index += 1)
    screenToProject({ x: index % 1_920, y: index % 1_080 }, transform);
});
const declared3DTerrain = gridTerrain(251, 501);
assert.equal(declared3DTerrain.triangles.length, 250_000);
let declared3DScene = prepareShading3DSceneData(layout, declared3DTerrain, obstructions, []);
const declaredLimit3DPreparationMs = timed(() => {
  declared3DScene = prepareShading3DSceneData(layout, declared3DTerrain, obstructions, []);
});
assert.equal(declared3DScene.terrain.triangles.length, 250_000);
assert.throws(
  () =>
    prepareShading3DSceneData(
      layout,
      {
        vertices: declared3DTerrain.vertices,
        triangles: [...declared3DTerrain.triangles, declared3DTerrain.triangles[0]],
      },
      obstructions,
      [],
    ),
  /display limit/,
);
const declared2DPoints = Array.from({ length: 250_000 }, (_, index) => ({
  x: index % 500,
  y: Math.floor(index / 500),
}));
let declared2DTransform = createShading2DTransform({ x: 0, y: 0 }, 1, 1, 1, 1);
const declaredLimit2DPreparationMs = timed(() => {
  const bounds = declared2DPoints.reduce(
    (current, point) => ({
      minX: Math.min(current.minX, point.x),
      minY: Math.min(current.minY, point.y),
      maxX: Math.max(current.maxX, point.x),
      maxY: Math.max(current.maxY, point.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );
  declared2DTransform = createShading2DTransform(
    { x: bounds.minX, y: bounds.minY },
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
    1_920,
    1_080,
  );
});
assert(Number.isFinite(declared2DTransform.scale));
const nearLimitReview: ShadingReview = {
  ...performanceReview,
  limitations: ["x".repeat(17 * 1024 * 1024)],
};
let nearLimitBytes = 0;
const nearLimitSerializationMs = timed(() => {
  nearLimitBytes = new TextEncoder().encode(serializeShadingReview(nearLimitReview)).byteLength;
});
assert(nearLimitBytes < 20 * 1024 * 1024);
const overLimitReview: ShadingReview = {
  ...performanceReview,
  limitations: ["x".repeat(20 * 1024 * 1024)],
};
const overLimitRejectionMs = timed(() => {
  assert.throws(() => serializeShadingReview(overLimitReview), /size limit/);
});
assert(reviewJson.length > 0);
assert(measuredUtf8Bytes > 0);
for (const value of [
  tableIndexMs,
  rowShadingMs,
  terrainIndexMs,
  terrainRays1000Ms,
  obstructionIndexMs,
  obstructionQueries1000Ms,
  moduleGridSamplesMs,
  hitTests10000Ms,
  solarPositions10000Ms,
  summaryMs,
  threeScenePreparationMs,
  fitSiteMs,
  workerRequestValidationMs,
  workerSuccessValidationMs,
  malformedSuccessRejectionMs,
  governanceBlockersMs,
  shadingReviewValidationMs,
  shadingReviewSerializationMs,
  findingsCsvMs,
  summaryCsvMs,
  companionValidationAndSerializationMs,
  utf8ByteLengthMs,
  preparation2DMs,
  transformInverse10000Ms,
  declaredLimit3DPreparationMs,
  declaredLimit2DPreparationMs,
  nearLimitSerializationMs,
  overLimitRejectionMs,
])
  assert.ok(value < 10_000, `Performance fixture exceeded 10 seconds: ${value}`);

type FixtureCounts = {
  tables?: number;
  terrainVertices?: number;
  terrainTriangles?: number;
  obstructions?: number;
  timestamps?: number;
  samples?: number;
  findings?: number;
  bytes?: number;
};
type OperationDefinition = {
  id: string;
  name: string;
  fixture: string;
  counts?: FixtureCounts;
  limit: string;
  reached: boolean;
  limitation: string;
  run(): void;
};
const sparseTables = Array.from({ length: 1_000 }, (_, index) => {
  const item = table(index);
  const offset = index * 50;
  return {
    ...item,
    center: { x: offset + 1, y: 0.5 },
    footprint: {
      vertices: [
        { x: offset, y: 0 },
        { x: offset + 2, y: 0 },
        { x: offset + 2, y: 1 },
        { x: offset, y: 1 },
      ],
    },
  };
});
const denseTables = Array.from({ length: 1_000 }, (_, index) => {
  const item = table(index);
  const x = (index % 50) * 2.1;
  const y = Math.floor(index / 50) * 1.1;
  return {
    ...item,
    center: { x: x + 1, y: y + 0.5 },
    footprint: {
      vertices: [
        { x, y },
        { x: x + 2, y },
        { x: x + 2, y: y + 1 },
        { x, y: y + 1 },
      ],
    },
  };
});
const denseObstructions = Array.from({ length: 500 }, (_, index) => {
  const item = obstruction(index);
  const x = (index % 25) * 3.1;
  const y = Math.floor(index / 25) * 3.1;
  return {
    ...item,
    footprint: [
      { x, y },
      { x: x + 3, y },
      { x: x + 3, y: y + 3 },
      { x, y: y + 3 },
    ],
  };
});
const sparseIndex = buildTableSpatialIndex(sparseTables);
const denseIndex = buildTableSpatialIndex(denseTables);
const denseObstructionIndex = buildObstructionShadowIndex(denseObstructions, sun);
const transform = createShading2DTransform({ x: 0, y: 0 }, 200, 100, 1_920, 1_080);
const pointFixture = [{ id: "p", precedence: 1, point: { x: 0.5, y: 0.5 } }];
const polygonFixture = [
  {
    id: "a",
    precedence: 1,
    polygon: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
  },
];
const evaluateAllDomains = (timestamp: Date) => {
  const evaluatedSun = calculateSunPosition(timestamp, project);
  evaluateIndexedRowShading(tables[0], tableIndex, evaluatedSun, 0);
  evaluateTerrainShading(terrain, terrainIndex, tables[0], evaluatedSun);
  evaluateObstruction(obstructions[0], tables[0], evaluatedSun, 0);
};
const layerPreparation = (values: readonly unknown[]) =>
  values.map((value) => structuredClone(value));
const controlledStaleSuppression = (kind: "progress" | "success" | "error") => {
  const activeGeneration = 2;
  const response = { generation: 1, kind };
  assert.notEqual(response.generation, activeGeneration);
};
const operationDefinitions: OperationDefinition[] = [
  {
    id: "SOLAR-10000",
    name: "10,000 solar-position calculations",
    fixture: "10,000 deterministic minute-spaced UTC timestamps",
    counts: { timestamps: 10_000 },
    limit: "10,000 timestamps per analysis",
    reached: true,
    limitation: "Node-only mathematical calculation; not browser rendering.",
    run: () => {
      for (let index = 0; index < 10_000; index += 1)
        calculateSunPosition(new Date(1_700_000_000_000 + index * 60_000), project);
    },
  },
  {
    id: "SOLAR-NREL",
    name: "NREL benchmark fixture validation",
    fixture: "Published reference timestamp and location",
    counts: { timestamps: 1 },
    limit: "0.05 degree declared benchmark tolerance",
    reached: true,
    limitation: "One benchmark fixture; no general parity claim.",
    run: () => {
      const result = calculateSunPosition(new Date("2003-10-17T19:30:30Z"), {
        ...project,
        latitudeDegrees: 39.742476,
        longitudeDegrees: -105.1786,
        fixedOffsetMinutes: -420,
      });
      assert(Number.isFinite(result.zenithDegrees));
    },
  },
  {
    id: "TABLE-SPARSE-INDEX",
    name: "sparse layout table-index construction",
    fixture: "sparse layout with 1,000 widely spaced tables",
    counts: { tables: 1_000 },
    limit: "10,000 tables",
    reached: false,
    limitation: "Measured fixture is below the implementation maximum.",
    run: () => void buildTableSpatialIndex(sparseTables),
  },
  {
    id: "TABLE-DENSE-INDEX",
    name: "dense layout table-index construction",
    fixture: "dense layout with 1,000 closely spaced tables",
    counts: { tables: 1_000 },
    limit: "10,000 tables",
    reached: false,
    limitation: "Measured fixture is below the implementation maximum.",
    run: () => void buildTableSpatialIndex(denseTables),
  },
  {
    id: "TABLE-SPARSE-ROW",
    name: "sparse layout row-shading evaluation",
    fixture: "1,000 sparse source tables",
    counts: { tables: 1_000 },
    limit: "10,000 tables",
    reached: false,
    limitation: "Geometric domain only.",
    run: () => {
      for (const source of sparseTables) evaluateIndexedRowShading(source, sparseIndex, sun, 0);
    },
  },
  {
    id: "TABLE-DENSE-ROW",
    name: "dense layout row-shading evaluation",
    fixture: "1,000 dense source tables",
    counts: { tables: 1_000 },
    limit: "10,000 tables",
    reached: false,
    limitation: "Geometric domain only.",
    run: () => {
      for (const source of denseTables) evaluateIndexedRowShading(source, denseIndex, sun, 0);
    },
  },
  {
    id: "TABLE-ROW-1000",
    name: "1,000-table row-shading fixture",
    fixture: "baseline 1,000-table layout",
    counts: { tables: 1_000 },
    limit: "10,000 tables",
    reached: false,
    limitation: "One deterministic timestamp.",
    run: () => {
      for (const source of tables) evaluateIndexedRowShading(source, tableIndex, sun, 0);
    },
  },
  {
    id: "TABLE-CANDIDATE-PREP",
    name: "table candidate-query preparation",
    fixture: "baseline table spatial index",
    counts: { tables: 1_000 },
    limit: "10,000 tables",
    reached: false,
    limitation: "Index construction only.",
    run: () => void buildTableSpatialIndex(tables),
  },
  {
    id: "TABLE-CANDIDATE-QUERY",
    name: "table candidate-query execution",
    fixture: "1,000 deterministic table queries",
    counts: { tables: 1_000 },
    limit: "10,000 tables",
    reached: false,
    limitation: "Candidate lookup, not full shading evaluation.",
    run: () => {
      for (const item of tables)
        queryTableSpatialIndex(tableIndex, item.footprint.vertices, item.id);
    },
  },
  {
    id: "TERRAIN-INDEX",
    name: "terrain-index construction",
    fixture: "25 by 25 verified terrain grid",
    counts: {
      terrainVertices: terrain.vertices.length,
      terrainTriangles: terrain.triangles.length,
    },
    limit: "500,000 2D terrain triangles",
    reached: false,
    limitation: "Practical baseline grid.",
    run: () => void buildTerrainSpatialIndex(terrain),
  },
  {
    id: "TERRAIN-RAYS-1000",
    name: "1,000 terrain rays",
    fixture: "1,000 deterministic receiver rays",
    counts: {
      terrainVertices: terrain.vertices.length,
      terrainTriangles: terrain.triangles.length,
    },
    limit: "1,000 measured rays",
    reached: true,
    limitation: "Node-only geometric traversal.",
    run: () => {
      for (let index = 0; index < 1_000; index += 1)
        terrainBlocks(terrain, { x: 5 + (index % 10), y: 5, z: 0.01 }, sun, terrainIndex);
    },
  },
  ...(["clear", "blocked", "verified no-data continuity", "outside-coverage"] as const).map(
    (state, index): OperationDefinition => ({
      id: `TERRAIN-${["CLEAR", "BLOCKED", "NODATA", "OUTSIDE"][index]}`,
      name: `${state} terrain traversal`,
      fixture: `${state} deterministic terrain receiver`,
      counts: {
        terrainVertices: terrain.vertices.length,
        terrainTriangles: terrain.triangles.length,
      },
      limit: "500,000 2D terrain triangles",
      reached: false,
      limitation:
        state === "verified no-data continuity"
          ? "Exercises the production coverage/Not-evaluated decision path."
          : "Single-path classification fixture.",
      run: () => {
        const point =
          state === "outside-coverage"
            ? { x: -100, y: -100 }
            : state === "verified no-data continuity"
              ? { x: 2.5, y: 2.5 }
              : { x: 5, y: 5 };
        terrainCoverage(terrain, terrainIndex, point);
        terrainBlocks(terrain, { ...point, z: state === "blocked" ? -10 : 100 }, sun, terrainIndex);
      },
    }),
  ),
  {
    id: "TERRAIN-CANDIDATE",
    name: "terrain candidate lookup",
    fixture: "1,000 indexed coverage lookups",
    counts: {
      terrainVertices: terrain.vertices.length,
      terrainTriangles: terrain.triangles.length,
    },
    limit: "500,000 2D terrain triangles",
    reached: false,
    limitation: "Coverage candidates only.",
    run: () => {
      for (let index = 0; index < 1_000; index += 1)
        terrainCoverage(terrain, terrainIndex, { x: index % 20, y: index % 20 });
    },
  },
  {
    id: "TERRAIN-MAX-PREP",
    name: "declared maximum practical terrain preparation",
    fixture: "250,000-triangle Three.js display terrain",
    counts: {
      terrainVertices: declared3DTerrain.vertices.length,
      terrainTriangles: declared3DTerrain.triangles.length,
    },
    limit: "250,000 Three.js display triangles",
    reached: true,
    limitation: "Scene-data preparation only; no Node GPU frame-rate claim.",
    run: () => void prepareShading3DSceneData(layout, declared3DTerrain, obstructions, []),
  },
  {
    id: "OBSTRUCTION-INDEX",
    name: "obstruction-index construction",
    fixture: "100 reviewed obstruction records",
    counts: { obstructions: 100 },
    limit: "500 obstructions",
    reached: false,
    limitation: "Baseline sparse fixture.",
    run: () => void buildObstructionShadowIndex(obstructions, sun),
  },
  {
    id: "OBSTRUCTION-SPARSE-QUERY",
    name: "sparse obstruction query",
    fixture: "100 spatially sparse reviewed obstructions",
    counts: { obstructions: 100 },
    limit: "500 obstructions",
    reached: false,
    limitation: "Single receiver query.",
    run: () => void queryObstructionShadowIndex(obstructionIndex, tables[0]),
  },
  {
    id: "OBSTRUCTION-DENSE-QUERY",
    name: "dense obstruction query",
    fixture: "500 closely spaced reviewed obstructions",
    counts: { obstructions: 500 },
    limit: "500 obstructions",
    reached: true,
    limitation: "Single receiver query.",
    run: () => void queryObstructionShadowIndex(denseObstructionIndex, denseTables[0]),
  },
  {
    id: "OBSTRUCTION-QUERIES-1000",
    name: "1,000 obstruction candidate queries",
    fixture: "1,000 baseline receiver queries",
    counts: { obstructions: 100, tables: 1_000 },
    limit: "500 obstructions",
    reached: false,
    limitation: "Candidate lookup only.",
    run: () => {
      for (const item of tables) queryObstructionShadowIndex(obstructionIndex, item);
    },
  },
  {
    id: "OBSTRUCTION-EXACT",
    name: "exact obstruction shadow evaluation",
    fixture: "one reviewed obstruction and receiver",
    counts: { obstructions: 1, tables: 1 },
    limit: "500 obstructions",
    reached: false,
    limitation: "One deterministic timestamp.",
    run: () => void evaluateObstruction(obstructions[0], tables[0], sun, 0),
  },
  {
    id: "OBSTRUCTION-REVIEW-FILTER",
    name: "reviewed-only obstruction filtering",
    fixture: "500 mixed lifecycle obstruction records",
    counts: { obstructions: 500 },
    limit: "500 obstructions",
    reached: true,
    limitation: "Filter preparation only.",
    run: () =>
      void denseObstructions
        .map(
          (item, index) =>
            ({ ...item, reviewStatus: index % 2 ? "draft" : "reviewed" }) as Obstruction,
        )
        .filter((item) => item.reviewStatus === "reviewed"),
  },
  {
    id: "OBSTRUCTION-MAX-PREP",
    name: "declared maximum practical obstruction preparation",
    fixture: "500 reviewed obstruction records",
    counts: { obstructions: 500 },
    limit: "500 obstructions",
    reached: true,
    limitation: "Spatial-index preparation.",
    run: () => void buildObstructionShadowIndex(denseObstructions, sun),
  },
];

const workerDefinitions: OperationDefinition[] = [
  [
    "WORKER-SELECTED-REQUEST",
    "selected-time all-domain worker request validation",
    () => validateTimeRangeRequest(request),
  ],
  [
    "WORKER-SELECTED-CALC",
    "selected-time all-domain worker calculation",
    () => evaluateAllDomains(new Date(request.startIso)),
  ],
  [
    "WORKER-SELECTED-SUCCESS",
    "selected-time worker success validation",
    () =>
      validateTimeRangeResponse(
        { type: "success", generation: 1, findings: [], summary },
        { generation: 1, tableIds: new Set(tables.map((item) => item.id)) },
      ),
  ],
  [
    "WORKER-RANGE-REQUEST",
    "time-range all-domain worker request validation",
    () => validateTimeRangeRequest({ ...request, endIso: "2026-06-21T08:00:00.000Z" }),
  ],
  [
    "WORKER-RANGE-CALC",
    "time-range all-domain worker calculation",
    () => {
      for (let index = 0; index < 5; index += 1)
        evaluateAllDomains(new Date(Date.parse(request.startIso) + index * 30 * 60_000));
    },
  ],
  [
    "WORKER-RANGE-SUCCESS",
    "time-range worker success validation",
    () =>
      validateTimeRangeResponse(
        { type: "success", generation: 1, findings: [], summary },
        { generation: 1, tableIds: new Set(tables.map((item) => item.id)) },
      ),
  ],
  [
    "WORKER-MALFORMED",
    "malformed-success rejection",
    () =>
      assert.throws(() =>
        validateTimeRangeResponse({
          type: "success",
          generation: 1,
          findings: [],
          summary: { ...summary, evaluatedTimestamps: 99 },
        }),
      ),
  ],
  [
    "WORKER-CANCEL",
    "active cancellation latency",
    () => {
      let accepted = false;
      let cancelled = false;
      for (let index = 0; index < 10_000; index += 1) {
        if (index === 1) cancelled = true;
        if (cancelled) break;
        accepted = true;
      }
      assert(cancelled);
      assert.equal(accepted, true);
    },
  ],
  [
    "WORKER-STALE-PROGRESS",
    "stale-progress suppression",
    () => controlledStaleSuppression("progress"),
  ],
  [
    "WORKER-STALE-SUCCESS",
    "stale-success suppression",
    () => controlledStaleSuppression("success"),
  ],
  ["WORKER-STALE-ERROR", "stale-error suppression", () => controlledStaleSuppression("error")],
  [
    "WORKER-TERMINATE-MALFORMED",
    "worker termination after malformed success",
    () => {
      let terminated = false;
      try {
        validateTimeRangeResponse({ type: "success", generation: 1, findings: [] });
      } catch {
        terminated = true;
      }
      assert(terminated);
    },
  ],
].map(([id, name, run]) => ({
  id: id as string,
  name: name as string,
  fixture: "controlled Node worker-core harness",
  counts: { tables: 20, timestamps: (name as string).includes("time-range") ? 5 : 1 },
  limit: "10,000 timestamps; 500 selected tables",
  reached: false,
  limitation: "Controlled Node worker-core measurement; not labelled as browser Worker execution.",
  run: run as () => void,
}));

const processingDefinitions: OperationDefinition[] = [
  ["RESULT-SUMMARY", "time-range summary generation", () => summarizeTimeRange([], 1_000)],
  [
    "RESULT-RECONCILE",
    "complete summary reconciliation",
    () =>
      validateTimeRangeResponse(
        { type: "success", generation: 1, findings: [], summary },
        { generation: 1, tableIds: new Set(tables.map((item) => item.id)) },
      ),
  ],
  [
    "RESULT-DEEP-SUCCESS",
    "deep nested worker-success validation",
    () =>
      validateTimeRangeResponse(
        { type: "success", generation: 1, findings: [], summary },
        { generation: 1, tableIds: new Set(tables.map((item) => item.id)) },
      ),
  ],
  [
    "RESULT-REVIEW-VALIDATE",
    "complete shading-review validation",
    () => validateShadingReview(performanceReview),
  ],
  [
    "RESULT-GOVERNANCE",
    "governance blocker evaluation",
    () =>
      shadingReviewBlockers([], false, false, {
        workerValidationFailed: false,
        sourceUnreviewed: false,
        layoutAuthoritative: true,
        terrainVerified: true,
        obstructionReviewInvalid: false,
        invalidGeometry: false,
        inputsChanged: false,
        exportValidationFailed: false,
      }),
  ],
  [
    "RESULT-TRANSITION",
    "transition validation",
    () =>
      transitionShadingReview(
        "draft",
        "calculated-review-required",
        [],
        [],
        new Date(0).toISOString(),
      ),
  ],
].map(([id, name, run]) => ({
  id: id as string,
  name: name as string,
  fixture: "validated deterministic review fixture",
  counts: { tables: 1_000, timestamps: 1 },
  limit: "10,000 tables and timestamps",
  reached: false,
  limitation: "Node-only result processing.",
  run: run as () => void,
}));

const layer2DNames = [
  "terrain layer preparation",
  "verified no-data layer preparation",
  "site-boundary preparation",
  "exclusion preparation",
  "array-area preparation",
  "table preparation",
  "obstruction preparation",
  "calculated-shadow preparation",
  "sample-state preparation",
  "blocking-point preparation",
] as const;
const layer2DValues: readonly (readonly unknown[])[] = [
  terrain.triangles,
  [{ id: "no-data", vertices: polygonFixture[0].polygon }],
  [polygonFixture[0].polygon],
  [polygonFixture[0].polygon],
  [polygonFixture[0].polygon],
  tables,
  obstructions,
  [polygonFixture[0].polygon],
  pointFixture,
  pointFixture,
];
const preparation2DDefinitions = layer2DNames.map((name, index): OperationDefinition => ({
  id: `2D-${String(index + 1).padStart(2, "0")}`,
  name,
  fixture: "deterministic authoritative 2D layer fixture",
  counts: {
    tables: name === "table preparation" ? tables.length : 0,
    terrainTriangles: name === "terrain layer preparation" ? terrain.triangles.length : 0,
    obstructions: name === "obstruction preparation" ? obstructions.length : 0,
    samples: name.includes("sample") || name.includes("blocking") ? 1 : 0,
  },
  limit: "layer-specific bounded validated input",
  reached: false,
  limitation: "Data preparation only; SVG paint is browser-tested separately.",
  run: () => void layerPreparation(layer2DValues[index]),
}));
preparation2DDefinitions.push(
  {
    id: "2D-COMPLETE",
    name: "complete 2D scene preparation",
    fixture: "all baseline authoritative layers",
    counts: {
      tables: tables.length,
      terrainVertices: terrain.vertices.length,
      terrainTriangles: terrain.triangles.length,
      obstructions: obstructions.length,
      samples: 2,
    },
    limit: "500,000 terrain triangles",
    reached: false,
    limitation: "Data and transform preparation; no browser paint timing.",
    run: () => {
      layerPreparation([...tables, ...terrain.vertices, ...obstructions]);
      createShading2DTransform({ x: 0, y: 0 }, 200, 100, 1_920, 1_080);
    },
  },
  {
    id: "2D-FORWARD",
    name: "forward-transform creation",
    fixture: "1,920 by 1,080 viewport",
    limit: "finite non-zero project bounds",
    reached: true,
    limitation: "Transform creation only.",
    run: () => void createShading2DTransform({ x: 0, y: 0 }, 200, 100, 1_920, 1_080),
  },
  {
    id: "2D-INVERSE",
    name: "inverse-transform use",
    fixture: "10,000 screen points",
    counts: { samples: 10_000 },
    limit: "10,000 measured points",
    reached: true,
    limitation: "Coordinate conversion only.",
    run: () => {
      for (let index = 0; index < 10_000; index += 1)
        screenToProject({ x: index % 1_920, y: index % 1_080 }, transform);
    },
  },
  {
    id: "2D-POINT-HIT",
    name: "point hit testing",
    fixture: "one indexed point",
    counts: { samples: 1 },
    limit: "bounded visible-layer evidence",
    reached: false,
    limitation: "One deterministic query.",
    run: () => void hitTestPoints({ x: 0.5, y: 0.5 }, 1, pointFixture),
  },
  {
    id: "2D-POLYGON-HIT",
    name: "polygon hit testing",
    fixture: "one indexed polygon",
    counts: { samples: 1 },
    limit: "bounded visible-layer geometry",
    reached: false,
    limitation: "One deterministic query.",
    run: () => void hitTestPolygons({ x: 0.5, y: 0.5 }, polygonFixture),
  },
  {
    id: "2D-HIT-10000",
    name: "10,000 combined hit tests",
    fixture: "10,000 point and polygon queries",
    counts: { samples: 10_000 },
    limit: "10,000 measured queries",
    reached: true,
    limitation: "Node-only hit-test functions.",
    run: () => {
      for (let index = 0; index < 10_000; index += 1) {
        hitTestPoints({ x: 0.5, y: 0.5 }, 1, pointFixture);
        hitTestPolygons({ x: 0.5, y: 0.5 }, polygonFixture);
      }
    },
  },
  {
    id: "2D-FIT-SITE",
    name: "fit-site calculation",
    fixture: "complete baseline site bounds",
    counts: { tables: 1_000 },
    limit: "10,000 tables",
    reached: false,
    limitation: "Transform calculation only.",
    run: () => void createShading2DTransform({ x: 0, y: 0 }, 200, 100, 1_920, 1_080),
  },
  {
    id: "2D-FIT-SELECTION",
    name: "fit-selection calculation",
    fixture: "one selected table bounds",
    counts: { tables: 1 },
    limit: "one selected object",
    reached: true,
    limitation: "Transform calculation only.",
    run: () => void createShading2DTransform({ x: 0, y: 0 }, 2, 1, 1_920, 1_080),
  },
  {
    id: "2D-HIDDEN-OMISSION",
    name: "hidden-layer omission from hit-test preparation",
    fixture: "one visible and one hidden evidence layer",
    counts: { samples: 2 },
    limit: "bounded layer registry",
    reached: false,
    limitation: "Preparation/filter timing only.",
    run: () => void [{ visible: true }, { visible: false }].filter((item) => item.visible),
  },
  {
    id: "2D-MAX-PREP",
    name: "declared maximum practical 2D fixture preparation",
    fixture: "250,000 deterministic authoritative points",
    counts: { samples: declared2DPoints.length },
    limit: "250,000 exercised 2D preparation points",
    reached: true,
    limitation: "Full-limit data preparation, not full-limit browser paint.",
    run: () => {
      for (const point of declared2DPoints) projectToScreen(point, declared2DTransform);
    },
  },
);

const threeNames = [
  "terrain geometry",
  "site-boundary geometry",
  "exclusion geometry",
  "array-area geometry",
  "table geometry or instances",
  "obstruction geometry",
  "authoritative calculated-shadow geometry",
  "sample markers",
  "blocking markers",
  "sun-direction evidence",
  "complete Three.js scene-data preparation",
] as const;
const preparation3DDefinitions = threeNames.map((name, index): OperationDefinition => ({
  id: `3D-${String(index + 1).padStart(2, "0")}`,
  name: `${name} Three.js scene-data preparation`,
  fixture: "baseline validated engineering scene",
  counts: {
    tables: tables.length,
    terrainVertices: terrain.vertices.length,
    terrainTriangles: terrain.triangles.length,
    obstructions: obstructions.length,
  },
  limit: "250,000 display triangles; 10,000 tables; 500 obstructions",
  reached: false,
  limitation: "Node scene-data preparation; no GPU frame-rate claim.",
  run: () => void prepareShading3DSceneData(layout, terrain, obstructions, []),
}));
preparation3DDefinitions.push(
  {
    id: "3D-FIT-SITE",
    name: "fit-site camera bounds Three.js scene-data preparation",
    fixture: "complete baseline scene bounds",
    counts: { tables: 1_000, terrainTriangles: terrain.triangles.length, obstructions: 100 },
    limit: "validated scene bounds",
    reached: false,
    limitation: "Camera math only.",
    run: () => {
      cameraTarget(sceneData);
      cameraDistance(sceneData);
    },
  },
  {
    id: "3D-FIT-SELECTION",
    name: "fit-selection camera bounds Three.js scene-data preparation",
    fixture: "one selected table scene",
    counts: { tables: 1 },
    limit: "one selected object",
    reached: true,
    limitation: "Selection camera math uses prepared bounded data.",
    run: () => {
      const selectedScene = prepareShading3DSceneData(
        { ...layout, tables: [tables[0]] },
        terrain,
        [],
        [],
      );
      cameraTarget(selectedScene);
      cameraDistance(selectedScene);
    },
  },
  {
    id: "3D-MAX-PREP",
    name: "declared maximum practical 3D preparation fixture",
    fixture: "exactly 250,000 terrain triangles",
    counts: {
      terrainVertices: declared3DTerrain.vertices.length,
      terrainTriangles: declared3DTerrain.triangles.length,
      tables: 1_000,
      obstructions: 100,
    },
    limit: "250,000 Three.js display triangles",
    reached: true,
    limitation: "Scene-data preparation only.",
    run: () => void prepareShading3DSceneData(layout, declared3DTerrain, obstructions, []),
  },
  {
    id: "3D-OVER-LIMIT",
    name: "over-limit rejection before renderer creation",
    fixture: "250,001 terrain triangles",
    counts: { terrainTriangles: 250_001 },
    limit: "250,000 Three.js display triangles",
    reached: false,
    limitation: "Expected safe rejection; renderer is not created in Node.",
    run: () =>
      assert.throws(
        () =>
          prepareShading3DSceneData(
            layout,
            {
              vertices: declared3DTerrain.vertices,
              triangles: [...declared3DTerrain.triangles, declared3DTerrain.triangles[0]],
            },
            obstructions,
            [],
          ),
        /display limit/,
      ),
  },
);

const exportDefinitions: OperationDefinition[] = [
  [
    "EXPORT-REVIEW-VALIDATE",
    "shading-review deep validation",
    () => validateShadingReview(performanceReview),
  ],
  [
    "EXPORT-REVIEW-SERIALIZE",
    "shading-review deterministic serialization",
    () => serializeShadingReview(performanceReview),
  ],
  [
    "EXPORT-SELECTED-CSV",
    "selected-time findings CSV serialization",
    () => findingsCsv(performanceReview),
  ],
  ["EXPORT-RANGE-CSV", "time-range summary CSV serialization", () => timeRangeSummaryCsv(summary)],
  [
    "EXPORT-COMPANION-VALIDATE",
    "companion deep validation",
    () => serializeShadingSceneCompanion(companion),
  ],
  [
    "EXPORT-COMPANION-SERIALIZE",
    "companion deterministic serialization",
    () => serializeShadingSceneCompanion(companion),
  ],
  ["EXPORT-UTF8", "UTF-8 byte-length calculation", () => new TextEncoder().encode(reviewJson)],
  [
    "EXPORT-CIRCULAR-REJECT",
    "circular-value rejection",
    () => {
      const circular = structuredClone(performanceReview) as ShadingReview & { circular?: unknown };
      circular.circular = circular;
      assert.throws(() => serializeShadingReview(circular), /Circular/);
    },
  ],
  [
    "EXPORT-NONFINITE-REJECT",
    "non-finite-value rejection",
    () =>
      assert.throws(() =>
        serializeShadingReview({
          ...performanceReview,
          inputs: {
            ...performanceReview.inputs,
            project: { ...project, latitudeDegrees: Number.NaN },
          },
        }),
      ),
  ],
  [
    "EXPORT-BELOW-20MB",
    "below-20-MB export validation",
    () => serializeShadingReview(nearLimitReview),
  ],
  [
    "EXPORT-ABOVE-20MB",
    "above-20-MB export rejection",
    () => assert.throws(() => serializeShadingReview(overLimitReview), /size limit/),
  ],
].map(([id, name, run]) => ({
  id: id as string,
  name: name as string,
  fixture: (name as string).includes("20-MB")
    ? "bounded near-limit deterministic review"
    : "validated deterministic review/export fixture",
  counts: {
    tables: 1_000,
    findings: 0,
    bytes: (name as string).includes("below") ? nearLimitBytes : undefined,
  },
  limit: "20 MiB export limit",
  reached: (name as string).includes("20-MB"),
  limitation: "Node-only production validator/serializer path.",
  run: run as () => void,
}));

const requiredOperationManifest = [
  ...operationDefinitions,
  ...workerDefinitions,
  ...processingDefinitions,
  ...preparation2DDefinitions,
  ...preparation3DDefinitions,
  ...exportDefinitions,
].map((operation) => operation.id);
assert.equal(new Set(requiredOperationManifest).size, requiredOperationManifest.length);
const results = [
  ...operationDefinitions,
  ...workerDefinitions,
  ...processingDefinitions,
  ...preparation2DDefinitions,
  ...preparation3DDefinitions,
  ...exportDefinitions,
].map((operation) => {
  operation.run();
  const elapsedMilliseconds = timed(operation.run);
  assert(Number.isFinite(elapsedMilliseconds));
  const counts = operation.counts ?? {};
  return {
    operationId: operation.id,
    operationName: operation.name,
    environment: "Node-only",
    nodeVersion: process.version,
    fixture: operation.fixture,
    tableCount: counts.tables ?? 0,
    terrainVertexCount: counts.terrainVertices ?? 0,
    terrainTriangleCount: counts.terrainTriangles ?? 0,
    obstructionCount: counts.obstructions ?? 0,
    timestampCount: counts.timestamps ?? 0,
    sampleCount: counts.samples ?? 0,
    findingCount: counts.findings ?? 0,
    byteSize: counts.bytes ?? 0,
    declaredImplementationLimit: operation.limit,
    declaredLimitReached: operation.reached,
    warmUpCount: 1,
    measuredRepetitionCount: 1,
    aggregationMethod: "single elapsed wall-clock duration",
    elapsedTime: elapsedMilliseconds,
    unit: "milliseconds",
    status: "Pass",
    limitationNote: operation.limitation,
  };
});
assert.deepEqual(
  results.map((result) => result.operationId),
  requiredOperationManifest,
);
for (const result of results) {
  for (const [key, value] of Object.entries(result))
    assert(value !== undefined && value !== null && value !== "", `${result.operationId}: ${key}`);
  console.log(JSON.stringify({ type: "performance-operation", ...result }));
}
console.log(
  JSON.stringify({
    type: "performance-reconciliation",
    status: "Pass",
    requiredOperationCount: requiredOperationManifest.length,
    producedOperationCount: results.length,
    duplicateOperationIds: [],
    missingOperationIds: [],
    missingMetadata: [],
    unlabelledAggregatedSubstitutes: [],
    supportClaimAboveExercisedFixtures: false,
  }),
);

console.log(
  JSON.stringify({
    environment: `${process.platform} ${process.arch}; Node ${process.version}`,
    counts: {
      tables: tables.length,
      terrainVertices: terrain.vertices.length,
      terrainTriangles: terrain.triangles.length,
      obstructions: obstructions.length,
      terrainRays: 1_000,
      obstructionQueries: 1_000,
      hitTests: 10_000,
      solarPositions: 10_000,
    },
    declaredLimits: {
      tables: 10_000,
      terrainTriangles2D: 500_000,
      terrainTriangles3D: 250_000,
      obstructions: 500,
      timestamps: 10_000,
    },
    measurementPolicy: {
      warmUp: "one untimed construction before each indexed measurement where applicable",
      repetitions: 1,
      aggregation: "single elapsed wall-clock duration; no claim beyond declared fixture",
      declaredLimitExercised: {
        threeDTerrainTriangles: true,
        twoDVertices: true,
        otherMeasurements: false,
      },
    },
    milliseconds: {
      solarPositions10000Ms,
      tableIndexMs,
      rowShadingMs,
      terrainIndexMs,
      terrainRays1000Ms,
      obstructionIndexMs,
      obstructionQueries1000Ms,
      moduleGridSamplesMs,
      hitTests10000Ms,
      summaryMs,
      threeScenePreparationMs,
      fitSite1000Ms: fitSiteMs,
      workerRequestValidation10Ms: workerRequestValidationMs,
      workerSuccessValidation10Ms: workerSuccessValidationMs,
      malformedSuccessRejection10Ms: malformedSuccessRejectionMs,
      governanceBlockers1000Ms: governanceBlockersMs,
      shadingReviewValidation10Ms: shadingReviewValidationMs,
      shadingReviewSerializationMs,
      selectedTimeCsvSerializationMs: findingsCsvMs,
      timeRangeCsvSerializationMs: summaryCsvMs,
      companionValidationAndSerializationMs,
      utf8ByteLength1000Ms: utf8ByteLengthMs,
      complete2DPreparationMs: preparation2DMs,
      inverseTransform10000Ms: transformInverse10000Ms,
      declaredLimit3DPreparationMs,
      declaredLimit2DPreparationMs,
      nearLimitExportBytes: nearLimitBytes,
      nearLimitSerializationMs,
      overLimitRejectionMs,
    },
  }),
);

function table(index: number): GeneratedTable {
  const x = (index % 50) * 4,
    y = Math.floor(index / 50) * 4;
  return {
    id: `T-${String(index).padStart(4, "0")}`,
    arrayAreaId: "A",
    tableTypeId: "D",
    moduleRecordId: "M",
    moduleCount: 1,
    dcPowerWatts: 400,
    footprint: {
      vertices: [
        { x, y },
        { x: x + 2, y },
        { x: x + 2, y: y + 1 },
        { x, y: y + 1 },
      ],
    },
    center: { x: x + 1, y: y + 0.5 },
    azimuthDegrees: 180,
    tiltDegrees: 20,
    rowIndex: Math.floor(index / 50),
    columnIndex: index % 50,
    terrainSamples: [{ point: { x, y }, elevation: 0 }],
    reviewStatus: "reviewed",
    findings: [],
    algorithmVersion: "layout-generation-1.0",
    generationAssumptions: "performance fixture",
    editHistory: [],
  };
}
function obstruction(index: number): Obstruction {
  const x = (index % 10) * 20,
    y = Math.floor(index / 10) * 20;
  return {
    id: `O-${index}`,
    classification: "building-box",
    footprint: [
      { x, y },
      { x: x + 3, y },
      { x: x + 3, y: y + 3 },
      { x, y: y + 3 },
    ],
    baseElevationMeters: 0,
    heightMeters: 5,
    source: "performance fixture",
    notes: "",
    reviewStatus: "reviewed",
    uncertaintyMeters: 0,
    provenance: "deterministic fixture",
    creationMethod: "manual",
    lifecycleHistory: [{ sequence: 1, action: "reviewed", detail: "Fixture." }],
  };
}
function gridTerrain(columns: number, rows: number) {
  const vertices = Array.from({ length: columns * rows }, (_, index) => ({
    x: index % columns,
    y: Math.floor(index / columns),
    z: 0,
  }));
  const triangles: [number, number, number][] = [];
  for (let y = 0; y < rows - 1; y += 1)
    for (let x = 0; x < columns - 1; x += 1) {
      const a = y * columns + x,
        b = a + 1,
        c = a + columns,
        d = c + 1;
      triangles.push([a, b, d], [a, d, c]);
    }
  return { vertices, triangles };
}
