import type { PvModuleRecord } from "../components/componentTypes";
import type { DraflioScene, TerrainSurface } from "../draflioSceneTypes";
import { validateDraflioScene } from "../draflioSceneValidation";
import {
  LAYOUT_ALGORITHM_VERSION,
  LAYOUT_LIMITS,
  LAYOUT_RULE_VERSION,
  REGISTRATION_ALGORITHM_VERSION,
  type ArrayArea,
  type ControlPair,
  type ExclusionZone,
  type GeneratedTable,
  type GenerationCancellation,
  type LayoutFinding,
  type LayoutGenerationProgress,
  type LayoutStatistics,
  type Point2,
  type Polygon2,
  type Readiness,
  type RegistrationResult,
  type ReviewedPolygon,
  type TableDefinition,
  type TerrainLimits,
  type TerrainSampler,
} from "./layoutTypes";
import { createOutwardSetback, polygonMinimumDistance } from "./layoutGeometry";

const finitePoint = (point: Point2) =>
  Number.isFinite(point.x) &&
  Number.isFinite(point.y) &&
  Math.abs(point.x) <= LAYOUT_LIMITS.maxCoordinateMagnitude &&
  Math.abs(point.y) <= LAYOUT_LIMITS.maxCoordinateMagnitude;
const distance = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.y - b.y);
const pointToSegmentDistance = (point: Point2, start: Point2, end: Point2) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const squared = dx * dx + dy * dy;
  if (squared === 0) return distance(point, start);
  const ratio = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / squared),
  );
  return distance(point, { x: start.x + ratio * dx, y: start.y + ratio * dy });
};
const roundStable = (value: number) => Number(value.toFixed(9));

export function parseSceneJson(text: string, expected: "terrain" | "drawing"): DraflioScene {
  if (!text || new TextEncoder().encode(text).byteLength > LAYOUT_LIMITS.maxSceneBytes)
    throw new Error("Scene JSON is empty or exceeds the 10 MB limit.");
  let scene: unknown;
  try {
    scene = JSON.parse(text);
  } catch {
    throw new Error("Scene JSON is malformed.");
  }
  const validation = validateDraflioScene(scene);
  if (!validation.valid)
    throw new Error(`Scene is invalid: ${validation.errors[0]?.message ?? "unknown error"}`);
  const typed = structuredClone(scene) as DraflioScene;
  if (new Set(typed.objects.map((object) => object.id)).size !== typed.objects.length)
    throw new Error("Scene contains duplicate object identifiers.");
  if (typed.objects.length > LAYOUT_LIMITS.maxObjects)
    throw new Error("Scene object limit exceeded.");
  if (expected === "terrain") {
    const terrain = typed.objects.find(
      (object): object is TerrainSurface => object.kind === "terrain-surface",
    );
    if (!terrain) throw new Error("Terrain scene requires a terrain-surface object.");
    if (
      terrain.geometry.vertices.length > LAYOUT_LIMITS.maxTerrainVertices ||
      terrain.geometry.triangles.length > LAYOUT_LIMITS.maxTerrainTriangles
    )
      throw new Error("Terrain display or computation limit exceeded.");
  } else {
    const vertices = typed.objects.reduce(
      (sum, object) =>
        sum +
        (object.geometry.type === "polyline"
          ? object.geometry.points.length
          : object.geometry.type === "polygon"
            ? object.geometry.outerRing.length
            : 0),
      0,
    );
    if (vertices > LAYOUT_LIMITS.maxDrawingVertices)
      throw new Error("Drawing vertex limit exceeded.");
  }
  return deepFreeze(typed);
}

