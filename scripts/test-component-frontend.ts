import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspace = readFileSync(
  "src/features/renewable-energy/components/ComponentWorkspace.tsx",
  "utf8",
);
for (const value of [
  "PV module",
  "Inverter",
  "Save as review required",
  "Mark reviewed",
  "Approve for current project",
  "Revoke approval",
  "Exclude",
  "Restore",
  "Download module CSV template",
  "Download inverter CSV template",
  "Cancel import",
  "Confirm selected records",
  "Component comparison",
  "Run preliminary compatibility review",
  "Start over",
  "generation.current",
  "URL.createObjectURL",
  "URL.revokeObjectURL",
])
  assert(workspace.includes(value), `Missing frontend behavior ${value}`);
for (const banned of [
  "fetch(",
  "axios",
  "WebSocket",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "dangerouslySetInnerHTML",
  "console.log",
  "Math.random",
  "as any",
  "@ts-ignore",
])
  assert(!workspace.includes(banned), `Banned frontend API ${banned}`);
console.log(
  "Component frontend accessibility, workflow, cancellation, download, and security checks passed.",
);
