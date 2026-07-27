import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  IDENTITY_MATRIX,
  classifyPage,
  cleanExtractedPaths,
  createCalibration,
  multiplyMatrices,
  normalizePaths,
  transformPoint,
} from "../shared/renewableEnergy/drawing/drawingCore";
import { drawingToDraflioScene } from "../shared/renewableEnergy/drawing/drawingSceneConversion";
import type { DrawingPath } from "../shared/renewableEnergy/drawing/drawingTypes";
import { validateDraflioScene } from "../shared/renewableEnergy/draflioSceneValidation";
import { serializeDraflioScene } from "../shared/renewableEnergy/draflioSceneSerialization";

assert.equal(classifyPage(1, 0, 0).classification, "vector");
assert.equal(classifyPage(0, 1, 0).classification, "raster");
assert.equal(classifyPage(1, 1, 0).classification, "mixed");
assert.equal(classifyPage(0, 0, 0).classification, "empty");
assert.equal(classifyPage(0, 0, 2).classification, "unsupported");
assert.deepEqual(transformPoint(IDENTITY_MATRIX, { x: 2, y: 3 }), { x: 2, y: 3 });
assert.deepEqual(transformPoint([1, 0, 0, 1, 5, 7], { x: 2, y: 3 }), { x: 7, y: 10 });
assert.deepEqual(transformPoint([2, 0, 0, 3, 0, 0], { x: 2, y: 3 }), { x: 4, y: 9 });
assert.deepEqual(transformPoint([0, 1, -1, 0, 0, 0], { x: 2, y: 3 }), { x: -3, y: 2 });
assert.deepEqual(multiplyMatrices([1, 0, 0, 1, 5, 0], [2, 0, 0, 2, 0, 0]), [2, 0, 0, 2, 5, 0]);
assert.throws(() => transformPoint(IDENTITY_MATRIX, { x: Number.NaN, y: 0 }));

const calibration = createCalibration({
  pageNumber: 2,
  first: { x: 0, y: 0 },
  second: { x: 100, y: 0 },
  enteredDistance: 10,
  unit: "m",
  confirmed: true,
});
assert.equal(calibration.metresPerPoint, 0.1);
assert.equal(
  createCalibration({
    pageNumber: 1,
    first: { x: 0, y: 0 },
    second: { x: 10, y: 0 },
    enteredDistance: 10,
    unit: "ft",
  }).distanceMeters,
  3.048,
);
assert.equal(
  createCalibration({
    pageNumber: 1,
    first: { x: 0, y: 0 },
    second: { x: 10, y: 0 },
    enteredDistance: 1000,
    unit: "mm",
  }).distanceMeters,
  1,
);
for (const enteredDistance of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
  assert.throws(() =>
    createCalibration({
      pageNumber: 1,
      first: { x: 0, y: 0 },
      second: { x: 1, y: 0 },
      enteredDistance,
      unit: "m",
    }),
  );
assert.throws(() =>
  createCalibration({
    pageNumber: 1,
    first: { x: 0, y: 0 },
    second: { x: 0, y: 0 },
    enteredDistance: 1,
    unit: "m",
  }),
);

const path = (id: string, points: { x: number; y: number }[], closed = false): DrawingPath => ({
  id,
  pageNumber: 1,
  points,
  closed,
  sourceBounds: { x: 0, y: 0, width: 10, height: 10 },
  lineWidth: 1,
  reviewState: "accepted",
  classification: "reference-geometry",
  findings: [],
});
const line = path("line", [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
]);
const rectangle = path(
  "rectangle",
  [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ],
  true,
);
const cleanup = cleanExtractedPaths([
  line,
  { ...line, id: "duplicate" },
  path("zero", [
    { x: 1, y: 1 },
    { x: 1, y: 1 },
  ]),
  path("tiny", [
    { x: 0, y: 0 },
    { x: 0.1, y: 0 },
  ]),
  rectangle,
]);
assert.equal(cleanup.paths.length, 3);
assert(cleanup.findings.some((finding) => finding.code === "EXACT_DUPLICATE"));
assert(cleanup.findings.some((finding) => finding.code === "ZERO_LENGTH"));
assert(cleanup.findings.some((finding) => finding.code === "TINY_SEGMENT"));
assert.equal(
  normalizePaths(
    [...cleanup.paths, { ...line, id: "excluded", reviewState: "excluded" }],
    calibration,
  ).length,
  3,
);
assert.throws(() => normalizePaths([line], { ...calibration, confirmed: false }));

const extraction = {
  algorithmVersion: "drawing-vector-1.0" as const,
  pages: [
    {
      pageNumber: 1,
      width: 100,
      height: 100,
      rotation: 0,
      vectorOperations: 2,
      imageOperations: 0,
      textOperations: 0,
      operatorCount: 10,
      classification: "vector" as const,
      explanation: "vector",
    },
  ],
  originalPaths: [line, rectangle],
  paths: [line, rectangle, { ...line, id: "excluded-history", reviewState: "excluded" as const }],
  findings: cleanup.findings,
  cleanup: cleanup.cleanup,
};
const scene = drawingToDraflioScene({
  sourceName: "drawing.pdf",
  importedAt: "2026-01-01T00:00:00.000Z",
  extraction,
  calibration,
});
assert.equal(validateDraflioScene(scene).valid, true);
assert.equal(scene.coordinateSystem.type, "local");
assert(scene.objects.every((object) => object.geometry.type === "polyline"));
assert(scene.objects.every((object) => object.geometry.type !== "mesh"));
assert(scene.objects.every((object) => object.sourceReferences[0].pageNumber === 1));
assert(scene.objects.every((object) => object.reviewStatus === "needs-review"));
assert(scene.revisions[0].summary?.includes("excluded-history"));
assert(
  scene.objects.every(
    (object) =>
      object.geometry.type !== "polyline" || object.geometry.points.every((point) => point.z === 0),
  ),
);
assert.equal(serializeDraflioScene(scene), serializeDraflioScene(scene));
assert.equal(line.points[1].x, 10);

const large = Array.from({ length: 25_000 }, (_, index) =>
  path(`large-${String(index).padStart(6, "0")}`, [
    { x: index, y: 0 },
    { x: index + 1, y: 1 },
  ]),
);
const started = performance.now();
assert.equal(cleanExtractedPaths(large).paths.length, 25_000);
const elapsed = performance.now() - started;
assert(elapsed < 2_500, `Large drawing cleanup took ${elapsed.toFixed(1)} ms.`);
console.log(
  `Drawing core, calibration, cleanup, review, scene, and 25,000-path checks passed in ${elapsed.toFixed(1)} ms.`,
);