export function createTerrainSampler(scene: DraflioScene): TerrainSampler {
  const terrain = scene.objects.find(
    (object): object is TerrainSurface => object.kind === "terrain-surface",
  );
  if (!terrain) throw new Error("Terrain scene has no surface.");
  const vertices = terrain.geometry.vertices;
  const triangles = terrain.geometry.triangles;
  const minimumX = Math.min(...vertices.map((vertex) => vertex.x));
  const maximumX = Math.max(...vertices.map((vertex) => vertex.x));
  const minimumY = Math.min(...vertices.map((vertex) => vertex.y));
  const maximumY = Math.max(...vertices.map((vertex) => vertex.y));
  const cellSize = Math.max(
    Math.sqrt(((maximumX - minimumX) * (maximumY - minimumY)) / Math.max(triangles.length, 1)),
    0.001,
  );
  const slopes = new Array<number>(triangles.length);
  const buckets = new Map<string, number[]>();
  const edgeCounts = new Map<string, [number, number, number]>();
  let bucketEntries = 0;
  triangles.forEach(([a, b, c], triangleIndex) => {
    const va = vertices[a];
    const vb = vertices[b];
    const vc = vertices[c];
    const ux = vb.x - va.x;
    const uy = vb.y - va.y;
    const uz = vb.z - va.z;
    const vx = vc.x - va.x;
    const vy = vc.y - va.y;
    const vz = vc.z - va.z;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const twiceArea = Math.abs(nz);
    if (!Number.isFinite(twiceArea) || twiceArea <= 1e-12) {
      slopes[triangleIndex] = Number.NaN;
      return;
    }
    slopes[triangleIndex] = (Math.atan2(Math.hypot(nx, ny), Math.abs(nz)) * 180) / Math.PI;
    const xs = [va.x, vb.x, vc.x];
    const ys = [va.y, vb.y, vc.y];
    const fromX = Math.floor(Math.min(...xs) / cellSize);
    const toX = Math.floor(Math.max(...xs) / cellSize);
    const fromY = Math.floor(Math.min(...ys) / cellSize);
    const toY = Math.floor(Math.max(...ys) / cellSize);
    for (let x = fromX; x <= toX; x += 1)
      for (let y = fromY; y <= toY; y += 1) {
        bucketEntries += 1;
        if (bucketEntries > 5_000_000)
          throw new Error("Terrain triangle spatial index exceeds its bounded entry limit.");
        const key = `${x}|${y}`;
        buckets.set(key, [...(buckets.get(key) ?? []), triangleIndex]);
      }
    for (const [start, end] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const low = Math.min(start, end);
      const high = Math.max(start, end);
      const key = `${low}|${high}`;
      const existing = edgeCounts.get(key);
      edgeCounts.set(key, [low, high, (existing?.[2] ?? 0) + 1]);
    }
  });
  const noDataEdges = [...edgeCounts.values()]
    .filter((edge) => edge[2] === 1)
    .map(([start, end]) => [vertices[start], vertices[end]] as const);
  const edgeBuckets = new Map<string, number[]>();
  noDataEdges.forEach(([start, end], edgeIndex) => {
    const fromX = Math.floor(Math.min(start.x, end.x) / cellSize);
    const toX = Math.floor(Math.max(start.x, end.x) / cellSize);
    const fromY = Math.floor(Math.min(start.y, end.y) / cellSize);
    const toY = Math.floor(Math.max(start.y, end.y) / cellSize);
    for (let x = fromX; x <= toX; x += 1)
      for (let y = fromY; y <= toY; y += 1) {
        bucketEntries += 1;
        if (bucketEntries > 5_000_000)
          throw new Error("Terrain boundary spatial index exceeds its bounded entry limit.");
        const key = `${x}|${y}`;
        edgeBuckets.set(key, [...(edgeBuckets.get(key) ?? []), edgeIndex]);
      }
  });
  const maximumSearchRadius =
    Math.ceil(Math.max(maximumX - minimumX, maximumY - minimumY) / cellSize) + 2;
  return (point) => {
    if (!finitePoint(point)) return {};
    const key = `${Math.floor(point.x / cellSize)}|${Math.floor(point.y / cellSize)}`;
    const candidates = [...new Set(buckets.get(key) ?? [])].sort((a, b) => a - b);
    for (const triangleIndex of candidates) {
      const [a, b, c] = triangles[triangleIndex];
      const va = vertices[a];
      const vb = vertices[b];
      const vc = vertices[c];
      const denominator = (vb.y - vc.y) * (va.x - vc.x) + (vc.x - vb.x) * (va.y - vc.y);
      if (!Number.isFinite(denominator) || Math.abs(denominator) <= 1e-12) continue;
      const first =
        ((vb.y - vc.y) * (point.x - vc.x) + (vc.x - vb.x) * (point.y - vc.y)) / denominator;
      const second =
        ((vc.y - va.y) * (point.x - vc.x) + (va.x - vc.x) * (point.y - vc.y)) / denominator;
      const third = 1 - first - second;
      if (first < -1e-10 || second < -1e-10 || third < -1e-10) continue;
      const elevation = first * va.z + second * vb.z + third * vc.z;
      let distanceToNoDataMeters = Number.POSITIVE_INFINITY;
      const visitedEdges = new Set<number>();
      const cellX = Math.floor(point.x / cellSize);
      const cellY = Math.floor(point.y / cellSize);
      for (let radius = 0; radius <= maximumSearchRadius; radius += 1) {
        if (
          Number.isFinite(distanceToNoDataMeters) &&
          Math.max(0, radius - 1) * cellSize > distanceToNoDataMeters
        )
          break;
        for (let x = cellX - radius; x <= cellX + radius; x += 1)
          for (let y = cellY - radius; y <= cellY + radius; y += 1) {
            if (
              radius > 0 &&
              x !== cellX - radius &&
              x !== cellX + radius &&
              y !== cellY - radius &&
              y !== cellY + radius
            )
              continue;
            for (const edgeIndex of edgeBuckets.get(`${x}|${y}`) ?? []) {
              if (visitedEdges.has(edgeIndex)) continue;
              visitedEdges.add(edgeIndex);
              const [start, end] = noDataEdges[edgeIndex];
              distanceToNoDataMeters = Math.min(
                distanceToNoDataMeters,
                pointToSegmentDistance(point, { x: start.x, y: start.y }, { x: end.x, y: end.y }),
              );
            }
          }
      }
      return {
        elevation: roundStable(elevation),
        slopeDegrees: slopes[triangleIndex],
        distanceToNoDataMeters: Number.isFinite(distanceToNoDataMeters)
          ? distanceToNoDataMeters
          : undefined,
      };
    }
    return {};
  };
}

export function solveSimilarityRegistration(
  controls: readonly ControlPair[],
  warningThresholdMeters: number,
): RegistrationResult {
  if (
    controls.length < 2 ||
    controls.length > LAYOUT_LIMITS.maxControlPoints ||
    !Number.isFinite(warningThresholdMeters) ||
    warningThresholdMeters < 0
  )
    throw new Error("Registration requires 2–100 controls and a finite non-negative threshold.");
  if (controls.some((control) => !finitePoint(control.drawing) || !finitePoint(control.terrain)))
    throw new Error("Registration controls must contain finite bounded coordinates.");
  if (new Set(controls.map((control) => control.id)).size !== controls.length)
    throw new Error("Registration control identifiers must be unique.");
  const centroid = (key: "drawing" | "terrain"): Point2 => ({
    x: controls.reduce((sum, item) => sum + item[key].x, 0) / controls.length,
    y: controls.reduce((sum, item) => sum + item[key].y, 0) / controls.length,
  });
  const from = centroid("drawing");
  const to = centroid("terrain");
  let denominator = 0;
  let a = 0;
  let b = 0;
  for (const control of controls) {
    const x = control.drawing.x - from.x;
    const y = control.drawing.y - from.y;
    const u = control.terrain.x - to.x;
    const v = control.terrain.y - to.y;
    denominator += x * x + y * y;
    a += x * u + y * v;
    b += x * v - y * u;
  }
  if (denominator < 1e-8)
    throw new Error("Control points are coincident or insufficiently separated.");
  const scale = Math.hypot(a, b) / denominator;
  if (!Number.isFinite(scale) || scale < 0.001 || scale > 1_000)
    throw new Error("Registration scale is outside the supported 0.001–1,000 range.");
  const rotation = Math.atan2(b, a);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const translation = {
    x: to.x - scale * (cos * from.x - sin * from.y),
    y: to.y - scale * (sin * from.x + cos * from.y),
  };
  const residuals = controls.map((control) => ({
    controlId: control.id,
    distance: distance(
      applyRegistration(control.drawing, {
        translation,
        scale,
        rotationDegrees: (rotation * 180) / Math.PI,
      }),
      control.terrain,
    ),
  }));
  const rms = Math.sqrt(
    residuals.reduce((sum, residual) => sum + residual.distance ** 2, 0) / residuals.length,
  );
  const maximum = Math.max(...residuals.map((residual) => residual.distance));
  return {
    method: controls.length === 2 ? "two-point" : "least-squares",
    active: false,
    confirmed: false,
    pointCount: controls.length,
    translation: { x: roundStable(translation.x), y: roundStable(translation.y) },
    rotationDegrees: roundStable((rotation * 180) / Math.PI),
    scale: roundStable(scale),
    rmsResidual: roundStable(rms),
    maximumResidual: roundStable(maximum),
    residuals: residuals.map((residual) => ({
      ...residual,
      distance: roundStable(residual.distance),
    })),
    transformDirection: "drawing-to-terrain",
    warningThresholdMeters,
    warnings:
      maximum > warningThresholdMeters
        ? ["Registration residual exceeds the engineer-entered warning threshold."]
        : [],
    algorithmVersion: REGISTRATION_ALGORITHM_VERSION,
  };
}

