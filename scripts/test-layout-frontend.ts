import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspace = readFileSync("src/features/renewable-energy/layout/LayoutWorkspace.tsx", "utf8");
const renderer = readFileSync("src/features/renewable-energy/layout/Layout3DReview.tsx", "utf8");
const core = readFileSync("shared/renewableEnergy/layout/layoutCore.ts", "utf8");
for (const prohibited of [
  "fetch(",
  "axios",
  "WebSocket",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "dangerouslySetInnerHTML",
  "innerHTML",
  "eval(",
  "Math.random",
  "console.log",
  "as any",
  "@ts-ignore",
])
  assert(
    !`${workspace}${renderer}${core}`.includes(prohibited),
    `Prohibited source: ${prohibited}`,
  );
for (const required of [
  "Cancel generation",
  "Start over",
  "Terrain DraflioScene JSON",
  "Drawing DraflioScene JSON",
  "Approved module or library JSON",
  "Solve and confirm similarity registration",
  "Review active site boundary",
  "Add reviewed exclusion",
  "Generate deterministic tables",
  "Zoom in",
  "Fit site",
  "Download layout DraflioScene JSON",
  "Download layout-review JSON",
])
  assert(workspace.includes(required), `Missing workflow control: ${required}`);
for (const lifecycle of [
  "cancelAnimationFrame",
  "removeEventListener",
  "controls.dispose()",
  "geometry.dispose()",
  "material.dispose()",
  "renderer.dispose()",
  "renderer.forceContextLoss()",
  "webglcontextlost",
  "webglcontextrestored",
])
  assert(renderer.includes(lifecycle), `Missing renderer cleanup: ${lifecycle}`);
assert(workspace.includes('aria-label="Interactive 2D solar layout review in metres"'));
assert(workspace.includes("setPointerCapture"));
assert(workspace.includes("releasePointerCapture"));
assert(workspace.includes("focus-visible:ring-2"));
assert(renderer.includes("LAYOUT_LIMITS.maxDisplayTriangles"));
assert(renderer.includes("terrainDisplayLimited"));
console.log(
  "Layout frontend accessibility, cancellation, privacy, 2D controls, and 3D lifecycle checks passed.",
);
