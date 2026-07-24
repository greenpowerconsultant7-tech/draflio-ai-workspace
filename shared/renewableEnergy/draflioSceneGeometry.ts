import type { Bounds3, SceneGeometry, Vector3 } from "./draflioSceneTypes";

const zero = (value: number) => (Object.is(value, -0) ? 0 : value);
export const normalizeVector = (v: Vector3): Vector3 => ({
  x: zero(v.x),
  y: zero(v.y),
  z: zero(v.z),
});
export const createDefaultTransform = () => ({
  translation: { x: 0, y: 0, z: 0 },
  rotationDegrees: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
});

function fromPoints(points: readonly Vector3[]): Bounds3 | undefined {
  if (points.length === 0 || points.some((p) => ![p.x, p.y, p.z].every(Number.isFinite)))
    return undefined;
  return {
    minimum: {
      x: Math.min(...points.map((p) => p.x)),
      y: Math.min(...points.map((p) => p.y)),
      z: Math.min(...points.map((p) => p.z)),
    },
    maximum: {
      x: Math.max(...points.map((p) => p.x)),
      y: Math.max(...points.map((p) => p.y)),
      z: Math.max(...points.map((p) => p.z)),
    },
  };
}

export function calculateGeometryBounds(geometry: SceneGeometry): Bounds3 | undefined {
  if (geometry.type === "point") return fromPoints([geometry.position]);
  if (geometry.type === "polyline") return fromPoints(geometry.points);
  if (geometry.type === "polygon")
    return fromPoints([geometry.outerRing, ...geometry.holes].flat());
  if (geometry.type === "mesh") return fromPoints(geometry.vertices);
  if (geometry.type === "box")
    return {
      minimum: { x: -geometry.width / 2, y: -geometry.depth / 2, z: 0 },
      maximum: { x: geometry.width / 2, y: geometry.depth / 2, z: geometry.height },
    };
  const half = {
    x: geometry.dimensions.width / 2,
    y: geometry.dimensions.depth / 2,
    z: geometry.dimensions.height / 2,
  };
  const radians = {
    x: (geometry.rotationDegrees.x * Math.PI) / 180,
    y: (geometry.rotationDegrees.y * Math.PI) / 180,
    z: (geometry.rotationDegrees.z * Math.PI) / 180,
  };
  const cx = Math.abs(Math.cos(radians.x)),
    sx = Math.abs(Math.sin(radians.x));
  const cy = Math.abs(Math.cos(radians.y)),
    sy = Math.abs(Math.sin(radians.y));
  const cz = Math.abs(Math.cos(radians.z)),
    sz = Math.abs(Math.sin(radians.z));
  const extent = {
    x: cy * cz * half.x + (sx * sy * cz + cx * sz) * half.y + (cx * sy * cz + sx * sz) * half.z,
    y: cy * sz * half.x + (sx * sy * sz + cx * cz) * half.y + (cx * sy * sz + sx * cz) * half.z,
    z: sy * half.x + sx * cy * half.y + cx * cy * half.z,
  };
  return {
    minimum: {
      x: geometry.center.x - extent.x,
      y: geometry.center.y - extent.y,
      z: geometry.center.z - extent.z,
    },
    maximum: {
      x: geometry.center.x + extent.x,
      y: geometry.center.y + extent.y,
      z: geometry.center.z + extent.z,
    },
  };
}