export function applyRegistrationToPoint(point: Point2, registration: RegistrationResult) {
  if (!registration.active || !registration.confirmed)
    throw new Error("A confirmed drawing-to-terrain registration is required.");
  if (!finitePoint(point)) throw new Error("Drawing coordinate is non-finite or out of range.");
  const angle = (registration.rotationDegrees * Math.PI) / 180;
  const transformed = {
    x:
      registration.translation.x +
      registration.scale * (point.x * Math.cos(angle) - point.y * Math.sin(angle)),
    y:
      registration.translation.y +
      registration.scale * (point.x * Math.sin(angle) + point.y * Math.cos(angle)),
  };
  if (!finitePoint(transformed)) throw new Error("Registered coordinate is outside safe bounds.");
  return { x: roundStable(transformed.x), y: roundStable(transformed.y) };
}

export function applyRegistrationToPolygon(
  polygon: Polygon2,
  registration: RegistrationResult,
): Polygon2 {
  const transformed = polygon.vertices.map((point) =>
    applyRegistrationToPoint(point, registration),
  );
  return { vertices: transformed };
}

export function alreadyAlignedRegistration(
  terrain: DraflioScene,
  drawing: DraflioScene,
  confirmed: boolean,
): RegistrationResult {
  if (!confirmed)
    throw new Error("Already-aligned registration requires explicit engineer confirmation.");
  if (terrain.coordinateSystem.type !== drawing.coordinateSystem.type)
    throw new Error("Coordinate metadata does not support an already-aligned declaration.");
  return {
    method: "already-aligned",
    active: true,
    confirmed: true,
    pointCount: 0,
    translation: { x: 0, y: 0 },
    rotationDegrees: 0,
    scale: 1,
    rmsResidual: 0,
    maximumResidual: 0,
    residuals: [],
    transformDirection: "drawing-to-terrain",
    warningThresholdMeters: 0,
    warnings: ["Local alignment is engineer-confirmed; geographic alignment is not claimed."],
    algorithmVersion: REGISTRATION_ALGORITHM_VERSION,
  };
}

export function applyRegistration(
  point: Point2,
  transform: Pick<RegistrationResult, "translation" | "rotationDegrees" | "scale">,
): Point2 {
  const angle = (transform.rotationDegrees * Math.PI) / 180;
  return {
    x: roundStable(
      transform.translation.x +
        transform.scale * (Math.cos(angle) * point.x - Math.sin(angle) * point.y),
    ),
    y: roundStable(
      transform.translation.y +
        transform.scale * (Math.sin(angle) * point.x + Math.cos(angle) * point.y),
    ),
  };
}

