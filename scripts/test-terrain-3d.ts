import assert from "node:assert/strict";
import {
  TERRAIN_3D_LIMITS,
  applyVisualExaggeration,
  createTerrainDisplayGeometry,
  sampleOverlayIndices,
  validateTerrainFor3D,
} from "../shared/renewableEnergy/terrain/terrain3dCore";
import {
  analyzeTerrain,
  buildTerrainMesh,
  createTerrainGrid,
} from "../shared/renewableEnergy/terrain/terrainCore";
import { parseTerrainPoints } from "../shared/renewableEnergy/terrain/terrainParsing";

const parsed = parseTerrainPoints("x,y,z\n0,0,0\n10,0,2\n0,10,1\n10,10,3", {
  delimiter: "comma",
  hasHeader: true,
  mapping: { x: 0, y: 1, z: 2 },
  unit: "m",
  coordinateSystem: { type: "local" },
  conflictResolution: "reject",
});
const analysis = analyzeTerrain(parsed.points, {
  gridSpacing: 5,
  idwPower: 2,
  searchRadius: 20,
  minNeighbours: 2,
  maxNeighbours: 8,
  contourInterval: 1,
  preferredSlope: 8,
  reviewSlope: 15,
});
assert.deepEqual(validateTerrainFor3D(analysis, parsed, "local"), { valid: true });
const display = createTerrainDisplayGeometry(analysis, parsed);
const repeated = createTerrainDisplayGeometry(analysis, parsed);
assert.deepEqual(display, repeated);
const sourcePositions = display.positions.slice();
assert.deepEqual(applyVisualExaggeration(display.positions, 1), display.positions);
const doubled = applyVisualExaggeration(display.positions, 2);
for (let index = 0; index < doubled.length; index++)
  assert.equal(
    doubled[index],
    index % 3 === 1 ? display.positions[index] * 2 : display.positions[index],
  );
assert.deepEqual(display.positions, sourcePositions);
assert.throws(() => applyVisualExaggeration(display.positions, 100));
assert.ok(sampleOverlayIndices(100_000, 5_000).length <= 5_000);

const invalidVertex = structuredClone(analysis);
invalidVertex.mesh.vertices[0].z = Number.NaN;
assert.deepEqual(validateTerrainFor3D(invalidVertex, parsed, "local").valid, false);
const invalidTriangle = structuredClone(analysis);
invalidTriangle.mesh.triangles[0][0] = invalidTriangle.mesh.vertices.length;
assert.deepEqual(validateTerrainFor3D(invalidTriangle, parsed, "local").valid, false);
const empty = structuredClone(analysis);
empty.mesh.vertices = [];
empty.mesh.triangles = [];
assert.deepEqual(validateTerrainFor3D(empty, parsed, "local").valid, false);
const excessive = structuredClone(analysis);
excessive.mesh.vertices = Array.from({ length: TERRAIN_3D_LIMITS.maxVertices + 1 }, () => ({
  x: 0,
  y: 0,
  z: 0,
}));
assert.deepEqual(validateTerrainFor3D(excessive, parsed, "local").valid, false);
const invalidBounds = structuredClone(parsed);
invalidBounds.originalBounds.minX = Number.POSITIVE_INFINITY;
assert.equal(validateTerrainFor3D(analysis, invalidBounds, "local").valid, false);
assert.equal(validateTerrainFor3D(analysis, parsed, "geographic").valid, false);
assert.equal(analysis.mesh.vertices[0].z, sourcePositions[1]);
const largePoints = Array.from({ length: 50_000 }, (_, index) => ({
  x: index % 250,
  y: Math.floor(index / 250),
  z: (index % 19) * 0.1,
  sourceIndex: index,
}));
const largeGrid = createTerrainGrid(largePoints, {
  gridSpacing: 1,
  idwPower: 2,
  searchRadius: 3,
  minNeighbours: 3,
  maxNeighbours: 12,
  contourInterval: 1,
  preferredSlope: 8,
  reviewSlope: 15,
});
const largeAnalysis = { ...analysis, grid: largeGrid, mesh: buildTerrainMesh(largeGrid) };
const largeParsed = {
  ...parsed,
  points: largePoints,
  acceptedRows: largePoints.length,
  originalBounds: { minX: 0, minY: 0, minZ: 0, maxX: 249, maxY: 199, maxZ: 1.8 },
};
const started = performance.now();
const largeDisplay = createTerrainDisplayGeometry(largeAnalysis, largeParsed, "local");
assert.ok(largeDisplay.indices.length / 3 <= TERRAIN_3D_LIMITS.maxDisplayTriangles);
console.log(
  `Terrain 3D 50,000-vertex display geometry passed in ${(performance.now() - started).toFixed(1)} ms.`,
);
console.log(
  "Terrain 3D validation, deterministic display geometry, LOD, and exaggeration checks passed.",
);
