import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  safeTerrainFilename,
  validateTerrainFile,
} from "../src/features/renewable-energy/terrain/terrainFileClient";

assert.equal(validateTerrainFile({ name: "points.csv", size: 10 }).valid, true);
assert.equal(validateTerrainFile({ name: "points.txt", size: 10 }).valid, true);
assert.equal(validateTerrainFile({ name: "points.xyz", size: 10 }).valid, true);
assert.equal(validateTerrainFile({ name: "points.pdf", size: 10 }).valid, false);
assert.equal(validateTerrainFile({ name: "points.csv", size: 0 }).valid, false);
assert.equal(validateTerrainFile({ name: "points.csv", size: 25 * 1024 * 1024 + 1 }).valid, false);
assert.equal(safeTerrainFilename("../../unsafe.csv"), "unsafe-terrain-scene.json");
const source = readFileSync("src/features/renewable-energy/terrain/TerrainWorkspace.tsx", "utf8");
for (const banned of [
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "fetch(",
  "dangerouslySetInnerHTML",
  "Math.random",
])
  assert.equal(source.includes(banned), false);
assert.match(source, /worker\.current\?\.terminate/);
assert.match(source, /URL\.revokeObjectURL/);
assert.match(source, /coordinateType === "geographic"/);
assert.match(source, /onPointerDown/);
assert.match(source, /Reprocess with selected exclusions/);
assert.match(source, /generation\.current/);
const worker = readFileSync("src/features/renewable-energy/terrain/terrainWorker.ts", "utf8");
const core = readFileSync("shared/renewableEnergy/terrain/terrainCore.ts", "utf8");
const orderedStages = [
  "parsing",
  "validating-points",
  "checking-quality",
  "detecting-grid",
  "building-spatial-index",
  "interpolating",
  "building-mesh",
  "calculating-contours",
  "calculating-slope-aspect",
  "screening-buildability",
  "preparing-scene",
];
for (const stage of orderedStages) assert.match(`${source}\n${worker}\n${core}`, new RegExp(stage));
console.log("Terrain frontend, privacy, cancellation, and file-safety checks passed.");