export function polygonArea(polygon: Polygon2) {
  return Math.abs(signedArea(polygon));
}
function signedArea(polygon: Polygon2) {
  return (
    polygon.vertices.reduce((sum, point, index) => {
      const next = polygon.vertices[(index + 1) % polygon.vertices.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2
  );
}
export function validatePolygon(polygon: Polygon2): string[] {
  const errors: string[] = [];
  if (polygon.vertices.length < 4 || polygon.vertices.length > LAYOUT_LIMITS.maxVerticesPerPolygon)
    errors.push("Polygon requires three unique vertices plus an explicit closing vertex.");
  if (polygon.vertices.some((point) => !finitePoint(point)))
    errors.push("Polygon coordinates must be finite and bounded.");
  if (
    polygon.vertices.length > 1 &&
    distance(polygon.vertices[0], polygon.vertices[polygon.vertices.length - 1]) > 1e-9
  )
    errors.push("Polygon must be explicitly closed.");
  const unique = new Set(polygon.vertices.slice(0, -1).map((point) => `${point.x}|${point.y}`));
  if (unique.size < 3) errors.push("Polygon requires at least three unique vertices.");
  if (polygonArea(polygon) <= 1e-9) errors.push("Polygon area must be non-zero.");
  if (hasSelfIntersection(polygon)) errors.push("Polygon has an unresolved self-intersection.");
  return errors;
}
export function normalizePolygon(polygon: Polygon2): Polygon2 {
  const errors = validatePolygon(polygon);
  if (errors.length) throw new Error(errors.join(" "));
  const vertices = polygon.vertices.map((point) => ({ ...point }));
  if (signedArea({ vertices }) < 0) {
    const open = vertices.slice(0, -1).reverse();
    return { vertices: [...open, { ...open[0] }] };
  }
  return { vertices };
}
function hasSelfIntersection(polygon: Polygon2) {
  const vertices = polygon.vertices;
  for (let a = 0; a < vertices.length - 1; a += 1)
    for (let b = a + 1; b < vertices.length - 1; b += 1) {
      if (Math.abs(a - b) <= 1 || (a === 0 && b === vertices.length - 2)) continue;
      if (segmentsIntersect(vertices[a], vertices[a + 1], vertices[b], vertices[b + 1]))
        return true;
    }
  return false;
}
function segmentsIntersect(a: Point2, b: Point2, c: Point2, d: Point2) {
  const cross = (p: Point2, q: Point2, r: Point2) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const x1 = cross(a, b, c);
  const x2 = cross(a, b, d);
  const x3 = cross(c, d, a);
  const x4 = cross(c, d, b);
  return x1 * x2 < 0 && x3 * x4 < 0;
}
export function pointInPolygon(point: Point2, polygon: Polygon2) {
  let inside = false;
  for (let i = 0, j = polygon.vertices.length - 1; i < polygon.vertices.length; j = i, i += 1) {
    const a = polygon.vertices[i];
    const b = polygon.vertices[j];
    if (pointOnSegment(point, a, b)) return true;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
function pointOnSegment(point: Point2, a: Point2, b: Point2) {
  const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > 1e-8) return false;
  return (
    point.x >= Math.min(a.x, b.x) - 1e-8 &&
    point.x <= Math.max(a.x, b.x) + 1e-8 &&
    point.y >= Math.min(a.y, b.y) - 1e-8 &&
    point.y <= Math.max(a.y, b.y) + 1e-8
  );
}
export function polygonsIntersect(a: Polygon2, b: Polygon2) {
  if (
    a.vertices.some((point) => pointInPolygon(point, b)) ||
    b.vertices.some((point) => pointInPolygon(point, a))
  )
    return true;
  for (let i = 0; i < a.vertices.length - 1; i += 1)
    for (let j = 0; j < b.vertices.length - 1; j += 1)
      if (segmentsIntersect(a.vertices[i], a.vertices[i + 1], b.vertices[j], b.vertices[j + 1]))
        return true;
  return false;
}

export function polygonContained(container: Polygon2, candidate: Polygon2) {
  if (!candidate.vertices.slice(0, -1).every((point) => pointInPolygon(point, container)))
    return false;
  for (let candidateEdge = 0; candidateEdge < candidate.vertices.length - 1; candidateEdge += 1)
    for (let boundaryEdge = 0; boundaryEdge < container.vertices.length - 1; boundaryEdge += 1)
      if (
        segmentsIntersect(
          candidate.vertices[candidateEdge],
          candidate.vertices[candidateEdge + 1],
          container.vertices[boundaryEdge],
          container.vertices[boundaryEdge + 1],
        )
      )
        return false;
  return true;
}

export function createReviewedPolygon(input: {
  id: string;
  name: string;
  geometry: Polygon2;
  source: ReviewedPolygon["source"];
  sourceReference: string;
}): ReviewedPolygon {
  const geometry = normalizePolygon(input.geometry);
  return {
    ...input,
    geometry,
    originalGeometry: deepFreeze(structuredClone(geometry)),
    reviewStatus: "draft",
    areaSquareMeters: polygonArea(geometry),
    warnings: [],
  };
}
export function createExclusion(
  polygon: ReviewedPolygon,
  category: ExclusionZone["category"],
  reason: string,
  setbackMeters?: number,
): ExclusionZone {
  if (!reason.trim()) throw new Error("Exclusion reason is required.");
  if (setbackMeters !== undefined && (!Number.isFinite(setbackMeters) || setbackMeters < 0))
    throw new Error("Exclusion setback must be finite and non-negative.");
  const setback =
    setbackMeters && setbackMeters > 0
      ? createOutwardSetback(polygon.geometry, setbackMeters)
      : undefined;
  if (setback && setback.effectiveRegions.length !== 1)
    throw new Error("Exclusion setback topology requires explicit engineering review.");
  return {
    ...polygon,
    category,
    reason: reason.trim(),
    setbackMeters,
    effectiveGeometry: structuredClone(setback?.effectiveRegions[0] ?? polygon.geometry),
    warnings: setback?.topologyChanged
      ? ["Exclusion setback changed polygon topology and requires review."]
      : [],
  };
}

export function createTableDefinition(input: {
  id: string;
  name: string;
  module: PvModuleRecord;
  orientation: "portrait" | "landscape";
  modulesAcross: number;
  modulesHigh: number;
  horizontalGapMeters: number;
  verticalGapMeters: number;
  edgeAllowanceMeters: number;
  tiltDegrees: number;
  azimuthDegrees: number;
  minimumGroundClearanceMeters: number;
  maximumGroundClearanceMeters?: number;
}): TableDefinition {
  if (input.module.reviewStatus !== "approved-for-current-project")
    throw new Error("Table definition requires a module approved for the current Draflio project.");
  const length = input.module.parameters.length?.normalizedValue;
  const width = input.module.parameters.width?.normalizedValue;
  if (!length || !width) throw new Error("Approved module must supply finite length and width.");
  for (const [name, value] of Object.entries({
    modulesAcross: input.modulesAcross,
    modulesHigh: input.modulesHigh,
    horizontalGapMeters: input.horizontalGapMeters,
    verticalGapMeters: input.verticalGapMeters,
    edgeAllowanceMeters: input.edgeAllowanceMeters,
    tiltDegrees: input.tiltDegrees,
    azimuthDegrees: input.azimuthDegrees,
    minimumGroundClearanceMeters: input.minimumGroundClearanceMeters,
  }))
    if (!Number.isFinite(value)) throw new Error(`${name} must be finite.`);
  if (
    !Number.isInteger(input.modulesAcross) ||
    input.modulesAcross <= 0 ||
    !Number.isInteger(input.modulesHigh) ||
    input.modulesHigh <= 0
  )
    throw new Error("Module counts must be positive integers.");
  if (input.horizontalGapMeters < 0 || input.verticalGapMeters < 0 || input.edgeAllowanceMeters < 0)
    throw new Error("Gaps and allowances must be non-negative.");
  if (
    input.tiltDegrees < 0 ||
    input.tiltDegrees > 90 ||
    input.azimuthDegrees < 0 ||
    input.azimuthDegrees >= 360
  )
    throw new Error("Tilt must be 0–90° and azimuth must be 0–<360°.");
  const moduleAcross = input.orientation === "portrait" ? width : length;
  const moduleSlope = input.orientation === "portrait" ? length : width;
  const tableWidth =
    input.modulesAcross * moduleAcross +
    (input.modulesAcross - 1) * input.horizontalGapMeters +
    2 * input.edgeAllowanceMeters;
  const slopeLength =
    input.modulesHigh * moduleSlope +
    (input.modulesHigh - 1) * input.verticalGapMeters +
    2 * input.edgeAllowanceMeters;
  const projectedDepth = slopeLength * Math.cos((input.tiltDegrees * Math.PI) / 180);
  if (tableWidth > 100 || slopeLength > 100)
    throw new Error("Calculated table dimensions exceed the 100 m supported bound.");
  const moduleCount = input.modulesAcross * input.modulesHigh;
  return {
    id: input.id,
    name: input.name.trim() || input.id,
    moduleRecordId: input.module.recordId,
    orientation: input.orientation,
    modulesAcross: input.modulesAcross,
    modulesHigh: input.modulesHigh,
    horizontalGapMeters: input.horizontalGapMeters,
    verticalGapMeters: input.verticalGapMeters,
    edgeAllowanceMeters: input.edgeAllowanceMeters,
    tiltDegrees: input.tiltDegrees,
    azimuthDegrees: input.azimuthDegrees,
    minimumGroundClearanceMeters: input.minimumGroundClearanceMeters,
    maximumGroundClearanceMeters: input.maximumGroundClearanceMeters,
    widthMeters: roundStable(tableWidth),
    slopeLengthMeters: roundStable(slopeLength),
    projectedDepthMeters: roundStable(projectedDepth),
    moduleCount,
    dcPowerWatts: roundStable(moduleCount * input.module.parameters.ratedPower.normalizedValue),
  };
}

export function generateTables(input: {
  area: ArrayArea;
  table: TableDefinition;
  boundary: ReviewedPolygon;
  exclusions: readonly ExclusionZone[];
  terrainLimits: TerrainLimits;
  terrainSampler?: TerrainSampler;
  cancellation?: GenerationCancellation;
  progress?: (progress: LayoutGenerationProgress) => void;
}): GeneratedTable[] {
  const { area, table, boundary } = input;
  input.progress?.({ stage: "validating-inputs", percent: 5, completed: 1, total: 1 });
  if (validatePolygon(area.geometry).length) throw new Error("Array area is invalid.");
  if (!area.geometry.vertices.some((point) => pointInPolygon(point, boundary.geometry)))
    throw new Error("Array area must lie inside or intersect the site boundary.");
  if (area.rowPitchMeters < table.projectedDepthMeters || area.columnSpacingMeters < 0)
    throw new Error(
      "Row pitch must accommodate projected depth and column spacing must be non-negative.",
    );
  if (area.maximumTableCount <= 0 || area.maximumTableCount > LAYOUT_LIMITS.maxTables)
    throw new Error("Maximum table count is outside the supported range.");
  const angle = (area.azimuthDegrees * Math.PI) / 180;
  // Generate in the table-aligned coordinate frame. Bounding the unrotated
  // polygon and then rotating its candidate centres would translate layouts
  // out of the reviewed area for non-zero azimuths (notably 180 degrees).
  const placementRegion = area.effectivePlacementRegions[0];
  if (!placementRegion) throw new Error("Array area has no reviewed effective placement region.");
  const alignedArea: Polygon2 = {
    vertices: placementRegion.vertices.map((point) => rotateAround(point, area.origin, -angle)),
  };
  const bounds = polygonBounds(alignedArea);
  input.progress?.({
    stage: "preparing-generation-grid",
    percent: 10,
    completed: 1,
    total: 1,
  });
  const stepX = table.widthMeters + area.columnSpacingMeters;
  const stepY = area.rowPitchMeters;
  const tables: GeneratedTable[] = [];
  const spatial = new Map<string, GeneratedTable[]>();
  const cellSize = Math.max(stepX, stepY, table.widthMeters, table.projectedDepthMeters, 0.001);
  const cell = (point: Point2) => ({
    x: Math.floor(point.x / cellSize),
    y: Math.floor(point.y / cellSize),
  });
  let rowIndex = 0;
  const started = performance.now();
  for (
    let localY = bounds.minimum.y;
    localY <= bounds.maximum.y && tables.length < area.maximumTableCount;
    localY += stepY
  ) {
    let columnIndex = 0;
    for (
      let localX = bounds.minimum.x;
      localX <= bounds.maximum.x && tables.length < area.maximumTableCount;
      localX += stepX
    ) {
      if (input.cancellation?.cancelled) return [];
      if (performance.now() - started > LAYOUT_LIMITS.maxProcessingMilliseconds)
        throw new Error("Layout generation exceeded the processing-time bound.");
      const baseX =
        area.generationDirection === "positive-x"
          ? localX
          : bounds.maximum.x - (localX - bounds.minimum.x);
      const center = rotateAround({ x: baseX, y: localY }, area.origin, angle);
      const footprint = rectangle(center, table.widthMeters, table.projectedDepthMeters, angle);
      const id = `table-${area.id}-${String(rowIndex).padStart(4, "0")}-${String(columnIndex).padStart(4, "0")}`;
      const terrainSamples = footprint.vertices
        .slice(0, 4)
        .map((point) => ({ point, elevation: input.terrainSampler?.(point).elevation }));
      const generated: GeneratedTable = {
        id,
        arrayAreaId: area.id,
        tableTypeId: table.id,
        moduleRecordId: table.moduleRecordId,
        moduleCount: table.moduleCount,
        dcPowerWatts: table.dcPowerWatts,
        footprint,
        center,
        azimuthDegrees: area.azimuthDegrees,
        tiltDegrees: table.tiltDegrees,
        rowIndex,
        columnIndex,
        terrainSamples,
        reviewStatus: "generated-review-required",
        findings: [],
        algorithmVersion: LAYOUT_ALGORITHM_VERSION,
        generationAssumptions: `pitch=${area.rowPitchMeters}m; spacing=${area.columnSpacingMeters}m; no hidden adjustment`,
        editHistory: [],
      };
      const location = cell(center);
      const nearby: GeneratedTable[] = [];
      for (let x = location.x - 1; x <= location.x + 1; x += 1)
        for (let y = location.y - 1; y <= location.y + 1; y += 1)
          nearby.push(...(spatial.get(`${x}|${y}`) ?? []));
      generated.findings = validateTable(
        generated,
        area,
        boundary,
        input.exclusions,
        input.terrainLimits,
        input.terrainSampler,
        nearby,
      );
      tables.push(generated);
      if (tables.length % 100 === 0)
        input.progress?.({
          stage: "generating-candidate-tables",
          percent: Math.min(55, 10 + Math.round((45 * tables.length) / area.maximumTableCount)),
          completed: tables.length,
          total: area.maximumTableCount,
        });
      const key = `${location.x}|${location.y}`;
      spatial.set(key, [...(spatial.get(key) ?? []), generated]);
      columnIndex += 1;
    }
    rowIndex += 1;
  }
  input.progress?.({
    stage: "evaluating-boundary-exclusions",
    percent: 60,
    completed: tables.length,
    total: tables.length,
  });
  input.progress?.({
    stage: "sampling-terrain",
    percent: 70,
    completed: tables.length,
    total: tables.length,
  });
  input.progress?.({
    stage: "evaluating-table-relationships",
    percent: 80,
    completed: tables.length,
    total: tables.length,
  });
  const validated = revalidateLayoutTables(
    tables,
    area,
    boundary,
    input.exclusions,
    input.terrainLimits,
    input.terrainSampler,
  );
  return validated;
}

export function revalidateLayoutTables(
  source: readonly GeneratedTable[],
  areaInput: ArrayArea | readonly ArrayArea[],
  boundary: ReviewedPolygon,
  exclusions: readonly ExclusionZone[],
  terrainLimits: TerrainLimits,
  terrainSampler?: TerrainSampler,
) {
  const areas = Array.isArray(areaInput) ? areaInput : [areaInput];
  const areaById = new Map(areas.map((area) => [area.id, area]));
  const maximumSpacing = areas.reduce(
    (maximum, area) => Math.max(maximum, area.minimumTableSpacingMeters),
    0,
  );
  const active = source.filter((table) => table.reviewStatus !== "excluded");
  const maximumExtent = active.reduce((maximum, table) => {
    const bounds = polygonBounds(table.footprint);
    return Math.max(
      maximum,
      bounds.maximum.x - bounds.minimum.x,
      bounds.maximum.y - bounds.minimum.y,
    );
  }, 1);
  const cellSize = Math.max(maximumExtent + maximumSpacing, 0.001);
  const buckets = new Map<string, GeneratedTable[]>();
  for (const table of active) {
    const bounds = polygonBounds(table.footprint);
    const fromX = Math.floor((bounds.minimum.x - maximumSpacing) / cellSize);
    const toX = Math.floor((bounds.maximum.x + maximumSpacing) / cellSize);
    const fromY = Math.floor((bounds.minimum.y - maximumSpacing) / cellSize);
    const toY = Math.floor((bounds.maximum.y + maximumSpacing) / cellSize);
    for (let x = fromX; x <= toX; x += 1)
      for (let y = fromY; y <= toY; y += 1) {
        const key = `${x}|${y}`;
        buckets.set(key, [...(buckets.get(key) ?? []), table]);
      }
  }
  const validated = source.map((table) => {
    const area = areaById.get(table.arrayAreaId);
    if (!area) throw new Error(`Table ${table.id} references an unknown array area.`);
    const bounds = polygonBounds(table.footprint);
    const candidates = new Map<string, GeneratedTable>();
    const fromX = Math.floor((bounds.minimum.x - maximumSpacing) / cellSize);
    const toX = Math.floor((bounds.maximum.x + maximumSpacing) / cellSize);
    const fromY = Math.floor((bounds.minimum.y - maximumSpacing) / cellSize);
    const toY = Math.floor((bounds.maximum.y + maximumSpacing) / cellSize);
    for (let x = fromX; x <= toX; x += 1)
      for (let y = fromY; y <= toY; y += 1)
        for (const candidate of buckets.get(`${x}|${y}`) ?? [])
          if (candidate.id !== table.id) candidates.set(candidate.id, candidate);
    return {
      ...table,
      findings: validateTable(
        table,
        area,
        boundary,
        exclusions,
        terrainLimits,
        terrainSampler,
        [...candidates.values()].sort((left, right) => left.id.localeCompare(right.id)),
      ),
    };
  });
  if (terrainLimits.maximumRowElevationChangeMeters === undefined) return validated;
  const rows = new Map<string, GeneratedTable[]>();
  validated
    .filter((table) => table.reviewStatus !== "excluded")
    .forEach((table) => {
      const key = `${table.arrayAreaId}|${table.rowIndex}`;
      rows.set(key, [...(rows.get(key) ?? []), table]);
    });
  for (const [rowKey, rowTables] of rows) {
    rowTables.sort(
      (left, right) => left.columnIndex - right.columnIndex || left.id.localeCompare(right.id),
    );
    const samples = rowTables.map((table) => terrainSampler?.(table.center).elevation);
    const complete = samples.every(
      (elevation): elevation is number => elevation !== undefined && Number.isFinite(elevation),
    );
    const variation = complete ? Math.max(...samples) - Math.min(...samples) : undefined;
    for (const rowTable of rowTables) {
      const target = validated.find((table) => table.id === rowTable.id);
      if (!target) continue;
      target.findings.push({
        code: "ROW_ELEVATION_VARIATION",
        status:
          variation === undefined
            ? "not-evaluated"
            : variation <= terrainLimits.maximumRowElevationChangeMeters
              ? "pass"
              : "fail",
        affectedObjectId: rowTable.id,
        explanation:
          variation === undefined
            ? `Row ${rowKey} has incomplete centre-point terrain coverage.`
            : `Row ${rowKey} centre-elevation range across ${rowTables.map((table) => table.id).join(", ")}.`,
        inputs: "interpolated centre elevations for non-excluded tables in generated row",
        unit: "m",
        limit: terrainLimits.maximumRowElevationChangeMeters,
        calculatedValue: variation,
        margin:
          variation === undefined
            ? undefined
            : terrainLimits.maximumRowElevationChangeMeters - variation,
        assumptionSource: "engineer-entered",
        ruleVersion: LAYOUT_RULE_VERSION,
      });
      target.findings.sort(
        (left, right) =>
          left.code.localeCompare(right.code) ||
          left.affectedObjectId.localeCompare(right.affectedObjectId),
      );
    }
  }
  return validated;
}

export function validateTable(
  table: GeneratedTable,
  area: ArrayArea,
  boundary: ReviewedPolygon,
  exclusions: readonly ExclusionZone[],
  terrainLimits: TerrainLimits,
  terrainSampler: TerrainSampler | undefined,
  otherTables: readonly GeneratedTable[],
): LayoutFinding[] {
  const findings: LayoutFinding[] = [];
  const add = (
    code: string,
    status: LayoutFinding["status"],
    explanation: string,
    extra: Partial<LayoutFinding> = {},
  ) =>
    findings.push({
      code,
      status,
      affectedObjectId: table.id,
      explanation,
      inputs: "reviewed geometry and engineer-entered limits",
      assumptionSource: "derived-geometry",
      ruleVersion: LAYOUT_RULE_VERSION,
      ...extra,
    });
  const insideBoundary = polygonContained(boundary.geometry, table.footprint);
  add(
    "SITE_BOUNDARY",
    insideBoundary ? "pass" : "fail",
    insideBoundary
      ? "Table lies inside the active boundary."
      : "Table extends outside the active boundary.",
  );
  const insideArea = area.effectivePlacementRegions.some((region) =>
    polygonContained(region, table.footprint),
  );
  add(
    "ARRAY_AREA",
    insideArea ? "pass" : "fail",
    insideArea ? "Table lies inside its array area." : "Table extends outside its array area.",
  );
  const exclusion = exclusions.find((zone) =>
    polygonsIntersect(table.footprint, zone.effectiveGeometry),
  );
  add(
    "EXCLUSION",
    exclusion ? "fail" : "pass",
    exclusion
      ? `Table intersects reviewed exclusion ${exclusion.id}.`
      : "No reviewed exclusion intersection.",
  );
  const overlap = otherTables.find((other) => polygonsIntersect(table.footprint, other.footprint));
  add(
    "TABLE_OVERLAP",
    overlap ? "fail" : "pass",
    overlap ? `Table overlaps ${overlap.id}.` : "No table overlap.",
  );
  const nearest = otherTables
    .filter((other) => other.reviewStatus !== "excluded")
    .map((other) => ({
      other,
      distance: polygonMinimumDistance(table.footprint, other.footprint),
    }))
    .sort(
      (left, right) =>
        left.distance - right.distance || left.other.id.localeCompare(right.other.id),
    )[0];
  if (nearest) {
    const limit = area.minimumTableSpacingMeters;
    add(
      "MINIMUM_TABLE_SPACING",
      nearest.distance + 1e-9 >= limit ? "pass" : "fail",
      nearest.distance + 1e-9 >= limit
        ? `Nearest table ${nearest.other.id} meets the footprint edge-spacing limit.`
        : `Nearest table ${nearest.other.id} is below the footprint edge-spacing limit.`,
      {
        unit: "m",
        limit,
        calculatedValue: nearest.distance,
        margin: nearest.distance - limit,
        assumptionSource: "engineer-entered",
      },
    );
  } else add("MINIMUM_TABLE_SPACING", "not-evaluated", "No neighboring table is available.");
  if (!terrainSampler) add("TERRAIN_COVERAGE", "not-evaluated", "Terrain sampling is unavailable.");
  else {
    const samples = table.footprint.vertices.slice(0, 4).map((point) => terrainSampler(point));
    const elevations = samples
      .map((sample) => sample.elevation)
      .filter((value): value is number => value !== undefined && Number.isFinite(value));
    if (elevations.length < 4)
      add("TERRAIN_COVERAGE", "not-evaluated", "Terrain coverage is incomplete at table corners.");
    else {
      add("TERRAIN_COVERAGE", "pass", "Terrain elevations are available at table corners.");
      if (terrainLimits.minimumNoDataDistanceMeters !== undefined) {
        const distances = samples
          .map((sample) => sample.distanceToNoDataMeters)
          .filter((value): value is number => value !== undefined && Number.isFinite(value));
        if (distances.length < 4)
          add(
            "NO_DATA_DISTANCE",
            "not-evaluated",
            "Reliable terrain no-data boundary topology is unavailable.",
          );
        else {
          const calculated = Math.min(...distances);
          const limit = terrainLimits.minimumNoDataDistanceMeters;
          add(
            "NO_DATA_DISTANCE",
            calculated + 1e-9 >= limit ? "pass" : "fail",
            "Minimum footprint-corner distance to the validated terrain coverage boundary.",
            {
              unit: "m",
              limit,
              calculatedValue: calculated,
              margin: calculated - limit,
              assumptionSource: "engineer-entered",
            },
          );
        }
      }
      if (terrainLimits.maximumCrossTableElevationDifferenceMeters !== undefined) {
        const difference = Math.max(...elevations) - Math.min(...elevations);
        const limit = terrainLimits.maximumCrossTableElevationDifferenceMeters;
        add(
          "CROSS_TABLE_ELEVATION",
          difference <= limit ? "pass" : "fail",
          "Cross-table elevation range compared with engineer-entered limit.",
          {
            unit: "m",
            limit,
            calculatedValue: difference,
            margin: limit - difference,
            assumptionSource: "engineer-entered",
          },
        );
      }
      if (terrainLimits.maximumSlopeDegrees !== undefined) {
        const slopes = samples
          .map((sample) => sample.slopeDegrees)
          .filter((value): value is number => value !== undefined && Number.isFinite(value));
        if (!slopes.length)
          add("TERRAIN_SLOPE", "not-evaluated", "Terrain slope samples are unavailable.");
        else {
          const slope = Math.max(...slopes);
          const limit = terrainLimits.maximumSlopeDegrees;
          add(
            "TERRAIN_SLOPE",
            slope <= limit ? "pass" : "fail",
            "Maximum sampled slope compared with engineer-entered limit.",
            {
              unit: "deg",
              limit,
              calculatedValue: slope,
              margin: limit - slope,
              assumptionSource: "engineer-entered",
            },
          );
        }
      }
    }
  }
  return findings;
}

export function editTable(
  table: GeneratedTable,
  action:
    | { type: "move"; center: Point2 }
    | { type: "rotate"; azimuthDegrees: number }
    | { type: "exclude" }
    | { type: "restore" },
): GeneratedTable {
  const copy = structuredClone(table);
  if (action.type === "move") {
    if (!finitePoint(action.center))
      throw new Error("Edited table coordinates must be finite and bounded.");
    const dx = action.center.x - copy.center.x;
    const dy = action.center.y - copy.center.y;
    copy.center = { ...action.center };
    copy.footprint.vertices = copy.footprint.vertices.map((point) => ({
      x: point.x + dx,
      y: point.y + dy,
    }));
  } else if (action.type === "rotate") {
    if (
      !Number.isFinite(action.azimuthDegrees) ||
      action.azimuthDegrees < 0 ||
      action.azimuthDegrees >= 360
    )
      throw new Error("Edited azimuth must be 0–<360°.");
    const delta = ((action.azimuthDegrees - copy.azimuthDegrees) * Math.PI) / 180;
    copy.footprint.vertices = copy.footprint.vertices.map((point) =>
      rotateAround(point, copy.center, delta),
    );
    copy.azimuthDegrees = action.azimuthDegrees;
  } else copy.reviewStatus = action.type === "exclude" ? "excluded" : "unresolved";
  copy.editHistory.push({
    sequence: copy.editHistory.length + 1,
    action: action.type,
    detail:
      action.type === "move"
        ? `${action.center.x},${action.center.y}`
        : action.type === "rotate"
          ? `${action.azimuthDegrees}deg`
          : action.type,
  });
  if (copy.editHistory.length > LAYOUT_LIMITS.maxEditHistory)
    throw new Error("Manual edit history limit exceeded.");
  return copy;
}

export function layoutStatistics(
  boundary: ReviewedPolygon,
  exclusions: readonly ExclusionZone[],
  areas: readonly ArrayArea[],
  tables: readonly GeneratedTable[],
): LayoutStatistics {
  const active = tables.filter((table) => table.reviewStatus !== "excluded");
  const footprintArea = active.reduce((sum, table) => sum + polygonArea(table.footprint), 0);
  const areaTotal = areas.reduce((sum, area) => sum + area.areaSquareMeters, 0);
  const statuses = ["pass", "fail", "warning", "not-evaluated"] as const;
  return {
    siteAreaSquareMeters: boundary.areaSquareMeters,
    siteAreaHectares: boundary.areaSquareMeters / 10_000,
    usableArrayAreaSquareMeters: areaTotal,
    exclusionAreaSquareMeters: exclusions.reduce(
      (sum, exclusion) => sum + exclusion.areaSquareMeters,
      0,
    ),
    generatedTableCount: tables.length,
    acceptedTableCount: tables.filter(
      (table) =>
        table.reviewStatus === "reviewed" ||
        table.reviewStatus === "approved-for-preliminary-draflio-workflow",
    ).length,
    excludedTableCount: tables.filter((table) => table.reviewStatus === "excluded").length,
    unresolvedTableCount: tables.filter(
      (table) =>
        table.reviewStatus === "generated-review-required" || table.reviewStatus === "unresolved",
    ).length,
    moduleCount: active.reduce((sum, table) => sum + table.moduleCount, 0),
    dcCapacityWatts: active.reduce((sum, table) => sum + table.dcPowerWatts, 0),
    groundCoverageRatio: areaTotal > 0 ? footprintArea / areaTotal : 0,
    groundCoverageMethod:
      "sum of non-excluded table projected footprints / declared array-area total",
    terrainCoverageFraction:
      tables.length > 0
        ? tables.filter((table) =>
            table.findings.some(
              (finding) => finding.code === "TERRAIN_COVERAGE" && finding.status === "pass",
            ),
          ).length / tables.length
        : undefined,
    findingCounts: Object.fromEntries(
      statuses.map((status) => [
        status,
        tables.flatMap((table) => table.findings).filter((finding) => finding.status === status)
          .length,
      ]),
    ) as Record<(typeof statuses)[number], number>,
  };
}

export function inputReadiness(input: {
  terrain?: DraflioScene;
  drawing?: DraflioScene;
  module?: PvModuleRecord;
  registration?: RegistrationResult;
  boundary?: ReviewedPolygon;
  exclusions: readonly ExclusionZone[];
  table?: TableDefinition;
  areas: readonly ArrayArea[];
  tables: readonly GeneratedTable[];
}): Record<string, Readiness> {
  return {
    Terrain: input.terrain ? "ready" : "missing",
    Drawing: input.drawing ? "ready" : "missing",
    Module:
      input.module?.reviewStatus === "approved-for-current-project"
        ? "ready"
        : input.module
          ? "invalid"
          : "missing",
    Inverter: "not-applicable",
    "Coordinate registration":
      input.registration?.active && input.registration.confirmed
        ? input.registration.warnings.length
          ? "warning"
          : "ready"
        : "missing",
    "Site boundary": input.boundary ? "ready" : "missing",
    "Exclusion zones": input.exclusions.length ? "ready" : "not-applicable",
    "Mounting assumptions": input.table ? "ready" : "missing",
    "Array areas": input.areas.length ? "ready" : "missing",
    "Layout review": input.tables.length ? "warning" : "missing",
  };
}

function polygonBounds(polygon: Polygon2) {
  return {
    minimum: {
      x: Math.min(...polygon.vertices.map((point) => point.x)),
      y: Math.min(...polygon.vertices.map((point) => point.y)),
    },
    maximum: {
      x: Math.max(...polygon.vertices.map((point) => point.x)),
      y: Math.max(...polygon.vertices.map((point) => point.y)),
    },
  };
}
function rotateAround(point: Point2, origin: Point2, angle: number): Point2 {
  const x = point.x - origin.x;
  const y = point.y - origin.y;
  return {
    x: roundStable(origin.x + Math.cos(angle) * x - Math.sin(angle) * y),
    y: roundStable(origin.y + Math.sin(angle) * x + Math.cos(angle) * y),
  };
}
function rectangle(center: Point2, width: number, depth: number, angle: number): Polygon2 {
  const corners = [
    { x: center.x - width / 2, y: center.y - depth / 2 },
    { x: center.x + width / 2, y: center.y - depth / 2 },
    { x: center.x + width / 2, y: center.y + depth / 2 },
    { x: center.x - width / 2, y: center.y + depth / 2 },
  ].map((point) => rotateAround(point, center, angle));
  return { vertices: [...corners, { ...corners[0] }] };
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    Object.values(value).forEach((child) => {
      if (child && typeof child === "object" && !Object.isFrozen(child)) deepFreeze(child);
    });
  }
  return value;
}
