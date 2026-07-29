import type { Point2 } from "../layout/layoutTypes";

export const SHADING_2D_TRANSFORM_VERSION = "re7a-project-screen-transform-1.0" as const;
// 0.05 micrometres absolute, covering extreme-aspect centring at the 1e8 m coordinate bound.
export const SHADING_2D_TOLERANCE = 5e-8;
// Covers 100 repeated IEEE-754 forward/inverse operations at the declared 1e8 m coordinate bound.
export const SHADING_2D_RELATIVE_TOLERANCE = 5e-14;
export const SHADING_2D_HIT_SCREEN_RADIUS_PIXELS = 10;
export const SHADING_2D_HIT_DISTANCE_TOLERANCE_METERS = 1e-10;
export type Shading2DTransform = {
  projectMinimum: Point2;
  projectWidth: number;
  projectHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  scale: number;
  offset: Point2;
  version: typeof SHADING_2D_TRANSFORM_VERSION;
};

const finitePositive = (value: number, label: string) => {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${label} must be positive and finite.`);
  return value;
};

export function createShading2DTransform(
  projectMinimum: Point2,
  projectWidth: number,
  projectHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): Shading2DTransform {
  if (!Number.isFinite(projectMinimum.x) || !Number.isFinite(projectMinimum.y))
    throw new Error("Project transform origin must be finite.");
  const safeProjectWidth = Math.max(finitePositive(projectWidth, "Project width"), 0.01);
  const safeProjectHeight = Math.max(finitePositive(projectHeight, "Project height"), 0.01);
  const safeViewportWidth = finitePositive(viewportWidth, "Viewport width");
  const safeViewportHeight = finitePositive(viewportHeight, "Viewport height");
  const scale = Math.min(
    safeViewportWidth / safeProjectWidth,
    safeViewportHeight / safeProjectHeight,
  );
  return {
    projectMinimum,
    projectWidth: safeProjectWidth,
    projectHeight: safeProjectHeight,
    viewportWidth: safeViewportWidth,
    viewportHeight: safeViewportHeight,
    scale,
    offset: {
      x: (safeViewportWidth - safeProjectWidth * scale) / 2,
      y: (safeViewportHeight - safeProjectHeight * scale) / 2,
    },
    version: SHADING_2D_TRANSFORM_VERSION,
  };
}

export function projectToScreen(point: Point2, transform: Shading2DTransform): Point2 {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
    throw new Error("Project point must be finite.");
  return {
    x: transform.offset.x + (point.x - transform.projectMinimum.x) * transform.scale,
    y: transform.offset.y + (point.y - transform.projectMinimum.y) * transform.scale,
  };
}

export function screenToProject(point: Point2, transform: Shading2DTransform): Point2 {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || transform.scale <= 0)
    throw new Error("Screen point or transform is not invertible.");
  return {
    x: transform.projectMinimum.x + (point.x - transform.offset.x) / transform.scale,
    y: transform.projectMinimum.y + (point.y - transform.offset.y) / transform.scale,
  };
}

export function withinShading2DTolerance(actual: number, expected: number) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  return Math.abs(actual - expected) <= permittedShading2DError(actual, expected);
}

export function permittedShading2DError(actual: number, expected: number) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected))
    throw new Error("Transform comparison inputs must be finite.");
  return (
    SHADING_2D_TOLERANCE +
    SHADING_2D_RELATIVE_TOLERANCE * Math.max(Math.abs(actual), Math.abs(expected))
  );
}

export function projectHitRadius(
  scale: number,
  visualPixels = SHADING_2D_HIT_SCREEN_RADIUS_PIXELS,
  minimumProjectRadius = 0.01,
  maximumProjectRadius = 10,
) {
  if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(visualPixels) || visualPixels <= 0)
    throw new Error("Hit-test scale and visual radius must be positive and finite.");
  return Math.min(maximumProjectRadius, Math.max(minimumProjectRadius, visualPixels / scale));
}

export function hitTestPoints(
  point: Point2,
  radius: number,
  records: readonly { id: string; precedence: number; point: Point2 }[],
) {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(radius) ||
    radius < 0
  )
    throw new Error("Point hit-test inputs must be finite and radius non-negative.");
  return [...records]
    .sort((a, b) => {
      if (a.precedence !== b.precedence) return a.precedence - b.precedence;
      const distanceA = Math.hypot(point.x - a.point.x, point.y - a.point.y);
      const distanceB = Math.hypot(point.x - b.point.x, point.y - b.point.y);
      return Math.abs(distanceA - distanceB) <= SHADING_2D_HIT_DISTANCE_TOLERANCE_METERS
        ? a.id.localeCompare(b.id)
        : distanceA - distanceB;
    })
    .find((record) => Math.hypot(point.x - record.point.x, point.y - record.point.y) <= radius)?.id;
}

export function pointInPolygon(point: Point2, polygon: readonly Point2[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index],
      b = polygon[previous];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x <= ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

export function hitTestPolygons(
  point: Point2,
  records: readonly { id: string; precedence: number; polygon: readonly Point2[] }[],
) {
  return [...records]
    .sort((a, b) => a.precedence - b.precedence || a.id.localeCompare(b.id))
    .find((record) => pointInPolygon(point, record.polygon))?.id;
}
