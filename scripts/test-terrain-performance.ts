import assert from "node:assert/strict";
import { createTerrainGrid } from "../shared/renewableEnergy/terrain/terrainCore";
import type { TerrainPoint } from "../shared/renewableEnergy/terrain/terrainTypes";

const points: TerrainPoint[] = [];
for (let row = 0; row < 100; row++)
  for (let column = 0; column < 100; column++)
    points.push({ x: column, y: row, z: column * 0.1 + row * 0.05, sourceIndex: points.length });
const start = performance.now();
const first = createTerrainGrid(points, {
  gridSpacing: 1,
  idwPower: 2,
  searchRadius: 3,
  minNeighbours: 3,
  maxNeighbours: 12,
  contourInterval: 1,
  preferredSlope: 8,
  reviewSlope: 15,
});
const second = createTerrainGrid(points, {
  gridSpacing: 1,
  idwPower: 2,
  searchRadius: 3,
  minNeighbours: 3,
  maxNeighbours: 12,
  contourInterval: 1,
  preferredSlope: 8,
  reviewSlope: 15,
});
assert.deepEqual(first, second);
assert.ok(performance.now() - start < 15_000);
console.log(
  `Terrain 10,000-point deterministic grid check passed in ${(performance.now() - start).toFixed(1)} ms.`,
);

const highVolume: TerrainPoint[] = [];
for (let row = 0; row < 200; row++)
  for (let column = 0; column < 250; column++)
    highVolume.push({
      x: column,
      y: row,
      z: column * 0.02 + row * 0.01,
      sourceIndex: highVolume.length,
    });
const highVolumeStart = performance.now();
const highVolumeGrid = createTerrainGrid(highVolume, {
  gridSpacing: 1,
  idwPower: 2,
  searchRadius: 3,
  minNeighbours: 3,
  maxNeighbours: 12,
  contourInterval: 1,
  preferredSlope: 8,
  reviewSlope: 15,
});
assert.deepEqual([highVolumeGrid.rows, highVolumeGrid.columns], [200, 250]);
assert.equal(highVolumeGrid.filledCells, 50_000);
assert.ok(performance.now() - highVolumeStart < 15_000);
console.log(
  `Terrain 50,000-point bounded grid check passed in ${(performance.now() - highVolumeStart).toFixed(1)} ms.`,
);
