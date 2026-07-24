import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  paginate,
  validateSceneJsonFile,
} from "../src/features/renewable-energy/scene/sceneJsonClient";

assert.deepEqual(validateSceneJsonFile({ name: "scene.json", size: 1, type: "application/json" }), {
  valid: true,
});
assert.equal(
  validateSceneJsonFile({ name: "scene.pdf", size: 1, type: "application/pdf" }).valid,
  false,
);
assert.equal(
  validateSceneJsonFile({ name: "scene.json", size: 0, type: "application/json" }).valid,
  false,
);
assert.equal(
  validateSceneJsonFile({
    name: "scene.json",
    size: 10 * 1024 * 1024 + 1,
    type: "application/json",
  }).valid,
  false,
);
assert.deepEqual(paginate([1, 2, 3], 0, 2), { items: [1, 2], page: 0, pageCount: 2 });
assert.deepEqual(paginate([1, 2, 3], 1, 2), { items: [3], page: 1, pageCount: 2 });

const source = readFileSync(
  "src/features/renewable-energy/scene/SceneFoundationWorkspace.tsx",
  "utf8",
);
for (const banned of [
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "fetch(",
  "dangerouslySetInnerHTML",
])
  assert.equal(source.includes(banned), false);
assert.match(source, /importGeneration/);
assert.match(source, /URL\.revokeObjectURL/);
assert.match(source, /Start over/);
assert.doesNotMatch(source, /fake|mock/i);
console.log("DraflioScene frontend safety checks passed.");
