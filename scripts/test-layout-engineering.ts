import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createManualComponent } from "../shared/renewableEnergy/components/componentManual";
import type { PvModuleRecord } from "../shared/renewableEnergy/components/componentTypes";
import {
  alreadyAlignedRegistration,
  applyRegistration,
  applyRegistrationToPolygon,
  createTerrainSampler,
  createExclusion,
  createReviewedPolygon,
  createTableDefinition,
  editTable,
  generateTables,
  layoutStatistics,
  pointInPolygon,
  polygonsIntersect,
  revalidateLayoutTables,
  solveSimilarityRegistration,
  validatePolygon,
} from "../shared/renewableEnergy/layout/layoutCore";
import {
  createInwardSetback,
  INTEGER_COORDINATE_SCALE,
  MAXIMUM_SCALING_ERROR_METERS,
  polygonMinimumDistance,
  scaleMetricCoordinate,
} from "../shared/renewableEnergy/layout/layoutGeometry";
import {
  findingsCsv,
  layoutToDraflioScene,
  parseLayoutReview,
  serializeLayoutReview,
  tableScheduleCsv,
} from "../shared/renewableEnergy/layout/layoutSerialization";
import {
  LAYOUT_SCHEMA_NAME,
  LAYOUT_SCHEMA_VERSION,
  type ArrayArea,
  type LayoutReview,
} from "../shared/renewableEnergy/layout/layoutTypes";
import { createDefaultTransform } from "../shared/renewableEnergy/draflioSceneGeometry";
import { createEmptyDraflioScene } from "../shared/renewableEnergy/draflioSceneSerialization";
import type { DraflioScene, TerrainSurface } from "../shared/renewableEnergy/draflioSceneTypes";

const registration = solveSimilarityRegistration(
  [
    { id: "a", drawing: { x: 0, y: 0 }, terrain: { x: 10, y: 20 } },
    { id: "b", drawing: { x: 10, y: 0 }, terrain: { x: 10, y: 40 } },
  ],
  0.01,
);
assert.equal(registration.scale, 2);
assert.equal(registration.rotationDegrees, 90);
assert.deepEqual(applyRegistration({ x: 5, y: 0 }, registration), { x: 10, y: 30 });
const originalSquare = {
  vertices: [
    { x: -10, y: -10 },
    { x: 10, y: -10 },
    { x: 10, y: 10 },
    { x: -10, y: 10 },
    { x: -10, y: -10 },
  ],
};
const originalSquareSnapshot = structuredClone(originalSquare);
const inset = createInwardSetback(originalSquare, 2);
assert.deepEqual(originalSquare, originalSquareSnapshot);
assert.equal(inset.scale, INTEGER_COORDINATE_SCALE);
assert.equal(inset.effectiveRegions.length, 1);
assert.deepEqual(
  new Set(inset.effectiveRegions[0].vertices.slice(0, -1).map((point) => `${point.x},${point.y}`)),
  new Set(["-8,-8", "8,-8", "8,8", "-8,8"]),
);
assert(MAXIMUM_SCALING_ERROR_METERS <= 0.0005);
assert.throws(() => scaleMetricCoordinate(100_000_001), /outside/);
assert.equal(createInwardSetback(originalSquare, 20).collapsed, true);
const concave = {
  vertices: [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
    { x: 12, y: 20 },
    { x: 12, y: 8 },
    { x: 8, y: 8 },
    { x: 8, y: 20 },
    { x: 0, y: 20 },
    { x: 0, y: 0 },
  ],
};
assert.deepEqual(createInwardSetback(concave, 1), createInwardSetback(concave, 1));
assert(createInwardSetback(concave, 3).effectiveRegions.length >= 1);
assert.deepEqual(
  createInwardSetback({ vertices: [...originalSquare.vertices].reverse() }, 2).effectiveRegions,
  inset.effectiveRegions,
);
const transformedSquare = applyRegistrationToPolygon(originalSquare, {
  ...registration,
  active: true,
  confirmed: true,
});
assert.deepEqual(transformedSquare.vertices[0], { x: 30, y: 0 });
assert.deepEqual(originalSquare, originalSquareSnapshot);
assert.equal(
  polygonMinimumDistance(
    {
      vertices: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
        { x: 0, y: 0 },
      ],
    },
    {
      vertices: [
        { x: 2, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 1 },
        { x: 2, y: 1 },
        { x: 2, y: 0 },
      ],
    },
  ),
  1,
);
const sloped = scene("terrain");
const surface = sloped.objects[0];
if (surface?.kind !== "terrain-surface") throw new Error("Terrain fixture missing.");
surface.geometry.vertices[1].z = 10;
const sampler = createTerrainSampler(sloped);
assert.equal(sampler({ x: 50, y: 25 }).elevation, 5);
assert(
  Math.abs((sampler({ x: 50, y: 25 }).distanceToNoDataMeters ?? 0) - 25 / Math.sqrt(2)) < 1e-9,
);
assert.equal(sampler({ x: -1, y: -1 }).elevation, undefined);
assert.equal(sampler({ x: 0, y: 0 }).elevation, 0);
assert.deepEqual(
  registration,
  solveSimilarityRegistration(
    [
      { id: "a", drawing: { x: 0, y: 0 }, terrain: { x: 10, y: 20 } },
      { id: "b", drawing: { x: 10, y: 0 }, terrain: { x: 10, y: 40 } },
    ],
    0.01,
  ),
);
const leastSquares = solveSimilarityRegistration(
  [
    { id: "a", drawing: { x: 0, y: 0 }, terrain: { x: 5, y: 7 } },
    { id: "b", drawing: { x: 10, y: 0 }, terrain: { x: 15, y: 7 } },
    { id: "c", drawing: { x: 0, y: 10 }, terrain: { x: 5, y: 17 } },
  ],
  0.01,
);
assert.equal(leastSquares.method, "least-squares");
assert.equal(leastSquares.rmsResidual, 0);
assert.throws(() => solveSimilarityRegistration([], 1));
assert.throws(() =>
  solveSimilarityRegistration(
    [
      { id: "a", drawing: { x: 0, y: 0 }, terrain: { x: 0, y: 0 } },
      { id: "b", drawing: { x: 0, y: 0 }, terrain: { x: 1, y: 1 } },
    ],
    1,
  ),
);
assert.throws(() =>
  solveSimilarityRegistration(
    [
      { id: "a", drawing: { x: Number.NaN, y: 0 }, terrain: { x: 0, y: 0 } },
      { id: "b", drawing: { x: 1, y: 0 }, terrain: { x: 1, y: 0 } },
    ],
    1,
  ),
);

