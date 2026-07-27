import type { DrawingPoint } from "./drawingTypes";

export type DrawingCameraView = "top" | "isometric";
export type DrawingCameraState = {
  target: { x: number; y: number; z: number };
  position: { x: number; y: number; z: number };
  near: number;
  far: number;
  distance: number;
};

export function createDrawingCameraState(
  points: readonly DrawingPoint[],
  view: DrawingCameraView,
  aspect: number,
): DrawingCameraState {
  const finite = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const minX = finite.length ? Math.min(...finite.map((point) => point.x)) : 0;
  const maxX = finite.length ? Math.max(...finite.map((point) => point.x)) : 0;
  const minY = finite.length ? Math.min(...finite.map((point) => point.y)) : 0;
  const maxY = finite.length ? Math.max(...finite.map((point) => point.y)) : 0;
  const width = Math.max(maxX - minX, 1);
  const depth = Math.max(maxY - minY, 1);
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const fitSpan = Math.max(depth, width / safeAspect, 1);
  const distance = fitSpan * 1.8;
  const target = { x: (minX + maxX) / 2, y: 0, z: -(minY + maxY) / 2 };
  return {
    target,
    position:
      view === "top"
        ? { x: target.x, y: distance, z: target.z + 0.001 }
        : { x: target.x + distance, y: distance * 0.8, z: target.z + distance },
    near: Math.max(distance / 10_000, 0.01),
    far: Math.max(distance * 100, 100),
    distance,
  };
}
