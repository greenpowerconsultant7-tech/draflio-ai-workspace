import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import * as THREE from "three";
import { createDrawingCameraState } from "../shared/renewableEnergy/drawing/drawing3dCore";
import {
  cleanExtractedPaths,
  findSelfIntersections,
} from "../shared/renewableEnergy/drawing/drawingCore";
import {
  overlayPointToPixels,
  pagePointToOverlay,
} from "../shared/renewableEnergy/drawing/drawingPreviewCore";
import type { DrawingPath } from "../shared/renewableEnergy/drawing/drawingTypes";

const path = (id: string, points: { x: number; y: number }[], closed = false): DrawingPath => ({
  id,
  pageNumber: 1,
  points,
  closed,
  sourceBounds: { x: 0, y: 0, width: 100, height: 100 },
  lineWidth: 1,
  reviewState: "extracted-review-required",
  classification: "unclassified",
  findings: [],
});

const top = createDrawingCameraState(
  [
    { x: 0, y: 0 },
    { x: 100, y: 50 },
  ],
  "top",
  2,
);
assert.equal(top.position.x, top.target.x);
assert(top.position.y > 0 && top.near > 0 && top.far > top.near);
const isometric = createDrawingCameraState(
  [
    { x: 0, y: 0 },
    { x: 100, y: 50 },
  ],
  "isometric",
  2,
);
assert(isometric.position.x > isometric.target.x && isometric.position.z > isometric.target.z);
assert.deepEqual(createDrawingCameraState([], "top", 0), createDrawingCameraState([], "top", 0));
assert(Number.isFinite(createDrawingCameraState([{ x: 1, y: 1 }], "isometric", 1).distance));
assert(
  createDrawingCameraState(
    [
      { x: 0, y: 0 },
      { x: 100, y: 10 },
    ],
    "top",
    0.5,
  ).distance > top.distance,
);
assert(
  findSelfIntersections(
    path("duplicate-segments", [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]),
  ).some((finding) => finding.code.includes("OVERLAPPING")),
);
assert.doesNotThrow(() =>
  findSelfIntersections(
    path("zero-interaction", [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]),
  ),
);
for (let index = 0; index < 100; index += 1)
  assert.deepEqual(
    createDrawingCameraState(
      [
        { x: 0, y: 0 },
        { x: 100, y: 50 },
      ],
      "top",
      2,
    ),
    top,
  );

const collinear = path("collinear", [
  { x: 0, y: 0 },
  { x: 5, y: 0 },
  { x: 10, y: 0 },
]);
const original = structuredClone(collinear);
const disabled = cleanExtractedPaths([collinear]);
assert.equal(disabled.paths[0].points.length, 3);
const merged = cleanExtractedPaths([collinear], {
  mergeCollinear: true,
  angularToleranceDegrees: 0.25,
  gapTolerancePoints: 0.1,
});
assert.equal(merged.paths[0].points.length, 2);
assert.equal(merged.cleanup.merges.length, 1);
assert.deepEqual(collinear, original);
assert.equal(
  cleanExtractedPaths(
    [
      path("outside", [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 1 },
      ]),
    ],
    { mergeCollinear: true, angularToleranceDegrees: 0.25 },
  ).paths[0].points.length,
  3,
);
assert.equal(
  cleanExtractedPaths(
    [
      path("inside", [
        { x: 0, y: 0 },
        { x: 5, y: 0.01 },
        { x: 10, y: 0 },
      ]),
    ],
    { mergeCollinear: true, angularToleranceDegrees: 1, gapTolerancePoints: 0.02 },
  ).paths[0].points.length,
  2,
);
assert.equal(
  cleanExtractedPaths(
    [
      path("gap", [
        { x: 0, y: 0 },
        { x: 5, y: 0.2 },
        { x: 10, y: 0 },
      ]),
    ],
    { mergeCollinear: true, angularToleranceDegrees: 5, gapTolerancePoints: 0.1 },
  ).paths[0].points.length,
  3,
);
assert.equal(
  cleanExtractedPaths(
    [
      path("branch", [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 5 },
      ]),
    ],
    { mergeCollinear: true, angularToleranceDegrees: 5 },
  ).paths[0].points.length,
  3,
);
assert.equal(
  cleanExtractedPaths(
    [
      path("reversed", [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 0, y: 0 },
      ]),
    ],
    { mergeCollinear: true, angularToleranceDegrees: 0.25 },
  ).paths[0].points.length,
  3,
);
assert.equal(
  cleanExtractedPaths([path("closed", collinear.points, true)], { mergeCollinear: true }).paths[0]
    .points.length,
  3,
);
assert.equal(
  cleanExtractedPaths([collinear, { ...collinear, id: "separate", pageNumber: 2 }], {
    mergeCollinear: true,
  }).paths.length,
  2,
);
assert.throws(() =>
  cleanExtractedPaths([collinear], { mergeCollinear: true, angularToleranceDegrees: 6 }),
);
assert.deepEqual(
  cleanExtractedPaths([collinear], { mergeCollinear: true }),
  cleanExtractedPaths([collinear], { mergeCollinear: true }),
);