const square = {
  vertices: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
    { x: 0, y: 0 },
  ],
};
assert.deepEqual(validatePolygon(square), []);
assert(validatePolygon({ vertices: square.vertices.slice(0, -1) }).length);
assert(
  validatePolygon({
    vertices: [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 0 },
    ],
  }).some((message) => message.includes("self-intersection")),
);
const boundary = {
  ...createReviewedPolygon({
    id: "boundary",
    name: "Boundary",
    geometry: square,
    source: "manual",
    sourceReference: "test",
  }),
  reviewStatus: "reviewed" as const,
};
assert.equal(boundary.areaSquareMeters, 10_000);
assert(pointInPolygon({ x: 50, y: 50 }, boundary.geometry));
const exclusionPolygon = createReviewedPolygon({
  id: "exclusion-001",
  name: "Building",
  geometry: {
    vertices: [
      { x: 45, y: 45 },
      { x: 55, y: 45 },
      { x: 55, y: 55 },
      { x: 45, y: 55 },
      { x: 45, y: 45 },
    ],
  },
  source: "manual",
  sourceReference: "test",
});
const exclusion = createExclusion(exclusionPolygon, "building", "Reviewed existing building", 2);
assert(
  exclusion.effectiveGeometry.vertices.some(
    (point) => Math.abs(point.x - 43) < 1e-9 || Math.abs(point.y - 43) < 1e-9,
  ),
);
assert(polygonsIntersect(boundary.geometry, exclusion.geometry));

const module = createManualComponent(
  {
    componentType: "pv-module",
    manufacturer: "Test",
    model: "Approved",
    ratedPower: "500",
    ratedPowerUnit: "W",
    vmp: "40",
    imp: "12.5",
    voc: "48",
    isc: "13",
    pmaxTemperatureCoefficient: "-0.3",
    vocTemperatureCoefficient: "-0.28",
    coefficientUnit: "percent/C",
    length: "2",
    width: "1",
    dimensionUnit: "m",
  },
  1,
) as PvModuleRecord;
module.reviewStatus = "approved-for-current-project";
const tableDefinition = createTableDefinition({
  id: "type-1",
  name: "2x2 portrait",
  module,
  orientation: "portrait",
  modulesAcross: 2,
  modulesHigh: 2,
  horizontalGapMeters: 0.02,
  verticalGapMeters: 0.02,
  edgeAllowanceMeters: 0.1,
  tiltDegrees: 20,
  azimuthDegrees: 180,
  minimumGroundClearanceMeters: 0.5,
});
assert.equal(tableDefinition.widthMeters, 2.22);
assert.equal(tableDefinition.moduleCount, 4);
assert.equal(tableDefinition.dcPowerWatts, 2_000);
assert.throws(() => createTableDefinition({ ...tableDefinitionInput(module), tiltDegrees: 91 }));
const landscape = createTableDefinition({
  ...tableDefinitionInput(module),
  orientation: "landscape",
});
assert(landscape.widthMeters > tableDefinition.widthMeters);

