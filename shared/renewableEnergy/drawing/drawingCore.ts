import {
  DRAWING_LIMITS,
  type Calibration,
  type DrawingExtraction,
  type DrawingPath,
  type DrawingPoint,
  type PageClassification,
} from "./drawingTypes";

export type Matrix = [number, number, number, number, number, number];
export const IDENTITY_MATRIX: Matrix = [1, 0, 0, 1, 0, 0];

export function multiplyMatrices(left: Matrix, right: Matrix): Matrix {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

export function transformPoint(matrix: Matrix, point: DrawingPoint): DrawingPoint {
  const result = {
    x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
    y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
  };
  assertPoint(result);
  return result;
}

export function classifyPage(
  vector: number,
  image: number,
  text: number,
): {
  classification: PageClassification;
  explanation: string;
} {
  if (vector > 0 && image > 0)
    return {
      classification: "mixed",
      explanation: "Contains vector drawing operators and raster images.",
    };
  if (vector > 0)
    return {
      classification: "vector",
      explanation: "Contains supported vector drawing operators.",
    };
  if (image > 0)
    return {
      classification: "raster",
      explanation: "Contains raster images but no supported vector drawing operators.",
    };
  if (text > 0)
    return {
      classification: "unsupported",
      explanation: "Contains text only; text is retained as source annotation evidence.",
    };
  return {
    classification: "empty",
    explanation: "No vector, image, or text drawing content was detected.",
  };
}

export function createCalibration(input: {
  pageNumber: number;
  first: DrawingPoint;
  second: DrawingPoint;
  enteredDistance: number;
  unit: Calibration["unit"];
  revision?: number;
  confirmed?: boolean;
}): Calibration {
  assertPoint(input.first);
  assertPoint(input.second);
  if (!Number.isFinite(input.enteredDistance) || input.enteredDistance <= 0)
    throw new Error("Known distance must be a finite positive value.");
  const pointDistance = Math.hypot(input.second.x - input.first.x, input.second.y - input.first.y);
  if (!Number.isFinite(pointDistance) || pointDistance <= 0)
    throw new Error("Calibration points must be distinct.");
  const factor = input.unit === "m" ? 1 : input.unit === "ft" ? 0.3048 : 0.001;
  const distanceMeters = input.enteredDistance * factor;
  const metresPerPoint = distanceMeters / pointDistance;
  if (
    !Number.isFinite(metresPerPoint) ||
    metresPerPoint < DRAWING_LIMITS.minCalibrationMetersPerPoint ||
    metresPerPoint > DRAWING_LIMITS.maxCalibrationMetersPerPoint
  )
    throw new Error("Calibration scale is outside supported engineering bounds.");
  return {
    pageNumber: input.pageNumber,
    first: { ...input.first },
    second: { ...input.second },
    enteredDistance: input.enteredDistance,
    unit: input.unit,
    distanceMeters,
    metresPerPoint,
    method: "manual",
    confirmed: input.confirmed ?? false,
    revision: input.revision ?? 1,
  };
}

export function normalizePaths(paths: DrawingPath[], calibration: Calibration): DrawingPath[] {
  if (!calibration.confirmed) throw new Error("Manual calibration must be confirmed.");
  const accepted = paths.filter((path) => path.reviewState === "accepted");
  const originX = Math.min(...accepted.flatMap((path) => path.points.map((point) => point.x)));
  const originY = Math.min(...accepted.flatMap((path) => path.points.map((point) => point.y)));
  return accepted
    .map((path) => ({
      ...path,
      points: path.points.map((point) => ({
        x: (point.x - originX) * calibration.metresPerPoint,
        y: (point.y - originY) * calibration.metresPerPoint,
      })),
      findings: [...path.findings],
    }))
    .sort((a, b) => a.pageNumber - b.pageNumber || a.id.localeCompare(b.id));
}

export function cleanExtractedPaths(
  paths: DrawingPath[],
  options: {
    mergeCollinear?: boolean;
    angularToleranceDegrees?: number;
    gapTolerancePoints?: number;
  } = {},
): Pick<DrawingExtraction, "paths" | "findings" | "cleanup"> {
  const angularToleranceDegrees = options.angularToleranceDegrees ?? 0.25;
  const gapTolerancePoints = options.gapTolerancePoints ?? 0.1;
  if (
    !Number.isFinite(angularToleranceDegrees) ||
    angularToleranceDegrees < 0 ||
    angularToleranceDegrees > DRAWING_LIMITS.maxCollinearToleranceDegrees ||
    !Number.isFinite(gapTolerancePoints) ||
    gapTolerancePoints < 0 ||
    gapTolerancePoints > DRAWING_LIMITS.maxCollinearGapPoints
  )
    throw new Error("Collinear cleanup tolerances are outside supported bounds.");
  const findings: DrawingExtraction["findings"] = [];
  const merges: DrawingExtraction["cleanup"]["merges"] = [];
  const beforeSegmentCount = paths.reduce(
    (sum, path) => sum + Math.max(path.points.length - 1 + (path.closed ? 1 : 0), 0),
    0,
  );
  const seen = new Set<string>();
  const cleaned: DrawingPath[] = [];
  for (const source of paths) {
    if (cleaned.length >= DRAWING_LIMITS.maxObjects)
      throw new Error("Geometry object limit exceeded.");
    const points = source.points.map((point) => ({ ...point }));
    points.forEach(assertPoint);
    const usable = points.filter(
      (point, index) =>
        index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y,
    );
    if (usable.length < 2) {
      findings.push({
        code: "ZERO_LENGTH",
        severity: "warning",
        message: "Zero-length path retained as a finding.",
        objectId: source.id,
        pageNumber: source.pageNumber,
      });
      continue;
    }
    const key = `${source.pageNumber}:${source.closed}:${usable.map((point) => `${point.x},${point.y}`).join(";")}`;
    if (seen.has(key)) {
      findings.push({
        code: "EXACT_DUPLICATE",
        severity: "info",
        message: "Exact duplicate path excluded reproducibly.",
        objectId: source.id,
        pageNumber: source.pageNumber,
      });
      continue;
    }
    seen.add(key);
    if (
      usable.some(
        (point, index) =>
          index > 0 &&
          Math.hypot(point.x - usable[index - 1].x, point.y - usable[index - 1].y) <
            DRAWING_LIMITS.tinySegmentPoints,
      )
    )
      findings.push({
        code: "TINY_SEGMENT",
        severity: "warning",
        message: "Tiny segment requires engineer review.",
        objectId: source.id,
        pageNumber: source.pageNumber,
      });
    const merged =
      options.mergeCollinear && !source.closed
        ? mergeCollinearPoints(
            usable,
            angularToleranceDegrees,
            gapTolerancePoints,
            source.id,
            merges,
          )
        : usable;
    const intersections = findSelfIntersections({ ...source, points: merged });
    findings.push(...intersections);
    cleaned.push({ ...source, points: merged, findings: [...source.findings] });
  }
  const afterSegmentCount = cleaned.reduce(
    (sum, path) => sum + Math.max(path.points.length - 1 + (path.closed ? 1 : 0), 0),
    0,
  );
  return {
    paths: cleaned,
    findings,
    cleanup: {
      collinearMergeEnabled: Boolean(options.mergeCollinear),
      angularToleranceDegrees,
      gapTolerancePoints,
      beforeSegmentCount,
      afterSegmentCount,
      merges,
    },
  };
}

function mergeCollinearPoints(
  points: DrawingPoint[],
  toleranceDegrees: number,
  gapTolerance: number,
  objectId: string,
  merges: DrawingExtraction["cleanup"]["merges"],
) {
  if (points.length < 3) return points;
  const result = [{ ...points[0] }];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = result.at(-1)!;
    const current = points[index];
    const next = points[index + 1];
    const firstLength = Math.hypot(current.x - previous.x, current.y - previous.y);
    const secondLength = Math.hypot(next.x - current.x, next.y - current.y);
    const dot =
      ((current.x - previous.x) * (next.x - current.x) +
        (current.y - previous.y) * (next.y - current.y)) /
      Math.max(firstLength * secondLength, Number.EPSILON);
    const angle = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
    const directLength = Math.hypot(next.x - previous.x, next.y - previous.y);
    const gap =
      directLength <= Number.EPSILON
        ? Number.POSITIVE_INFINITY
        : Math.abs(
            (next.x - previous.x) * (previous.y - current.y) -
              (previous.x - current.x) * (next.y - previous.y),
          ) / directLength;
    if (angle <= toleranceDegrees && gap <= gapTolerance) {
      merges.push({ objectId, removedPointIndex: index });
      continue;
    }
    result.push({ ...current });
  }
  result.push({ ...points.at(-1)! });
  return result;
}

