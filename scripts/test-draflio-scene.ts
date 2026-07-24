import assert from "node:assert/strict";
import {
  calculateGeometryBounds,
  createDefaultTransform,
} from "../shared/renewableEnergy/draflioSceneGeometry";
import {
  createEmptyDraflioScene,
  normalizeDraflioScene,
  parseDraflioSceneJson,
  safeSceneFilename,
  serializeDraflioScene,
} from "../shared/renewableEnergy/draflioSceneSerialization";
import { getDraflioSceneStatistics } from "../shared/renewableEnergy/draflioSceneStatistics";
import { validateDraflioScene } from "../shared/renewableEnergy/draflioSceneValidation";

const empty = createEmptyDraflioScene(" Test\r\nScene ");
const validation = validateDraflioScene(empty);
assert.equal(validation.valid, true);
assert.ok(validation.warnings.some((issue) => issue.code === "EMPTY_SCENE"));
assert.equal(empty.objects.length, 0);
assert.equal(getDraflioSceneStatistics(empty).objectCount, 0);
assert.deepEqual(createDefaultTransform(), {
  translation: { x: 0, y: 0, z: 0 },
  rotationDegrees: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
});

const serialized = serializeDraflioScene(empty);
assert.deepEqual(parseDraflioSceneJson(serialized).ok, true);
assert.equal(serialized, serializeDraflioScene(empty));
assert.equal(parseDraflioSceneJson("{bad").ok, false);
assert.equal(parseDraflioSceneJson("").ok, false);
assert.equal(safeSceneFilename("../../ unsafe name"), "unsafe-name.draflio-scene.json");

const clone = JSON.parse(serialized);
clone.schemaVersion = "2.0";
assert.ok(
  validateDraflioScene(clone).errors.some((issue) => issue.code === "INVALID_SCHEMA_VERSION"),
);
clone.schemaVersion = "1.0";
clone.sceneId = "not-a-uuid";
assert.ok(validateDraflioScene(clone).errors.some((issue) => issue.code === "INVALID_SCENE_ID"));
clone.sceneId = empty.sceneId;
clone.units.length = "ft";
assert.ok(validateDraflioScene(clone).errors.some((issue) => issue.code === "INVALID_UNITS"));

const projected = { ...empty, coordinateSystem: { type: "projected" as const, epsgCode: 32643 } };
assert.equal(validateDraflioScene(projected).valid, true);
const geographic = { ...empty, coordinateSystem: { type: "geographic" as const } };
assert.equal(validateDraflioScene(geographic).valid, true);
assert.ok(
  validateDraflioScene(geographic).warnings.some(
    (issue) => issue.code === "GEOGRAPHIC_COORDINATES_REQUIRE_PROJECTION",
  ),
);

assert.deepEqual(calculateGeometryBounds({ type: "point", position: { x: 2, y: 3, z: 4 } }), {
  minimum: { x: 2, y: 3, z: 4 },
  maximum: { x: 2, y: 3, z: 4 },
});
assert.deepEqual(calculateGeometryBounds({ type: "box", width: 4, depth: 2, height: 3 }), {
  minimum: { x: -2, y: -1, z: 0 },
  maximum: { x: 2, y: 1, z: 3 },
});
const normal = normalizeDraflioScene(empty);
assert.equal(normal.name, "Test\nScene");
assert.equal(empty.name, "Test\nScene");
assert.equal(Object.is(normal.coordinateSystem.origin?.x, -0), false);
console.log(
  "DraflioScene schema, geometry, normalization, serialization, and statistics checks passed.",
);