const area: ArrayArea = {
  ...createReviewedPolygon({
    id: "area-001",
    name: "Area",
    geometry: {
      vertices: [
        { x: 5, y: 5 },
        { x: 95, y: 5 },
        { x: 95, y: 95 },
        { x: 5, y: 95 },
        { x: 5, y: 5 },
      ],
    },
    source: "manual",
    sourceReference: "test",
  }),
  reviewStatus: "reviewed",
  priority: 1,
  tableTypeId: tableDefinition.id,
  azimuthDegrees: 0,
  rowPitchMeters: 6,
  columnSpacingMeters: 0.5,
  boundarySetbackMeters: 0,
  effectivePlacementRegions: [
    {
      vertices: [
        { x: 5, y: 5 },
        { x: 95, y: 5 },
        { x: 95, y: 95 },
        { x: 5, y: 95 },
        { x: 5, y: 5 },
      ],
    },
  ],
  setbackAlgorithmVersion: "clipper2-inset-1.0",
  minimumTableSpacingMeters: 0.5,
  origin: { x: 0, y: 0 },
  generationDirection: "positive-x",
  maximumTableCount: 500,
};
const tables = generateTables({
  area,
  table: tableDefinition,
  boundary,
  exclusions: [exclusion],
  terrainLimits: { maximumSlopeDegrees: 5, maximumCrossTableElevationDifferenceMeters: 1 },
  terrainSampler: (point) => ({ elevation: point.x / 100, slopeDegrees: point.x > 70 ? 6 : 2 }),
});
assert(tables.length > 0);
assert.deepEqual(
  tables,
  generateTables({
    area,
    table: tableDefinition,
    boundary,
    exclusions: [exclusion],
    terrainLimits: { maximumSlopeDegrees: 5, maximumCrossTableElevationDifferenceMeters: 1 },
    terrainSampler: (point) => ({ elevation: point.x / 100, slopeDegrees: point.x > 70 ? 6 : 2 }),
  }),
);
assert(
  tables.some((table) =>
    table.findings.some((finding) => finding.code === "EXCLUSION" && finding.status === "fail"),
  ),
);
assert(
  tables.some((table) =>
    table.findings.some((finding) => finding.code === "TERRAIN_SLOPE" && finding.status === "fail"),
  ),
);
const cancelled = generateTables({
  area,
  table: tableDefinition,
  boundary,
  exclusions: [],
  terrainLimits: {},
  cancellation: { cancelled: true },
});
assert.deepEqual(cancelled, []);
const moved = editTable(tables[0], { type: "move", center: { x: 20, y: 20 } });
assert.equal(moved.center.x, 20);
assert.equal(editTable(moved, { type: "rotate", azimuthDegrees: 10 }).azimuthDegrees, 10);
assert.equal(editTable(moved, { type: "exclude" }).reviewStatus, "excluded");
const firstTwo = tables.slice(0, 2);
const overlapMove = editTable(firstTwo[1], {
  type: "move",
  center: { ...firstTwo[0].center },
});
const overlapping = revalidateLayoutTables([firstTwo[0], overlapMove], area, boundary, [], {});
assert(
  overlapping.every((table) =>
    table.findings.some((finding) => finding.code === "TABLE_OVERLAP" && finding.status === "fail"),
  ),
);
const separated = revalidateLayoutTables(
  [
    firstTwo[0],
    editTable(overlapMove, {
      type: "move",
      center: { x: firstTwo[0].center.x + 20, y: firstTwo[0].center.y },
    }),
  ],
  area,
  boundary,
  [],
  {},
);
assert(
  separated.every(
    (table) =>
      !table.findings.some(
        (finding) => finding.code === "TABLE_OVERLAP" && finding.status === "fail",
      ),
  ),
);
const rowValidated = revalidateLayoutTables(
  firstTwo,
  area,
  boundary,
  [],
  { maximumRowElevationChangeMeters: 0.1 },
  (point) => ({ elevation: point.x }),
);
assert(
  rowValidated.every((table) =>
    table.findings.some(
      (finding) => finding.code === "ROW_ELEVATION_VARIATION" && finding.status === "fail",
    ),
  ),
);

const stats = layoutStatistics(boundary, [exclusion], [area], tables);
assert.equal(stats.moduleCount, tables.length * 4);
assert.equal(stats.dcCapacityWatts, tables.length * 2_000);
assert(stats.groundCoverageRatio > 0);

const terrainScene = scene("terrain");
const drawingScene = scene("drawing");
assert(alreadyAlignedRegistration(terrainScene, drawingScene, true).active);
assert.throws(() => alreadyAlignedRegistration(terrainScene, drawingScene, false));
const reviewedTables = tables
  .slice(0, 3)
  .map((table) => ({ ...table, reviewStatus: "reviewed" as const }));
