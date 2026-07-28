import { EndType, JoinType, inflatePaths, type Path64 } from "clipper2-ts";
import { LAYOUT_LIMITS, type Point2, type Polygon2 } from "./layoutTypes";

export const LAYOUT_GEOMETRY_ALGORITHM_VERSION = "clipper2-inset-1.0" as const;
export const INTEGER_COORDINATE_SCALE = 1_000;
export const INTEGER_COORDINATE_PRECISION_METERS = 1 / INTEGER_COORDINATE_SCALE;
export const MAXIMUM_SCALING_ERROR_METERS = 0.5 / INTEGER_COORDINATE_SCALE;
export const OFFSET_MITER_LIMIT = 2;
export const MINIMUM_SURVIVING_AREA_SQUARE_METERS = 0.001;

export type SetbackResult = {
  originalGeometry: Readonly<{ vertices: readonly Readonly<Point2>[] }>;
  effectiveRegions: Polygon2[];
  setbackMeters: number;
  scale: typeof INTEGER_COORDINATE_SCALE;
  rounding: "Math.round";
  joinType: "miter";
  miterLimit: typeof OFFSET_MITER_LIMIT;
  exactBoundaryIncluded: true;
  topologyChanged: boolean;
  collapsed: boolean;
  algorithmVersion: typeof LAYOUT_GEOMETRY_ALGORITHM_VERSION;
};

export function scaleMetricCoordinate(value: number) {
  if (!Number.isFinite(value) || Math.abs(value) > LAYOUT_LIMITS.maxCoordinateMagnitude)
    throw new Error("Coordinate is non-finite or outside the declared metric range.");
  const scaled = Math.round(value * INTEGER_COORDINATE_SCALE);
  if (!Number.isSafeInteger(scaled))
    throw new Error("Coordinate cannot be represented by the safe integer scaling policy.");
  return scaled;
}

export function createInwardSetback(polygon: Polygon2, setbackMeters: number): SetbackResult {
  return createOffset(polygon, setbackMeters, "inward");
}

export function createOutwardSetback(polygon: Polygon2, setbackMeters: number): SetbackResult {
  return createOffset(polygon, setbackMeters, "outward");
}

function createOffset(
  polygon: Polygon2,
  setbackMeters: number,
  direction: "inward" | "outward",
): SetbackResult {
  validateOffsetSource(polygon);
  if (!Number.isFinite(setbackMeters) || setbackMeters < 0)
    throw new Error("Boundary setback must be a finite non-negative distance.");
  const originalGeometry = Object.freeze({
    vertices: Object.freeze(polygon.vertices.map((point) => Object.freeze({ ...point }))),
  });
  if (setbackMeters === 0)
    return {
      originalGeometry,
      effectiveRegions: [{ vertices: polygon.vertices.map((point) => ({ ...point })) }],
      setbackMeters,
      scale: INTEGER_COORDINATE_SCALE,
      rounding: "Math.round",
      joinType: "miter",
      miterLimit: OFFSET_MITER_LIMIT,
      exactBoundaryIncluded: true,
      topologyChanged: false,
      collapsed: false,
      algorithmVersion: LAYOUT_GEOMETRY_ALGORITHM_VERSION,
    };
  const scaledOffset = scaleMetricCoordinate(setbackMeters);
  if (scaledOffset === 0)
    throw new Error(
      `Setback is below the ${INTEGER_COORDINATE_PRECISION_METERS} m processing precision.`,
    );
  let path: Path64 = polygon.vertices
    .slice(0, -1)
    .map((point) => ({ x: scaleMetricCoordinate(point.x), y: scaleMetricCoordinate(point.y) }));
  if (signedArea(path) < 0) path = [...path].reverse();
  const output = inflatePaths(
    [path],
    direction === "inward" ? -scaledOffset : scaledOffset,
    JoinType.Miter,
    EndType.Polygon,
    OFFSET_MITER_LIMIT,
  );
  const effectiveRegions = output
    .map(fromIntegerPath)
    .filter((region) => Math.abs(polygonArea(region)) >= MINIMUM_SURVIVING_AREA_SQUARE_METERS)
    .sort(compareRegions);
  return {
    originalGeometry,
    effectiveRegions,
    setbackMeters,
    scale: INTEGER_COORDINATE_SCALE,
    rounding: "Math.round",
    joinType: "miter",
    miterLimit: OFFSET_MITER_LIMIT,
    exactBoundaryIncluded: true,
    topologyChanged: effectiveRegions.length !== 1,
    collapsed: direction === "inward" && effectiveRegions.length === 0,
    algorithmVersion: LAYOUT_GEOMETRY_ALGORITHM_VERSION,
  };
}