assert(
  findSelfIntersections(
    path(
      "rectangle",
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      true,
    ),
  ).length === 0,
);
assert(
  findSelfIntersections(
    path(
      "bow",
      [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 10, y: 0 },
      ],
      true,
    ),
  ).some((finding) => finding.code === "SELF_INTERSECTION_CROSSING"),
);
assert(
  findSelfIntersections(
    path("open", [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 10, y: 0 },
    ]),
  ).some((finding) => finding.code.includes("CROSSING")),
);
assert(
  findSelfIntersections(
    path("touch", [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 0 },
      { x: 5, y: 5 },
    ]),
  ).some((finding) => finding.code.includes("TOUCHING")),
);
assert(
  findSelfIntersections(
    path("overlap", [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 2, y: 0 },
      { x: 8, y: 0 },
    ]),
  ).some((finding) => finding.code.includes("OVERLAPPING")),
);
const excessive = path(
  "excessive",
  Array.from({ length: 1_003 }, (_, index) => ({ x: index, y: index % 2 })),
);
assert.equal(findSelfIntersections(excessive)[0].code, "SELF_INTERSECTION_NOT_ANALYSED");
const limit = path(
  "limit",
  Array.from({ length: 1_001 }, (_, index) => ({ x: index, y: index % 2 })),
);
const started = performance.now();
const limitFindings = findSelfIntersections(limit);
const selfMs = performance.now() - started;
assert(selfMs < 2_500);
assert.deepEqual(limitFindings, findSelfIntersections(limit));

const overlay = pagePointToOverlay({ x: 40, y: 60 }, { width: 300, height: 400 });
assert.deepEqual(overlay, { x: 40, y: 60 });
assert.deepEqual(
  overlayPointToPixels(overlay, { width: 300, height: 400 }, { width: 600, height: 800 }),
  { x: 80, y: 120 },
);
assert.deepEqual(
  overlayPointToPixels(overlay, { width: 300, height: 400 }, { width: 300, height: 400 }),
  overlay,
);
const geometryStarted = performance.now();
const geometry = new THREE.BufferGeometry();
geometry.setAttribute(
  "position",
  new THREE.Float32BufferAttribute(
    Array.from({ length: 30_000 }, (_, index) => [index, 0, -(index % 100)]).flat(),
    3,
  ),
);
const geometryMs = performance.now() - geometryStarted;
assert(geometryMs < 1_000);
geometry.dispose();
const mergeStarted = performance.now();
const longCollinear = path(
  "long-collinear",
  Array.from({ length: 25_000 }, (_, index) => ({ x: index, y: 0 })),
);
const longMerged = cleanExtractedPaths([longCollinear], {
  mergeCollinear: true,
  angularToleranceDegrees: 0.25,
  gapTolerancePoints: 0.1,
});
const mergeMs = performance.now() - mergeStarted;
assert.equal(longMerged.paths[0].points.length, 2);
assert(mergeMs < 2_500);
console.log(
  `Drawing camera, collinear, self-intersection, alignment, and 3D geometry checks passed; supported-limit analysis ${selfMs.toFixed(1)} ms; 25,000-point collinear merge ${mergeMs.toFixed(1)} ms; 30,000-point geometry ${geometryMs.toFixed(1)} ms.`,
);
