import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspace = readFileSync(
  "src/features/renewable-energy/shading/ShadingWorkspace.tsx",
  "utf8",
);
const worker = readFileSync("src/features/renewable-energy/shading/shadingWorker.ts", "utf8");
const engineering3D = readFileSync(
  "src/features/renewable-energy/shading/ShadingReview3D.tsx",
  "utf8",
);
const imports = readFileSync("shared/renewableEnergy/shading/shadingImports.ts", "utf8");
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
  "Function(",
  "Math.random",
  "as any",
  "@ts-ignore",
])
  assert(
    !`${workspace}${worker}${engineering3D}${imports}`.includes(prohibited),
    `Prohibited source: ${prohibited}`,
  );

for (const control of [
  "Import RE6A layout-review JSON",
  "Import verified terrain mesh JSON",
  "Import reviewed obstruction records JSON",
  "Review authoritative DraflioScene source",
  "Confirm authoritative source",
  "Review Drawing-to-Scene obstructions",
  "Confirm draft obstruction import",
  "Create draft obstruction",
  "Duplicate",
  "Mark reviewed",
  "Exclude",
  "Restore",
  "Confirm delete",
  "Row-to-row",
  "Calculate selected time",
  "Run in worker",
  "Cancel",
  "Zoom in",
  "Zoom out",
  "Fit site",
  "Fit selection",
  "Previous timestamp",
  "Next timestamp",
  "Reset playback",
  "Technical Three.js engineering review",
  "terrain",
  "boundary",
  "exclusions",
  "areas",
  "Shading-review JSON",
  "Findings CSV",
  "Time-range table summary CSV",
  "Start over",
])
  assert(workspace.includes(control), `Missing shading workflow control: ${control}`);

for (const lifecycle of [
  "workerRef.current?.terminate()",
  "worker.terminate()",
  "URL.revokeObjectURL",
  "setPointerCapture",
  "releasePointerCapture",
  "onPointerCancel",
])
  assert(workspace.includes(lifecycle), `Missing lifecycle behavior: ${lifecycle}`);

assert(workspace.includes('aria-label="Interactive 2D shading engineering review in metres'));
assert(workspace.includes("focus-visible:ring-2"));
assert(workspace.includes("boundsOf(selectedPoints)"));
assert(workspace.includes("terrain?.triangles.map"));
assert(workspace.includes("layout.siteBoundary.geometry.vertices"));
assert(workspace.includes("item.effectivePlacementRegions.map"));
assert(workspace.includes("Geometric shaded fractions are not energy loss."));
assert(workspace.includes("activeGenerationRef.current !== nextGeneration"));
assert(workspace.includes("Sample symbols: clear = open circle"));
assert(engineering3D.includes("webglcontextlost"));
assert(engineering3D.includes("forceContextLoss"));
assert(engineering3D.includes("cancelAnimationFrame"));
assert(engineering3D.includes("removeEventListener"));
for (const control of ["Top view", "Isometric view", "Fit site", "Fit selection", "Reset view"])
  assert(engineering3D.includes(control), `Missing 3D engineering control: ${control}`);
assert(!/[ÂÃ�]/u.test(workspace), "Known mojibake sequence found.");

console.log(
  "Shading frontend import, obstruction lifecycle, domains, worker safety, 2D interaction, exports, accessibility, and privacy checks passed.",
);