export function polygonMinimumDistance(left: Polygon2, right: Polygon2) {
  let minimum = Number.POSITIVE_INFINITY;
  for (let a = 0; a < left.vertices.length - 1; a += 1)
    for (let b = 0; b < right.vertices.length - 1; b += 1) {
      if (
        segmentsIntersectInclusive(
          left.vertices[a],
          left.vertices[a + 1],
          right.vertices[b],
          right.vertices[b + 1],
        )
      )
        return 0;
      minimum = Math.min(
        minimum,
        pointSegmentDistance(left.vertices[a], right.vertices[b], right.vertices[b + 1]),
        pointSegmentDistance(right.vertices[b], left.vertices[a], left.vertices[a + 1]),
      );
    }
  return minimum;
}

function validateOffsetSource(polygon: Polygon2) {
  if (polygon.vertices.length < 4 || polygon.vertices.length > LAYOUT_LIMITS.maxVerticesPerPolygon)
    throw new Error("Offset source polygon is outside the supported vertex bounds.");
  const first = polygon.vertices[0];
  const last = polygon.vertices.at(-1);
  if (!last || first.x !== last.x || first.y !== last.y)
    throw new Error("Offset source polygon must be explicitly closed.");
  const unique = new Set<string>();
  for (const point of polygon.vertices.slice(0, -1)) {
    scaleMetricCoordinate(point.x);
    scaleMetricCoordinate(point.y);
    unique.add(`${point.x}|${point.y}`);
  }
  if (unique.size < 3 || Math.abs(polygonArea(polygon)) < Number.EPSILON)
    throw new Error("Offset source polygon is degenerate.");
  if (selfIntersects(polygon))
    throw new Error("Self-intersecting source geometry cannot be offset or silently repaired.");
}

function fromIntegerPath(path: Path64): Polygon2 {
  const vertices = path.map((point) => ({
    x: point.x / INTEGER_COORDINATE_SCALE,
    y: point.y / INTEGER_COORDINATE_SCALE,
  }));
  if (signedArea(path) < 0) vertices.reverse();
  if (vertices.length) {
    let first = 0;
    for (let index = 1; index < vertices.length; index += 1)
      if (
        vertices[index].x < vertices[first].x ||
        (vertices[index].x === vertices[first].x && vertices[index].y < vertices[first].y)
      )
        first = index;
    vertices.push(...vertices.splice(0, first));
  }
  if (vertices.length) vertices.push({ ...vertices[0] });
  return { vertices };
}

function compareRegions(left: Polygon2, right: Polygon2) {
  const leftKey = regionKey(left);
  const rightKey = regionKey(right);
  return leftKey.localeCompare(rightKey);
}

function regionKey(region: Polygon2) {
  const points = region.vertices.slice(0, -1);
  const minimumX = Math.min(...points.map((point) => point.x));
  const minimumY = Math.min(...points.map((point) => point.y));
  return `${minimumX.toFixed(3)}|${minimumY.toFixed(3)}|${Math.abs(polygonArea(region)).toFixed(3)}`;
}

function polygonArea(polygon: Polygon2) {
  return signedArea(polygon.vertices);
}

function signedArea(points: readonly { x: number; y: number }[]) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    sum += points[index].x * next.y - next.x * points[index].y;
  }
  return sum / 2;
}

function selfIntersects(polygon: Polygon2) {
  const points = polygon.vertices;
  for (let left = 0; left < points.length - 1; left += 1)
    for (let right = left + 1; right < points.length - 1; right += 1) {
      if (Math.abs(left - right) <= 1 || (left === 0 && right === points.length - 2)) continue;
      if (segmentsCross(points[left], points[left + 1], points[right], points[right + 1]))
        return true;
    }
  return false;
}

function segmentsCross(a: Point2, b: Point2, c: Point2, d: Point2) {
  const cross = (p: Point2, q: Point2, r: Point2) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
}

function segmentsIntersectInclusive(a: Point2, b: Point2, c: Point2, d: Point2) {
  const orientation = (p: Point2, q: Point2, r: Point2) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const on = (p: Point2, q: Point2, r: Point2) =>
    Math.abs((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)) <= 1e-9 &&
    r.x >= Math.min(p.x, q.x) - 1e-9 &&
    r.x <= Math.max(p.x, q.x) + 1e-9 &&
    r.y >= Math.min(p.y, q.y) - 1e-9 &&
    r.y <= Math.max(p.y, q.y) + 1e-9;
  const values = [
    orientation(a, b, c),
    orientation(a, b, d),
    orientation(c, d, a),
    orientation(c, d, b),
  ];
  return (
    (values[0] !== values[1] && values[2] !== values[3]) ||
    on(a, b, c) ||
    on(a, b, d) ||
    on(c, d, a) ||
    on(c, d, b)
  );
}

function pointSegmentDistance(point: Point2, start: Point2, end: Point2) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const ratio = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
  );
  return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy));
}