export function findSelfIntersections(path: DrawingPath): DrawingExtraction["findings"] {
  path.points.forEach(assertPoint);
  const count = path.points.length - 1 + (path.closed ? 1 : 0);
  if (count > DRAWING_LIMITS.maxSelfIntersectionSegments)
    return [
      {
        code: "SELF_INTERSECTION_NOT_ANALYSED",
        severity: "warning",
        message: `Self-intersection analysis not completed due to the ${DRAWING_LIMITS.maxSelfIntersectionSegments}-segment complexity limit.`,
        objectId: path.id,
        pageNumber: path.pageNumber,
      },
    ];
  const segments = Array.from(
    { length: count },
    (_, index) => [path.points[index], path.points[(index + 1) % path.points.length]] as const,
  );
  const findings: DrawingExtraction["findings"] = [];
  for (let first = 0; first < segments.length; first += 1) {
    for (let second = first + 1; second < segments.length; second += 1) {
      if (second === first + 1 || (path.closed && first === 0 && second === segments.length - 1))
        continue;
      const kind = segmentIntersection(segments[first], segments[second]);
      if (kind)
        findings.push({
          code: `SELF_INTERSECTION_${kind.toUpperCase()}`,
          severity: "warning",
          message: `${kind} between segments ${first} and ${second}; geometry was not altered.`,
          objectId: path.id,
          pageNumber: path.pageNumber,
        });
    }
  }
  return findings;
}

