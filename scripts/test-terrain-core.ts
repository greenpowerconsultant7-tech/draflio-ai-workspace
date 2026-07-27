import assert from "node:assert/strict";
import {
  analyzeTerrain,
  buildTerrainMesh,
  calculateContours,
  calculateSlopeAspect,
  createTerrainGrid,
  detectRegularGrid,
  inspectTerrainQuality,
  screenBuildability,
} from "../shared/renewableEnergy/terrain/terrainCore";
import {
  detectTerrainSample,
  parseTerrainPoints,
} from "../shared/renewableEnergy/terrain/terrainParsing";
import type {
  TerrainConfig,
  TerrainImportOptions,
} from "../shared/renewableEnergy/terrain/terrainTypes";

const csv = "x,y,z\n0,0,0\n10,0,10\n0,10,0\n10,10,10\n";
assert.equal(detectTerrainSample(csv).delimiter, "comma");
assert.equal(detectTerrainSample(csv).hasHeader, true);
assert.equal(detectTerrainSample("0;0;0\n1;0;1\n0;1;0").delimiter, "semicolon");
assert.equal(detectTerrainSample("0 0 0\n1 0 1\n0 1 0").delimiter, "whitespace");
assert.throws(() => detectTerrainSample("\0bad"));
const options: TerrainImportOptions = {
  delimiter: "comma",
  hasHeader: true,
  mapping: { x: 0, y: 1, z: 2 },
  unit: "m",
  coordinateSystem: { type: "local" },
  conflictResolution: "reject",
};
const parsed = parseTerrainPoints(csv, options);
assert.equal(parsed.points.length, 4);
assert.equal(detectRegularGrid(parsed.points).regular, true);
const feet = parseTerrainPoints("x,y,z\n0,0,0\n10,0,10\n0,10,0", { ...options, unit: "ft" });
assert.equal(feet.points[1].x, 3.048);
assert.throws(() => parseTerrainPoints(csv, { ...options, mapping: { x: 0, y: 0, z: 2 } }));
assert.throws(() => parseTerrainPoints("x,y,z\n0,0,1\n0,0,2\n1,0,1\n0,1,1", options));
const averaged = parseTerrainPoints("x,y,z\n0,0,1\n0,0,3\n1,0,1\n0,1,1", {
  ...options,
  conflictResolution: "average",
});
assert.equal(averaged.points[0].z, 2);

const config: TerrainConfig = {
  gridSpacing: 5,
  idwPower: 2,
  searchRadius: 20,
  minNeighbours: 2,
  maxNeighbours: 8,
  contourInterval: 2,
  preferredSlope: 8,
  reviewSlope: 15,
};
const grid = createTerrainGrid(parsed.points, config);
assert.deepEqual([grid.rows, grid.columns], [3, 3]);
assert.equal(grid.elevations[4], 5);
const mesh = buildTerrainMesh(grid);
assert.equal(mesh.vertices.length, 9);
assert.equal(mesh.triangles.length, 8);
assert.ok(
  mesh.triangles.every(
    (face) =>
      new Set(face).size === 3 && face.every((index) => index >= 0 && index < mesh.vertices.length),
  ),
);
assert.ok(calculateContours(grid, 2).length > 0);
const flatGrid = {
  ...grid,
  elevations: grid.elevations.map(() => 5),
};
assert.equal(calculateContours(flatGrid, 1).length, 0);
const noDataGrid = {
  ...grid,
  elevations: grid.elevations.map((value, index) => (index === 4 ? null : value)),
  filledCells: 8,
  noDataCells: 1,
};
assert.equal(buildTerrainMesh(noDataGrid).triangles.length, 0);
assert.equal(calculateContours(noDataGrid, 2).flatMap((contour) => contour.segments).length, 0);
assert.throws(
  () =>
    createTerrainGrid(parsed.points, {
      ...config,
      gridSpacing: 0.001,
    }),
  /limits/,
);
const derivatives = calculateSlopeAspect(grid);
assert.ok(derivatives.slopes.every((value) => value === null || Number.isFinite(value)));
assert.deepEqual(screenBuildability([0, 10, 20, null], 8, 15), [
  "preferred",
  "review-required",
  "excluded-by-slope",
  "no-data",
]);
assert.throws(() => screenBuildability([1], 15, 8));
let cancelled = true;
assert.throws(() => createTerrainGrid(parsed.points, config, () => cancelled), /CANCELLED/);
cancelled = false;
const analysis = analyzeTerrain(parsed.points, config);
assert.equal(analysis.mesh.triangles.length, 8);
const reportedStages: string[] = [];
analyzeTerrain(
  parsed.points,
  config,
  0,
  0,
  () => false,
  (stage) => reportedStages.push(stage),
);
assert.deepEqual(reportedStages, [
  "checking-quality",
  "detecting-grid",
  "building-spatial-index",
  "interpolating",
  "building-mesh",
  "calculating-contours",
  "calculating-slope-aspect",
  "screening-buildability",
]);
const screened = inspectTerrainQuality([
  ...parsed.points,
  { x: 1000, y: 1000, z: 500, sourceIndex: 99 },
]);
assert.ok(screened.coordinateOutlierIndices.length > 0);
assert.ok(screened.spikePointIndices.length > 0);
console.log(
  "Terrain parsing, grid, interpolation, mesh, contour, slope, aspect, and screening checks passed.",
);
