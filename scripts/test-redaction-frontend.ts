/// <reference types="node" />

import {
  displayPointToNormalized,
  drawNormalizedRectangle,
  isLargeEnough,
  MAXIMUM_REDACTION_RECTANGLES,
  moveRectangle,
  normalizedToDisplay,
  pageAspectRatioMatches,
  resizeRectangle,
} from "../src/features/redaction/redactionGeometry.js";
import {
  isTerminalRedactionSession,
  validateRedactionSessionResponse,
} from "../src/lib/redactionSessionValidation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const reverse = drawNormalizedRectangle({ x: 0.8, y: 0.7 }, { x: 0.2, y: 0.1 }, 1);
assert(reverse.x === 0.2 && reverse.y === 0.1, "Reverse drawing origin failed");
assert(
  Math.abs(reverse.width - 0.6) < 1e-10 && Math.abs(reverse.height - 0.6) < 1e-10,
  "Reverse drawing size failed",
);

const normalized = displayPointToNormalized({ x: 250, y: -10 }, 200, 100);
assert(normalized.x === 1 && normalized.y === 0, "Display point clamping failed");
const display = normalizedToDisplay(
  { pageIndex: 0, x: 0.25, y: 0.2, width: 0.5, height: 0.4 },
  800,
  1_000,
);
assert(
  display.left === 200 && display.top === 200 && display.width === 400 && display.height === 400,
  "Display conversion failed",
);

const moved = moveRectangle(
  { ...reverse, x: 0.8, y: 0.8, width: 0.2, height: 0.2 },
  { x: 0.5, y: 0.5 },
);
assert(moved.x === 0.8 && moved.y === 0.8, "Movement bounds failed");
const resized = resizeRectangle(
  { ...reverse, x: 0.2, y: 0.2, width: 0.4, height: 0.4 },
  "north-west",
  { x: -1, y: -1 },
  0.01,
  0.01,
);
assert(
  resized.x === 0 &&
    resized.y === 0 &&
    Math.abs(resized.width - 0.6) < 1e-10 &&
    Math.abs(resized.height - 0.6) < 1e-10,
  "Resize bounds failed",
);
assert(
  !isLargeEnough({ pageIndex: 0, x: 0, y: 0, width: 0.001, height: 0.001 }, 500, 500),
  "Tiny rectangle was accepted",
);
assert(MAXIMUM_REDACTION_RECTANGLES === 100, "Rectangle maximum changed");
assert(
  pageAspectRatioMatches({ width: 792, height: 612 }, { width: 792.1, height: 612.1 }),
  "Rotated ratio comparison failed",
);

const session = validateRedactionSessionResponse({
  session: {
    id: "00000000-0000-4000-8000-000000000001",
    status: "review-ready",
    stage: "review-ready",
    message: "Ready.",
    progress: { mode: "indeterminate" },
    revision: 1,
    originalFilename: "document.pdf",
    outputFilename: "document-redacted.pdf",
    inputMediaType: "application/pdf",
    outputMediaType: "application/pdf",
    pageCount: 2,
    pageDimensions: [
      { width: 612, height: 792 },
      { width: 792, height: 612 },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    resultReady: false,
  },
});
assert(session.pageCount === 2 && !isTerminalRedactionSession(session), "Valid response failed");
for (const status of ["completed", "failed", "cancelled"] as const) {
  assert(isTerminalRedactionSession({ ...session, status }), `${status} was not terminal`);
}
assert(!isTerminalRedactionSession({ ...session, status: "running" }), "Running was terminal");

for (const malformed of [
  {},
  { session: { ...session, status: "invented" } },
  { session: { ...session, stage: "invented" } },
  {
    session: {
      ...session,
      progress: { mode: "determinate", unit: "pages", completed: 3, total: 2 },
    },
  },
  {
    session: {
      ...session,
      pageDimensions: [
        { width: 0, height: 1 },
        { width: 1, height: 1 },
      ],
    },
  },
]) {
  let rejected = false;
  try {
    validateRedactionSessionResponse(malformed);
  } catch {
    rejected = true;
  }
  assert(rejected, "Malformed response was accepted");
}

console.log(
  JSON.stringify({
    geometry: "passed",
    reverseDrawing: "passed",
    clamping: "passed",
    rotationAssumption: "passed",
    maximumRectangles: MAXIMUM_REDACTION_RECTANGLES,
    runtimeValidation: "passed",
  }),
);
