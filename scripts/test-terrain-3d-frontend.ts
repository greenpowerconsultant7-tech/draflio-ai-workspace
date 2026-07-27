import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/features/renewable-energy/terrain/Terrain3DReview.tsx", "utf8");
for (const required of [
  "WebGLRenderer",
  "OrbitControls",
  "webglcontextlost",
  "webglcontextrestored",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "ResizeObserver",
  "controls.dispose",
  "geometry.dispose",
  "material.dispose",
  "renderer.dispose",
  "forceContextLoss",
  "Visual elevation exaggeration",
  "Top view",
  "Isometric view",
])
  assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
for (const banned of [
  "fetch(",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "dangerouslySetInnerHTML",
  "Math.random",
])
  assert.equal(source.includes(banned), false);
console.log("Terrain 3D renderer lifecycle, controls, and source-safety checks passed.");
