import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspace = readFileSync(
  "src/features/renewable-energy/drawing/DrawingSceneWorkspace.tsx",
  "utf8",
);
const client = readFileSync("src/features/renewable-energy/drawing/drawingPdfClient.ts", "utf8");
const preview = readFileSync("src/features/renewable-energy/drawing/Drawing3DPreview.tsx", "utf8");
for (const required of [
  "AbortController",
  "generation.current",
  "loadingTask.destroy",
  "URL.createObjectURL",
  "URL.revokeObjectURL",
  "isEvalSupported: false",
  "getOperatorList",
  "getTextContent",
  "Cancel processing",
  "Start over",
  "Confirm calibration",
  "accepted",
  "excluded",
  "unresolved",
  "Previous page",
  "Next page",
  "Page number",
  "Merge contiguous collinear segments",
])
  assert(workspace.includes(required) || client.includes(required), `Missing ${required}`);
for (const required of [
  "cancelAnimationFrame",
  "controls.dispose",
  "geometry.dispose",
  "material.dispose",
  "renderer.dispose",
  "forceContextLoss",
  "webglcontextlost",
  "webglcontextrestored",
  "Top view",
  "Isometric view",
  "Fit geometry",
  "Reset view",
])
  assert(preview.includes(required), `Missing renderer cleanup ${required}`);
for (const banned of [
  "fetch(",
  "axios",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "dangerouslySetInnerHTML",
  "console.log",
])
  assert(
    !workspace.includes(banned) && !client.includes(banned) && !preview.includes(banned),
    `Banned frontend API ${banned}`,
  );
console.log("Drawing-to-Scene frontend cancellation, privacy, review, and renderer checks passed.");