const review: LayoutReview = {
  schemaName: LAYOUT_SCHEMA_NAME,
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  projectName: "Test layout",
  coordinateSystem: "registered-local-metric",
  inputs: { terrainScene, drawingScene, module },
  registration: { ...registration, active: true, confirmed: true },
  siteBoundary: boundary,
  exclusions: [exclusion],
  terrainLimits: {},
  tableDefinitions: [tableDefinition],
  arrayAreas: [area],
  tables: reviewedTables,
  findings: reviewedTables.flatMap((table) => table.findings),
  statistics: layoutStatistics(boundary, [exclusion], [area], reviewedTables),
  reviewStatus: "reviewed",
  limitations: ["Preliminary only"],
  algorithmVersions: ["layout-generation-1.0"],
};
const serialized = serializeLayoutReview(review);
assert.equal(serialized, serializeLayoutReview(review));
assert.equal(parseLayoutReview(serialized).tables.length, 3);
assert.throws(() => parseLayoutReview("{bad"));
const exportedScene = layoutToDraflioScene(review);
assert.equal(exportedScene.objects.length, 6);
assert(exportedScene.objects.some((object) => object.kind === "site-boundary"));
assert(exportedScene.objects.some((object) => object.kind === "exclusion-zone"));
assert(
  exportedScene.objects.some(
    (object) => object.kind === "annotation" && object.metadata.layoutRole === "array-area",
  ),
);
assert.match(findingsCsv(review.findings), /affected_object/);
assert.match(tableScheduleCsv(review), /dc_power_w/);

const maximumBoundary = {
  ...boundary,
  geometry: {
    vertices: [
      { x: 0, y: 0 },
      { x: 10_000, y: 0 },
      { x: 10_000, y: 1_000 },
      { x: 0, y: 1_000 },
      { x: 0, y: 0 },
    ],
  },
  areaSquareMeters: 10_000_000,
};
const maximumArea = {
  ...area,
  geometry: maximumBoundary.geometry,
  effectivePlacementRegions: [maximumBoundary.geometry],
  maximumTableCount: 10_000,
};
const started = performance.now();
const maximumTables = generateTables({
  area: maximumArea,
  table: { ...tableDefinition, widthMeters: 0.5, projectedDepthMeters: 0.5 },
  boundary: maximumBoundary,
  exclusions: [],
  terrainLimits: {},
});
const generationMs = performance.now() - started;
const serializationStarted = performance.now();
serializeLayoutReview({ ...review, tables: maximumTables.slice(0, 1_000) });
const serializationMs = performance.now() - serializationStarted;
assert.throws(() => serializeLayoutReview({ ...review, tables: maximumTables }), /20 MB limit/);
assert(generationMs < 10_000);
assert.equal(maximumTables.length, 10_000);
console.log(
  `Layout registration, polygons, constraints, editing, statistics, exports and bounded performance passed; generated ${maximumTables.length} tables in ${generationMs.toFixed(1)} ms; serialization ${serializationMs.toFixed(1)} ms.`,
);

function tableDefinitionInput(approvedModule: PvModuleRecord) {
  return {
    id: "type-test",
    name: "test",
    module: approvedModule,
    orientation: "portrait" as const,
    modulesAcross: 2,
    modulesHigh: 2,
    horizontalGapMeters: 0.02,
    verticalGapMeters: 0.02,
    edgeAllowanceMeters: 0.1,
    tiltDegrees: 20,
    azimuthDegrees: 180,
    minimumGroundClearanceMeters: 0.5,
  };
}
function scene(kind: "terrain" | "drawing"): DraflioScene {
  const value = createEmptyDraflioScene(`${kind} scene`);
  value.sceneId = `${kind}-scene`;
  value.createdAt = "2026-01-01T00:00:00.000Z";
  value.updatedAt = value.createdAt;
  value.coordinateSystem = { type: "local", name: "test", origin: { x: 0, y: 0, z: 0 } };
  if (kind === "terrain") {
    const terrain: TerrainSurface = {
      id: "terrain-1",
      kind: "terrain-surface",
      name: "Terrain",
      visible: true,
      reviewStatus: "approved",
      geometry: {
        type: "mesh",
        vertices: [
          { x: 0, y: 0, z: 0 },
          { x: 100, y: 0, z: 0 },
          { x: 0, y: 100, z: 0 },
        ],
        triangles: [[0, 1, 2]],
      },
      transform: createDefaultTransform(),
      sourceReferences: [],
      warnings: [],
      metadata: {},
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      elevationRange: { minimum: 0, maximum: 0 },
      sourceType: "manual",
    };
    value.objects = [terrain];
  }
  return value;
}
