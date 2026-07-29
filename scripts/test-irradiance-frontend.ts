import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const workspace = readFileSync(
  "src/features/renewable-energy/irradiance/IrradianceWorkspace.tsx",
  "utf8",
);
const worker = readFileSync("src/features/renewable-energy/irradiance/irradianceWorker.ts", "utf8");
assert(workspace.includes("new Worker"));
assert(workspace.includes("worker.terminate()"));
assert(workspace.includes("generation.current"));
assert(workspace.includes("Malformed irradiance worker result rejected."));
assert(workspace.includes("URL.createObjectURL") && workspace.includes("URL.revokeObjectURL"));
assert(workspace.includes("No plane-of-array"));
assert(!/localStorage|sessionStorage|indexedDB|document\.cookie|fetch\(/.test(workspace + worker));
assert(!/\bas any\b|@ts-ignore|@ts-nocheck|Math\.random/.test(workspace + worker));
console.log("irradiance frontend: 8 checks passed");