function segmentIntersection(
  first: readonly [DrawingPoint, DrawingPoint],
  second: readonly [DrawingPoint, DrawingPoint],
): "crossing" | "touching" | "overlapping" | null {
  const cross = (a: DrawingPoint, b: DrawingPoint, c: DrawingPoint) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const values = [
    cross(first[0], first[1], second[0]),
    cross(first[0], first[1], second[1]),
    cross(second[0], second[1], first[0]),
    cross(second[0], second[1], first[1]),
  ];
  const epsilon = 1e-9;
  if (values.every((value) => Math.abs(value) <= epsilon)) {
    const overlapX =
      Math.min(Math.max(first[0].x, first[1].x), Math.max(second[0].x, second[1].x)) -
      Math.max(Math.min(first[0].x, first[1].x), Math.min(second[0].x, second[1].x));
    const overlapY =
      Math.min(Math.max(first[0].y, first[1].y), Math.max(second[0].y, second[1].y)) -
      Math.max(Math.min(first[0].y, first[1].y), Math.min(second[0].y, second[1].y));
    if (Math.max(overlapX, overlapY) > epsilon) return "overlapping";
    if (Math.max(overlapX, overlapY) >= -epsilon) return "touching";
    return null;
  }
  if (values[0] * values[1] < 0 && values[2] * values[3] < 0) return "crossing";
  if (
    values.some((value) => Math.abs(value) <= epsilon) &&
    values[0] * values[1] <= 0 &&
    values[2] * values[3] <= 0
  )
    return "touching";
  return null;
}

function assertPoint(point: DrawingPoint) {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    Math.abs(point.x) > DRAWING_LIMITS.maxCoordinateMagnitude ||
    Math.abs(point.y) > DRAWING_LIMITS.maxCoordinateMagnitude
  )
    throw new Error("Drawing contains an invalid or out-of-bounds coordinate.");
}
