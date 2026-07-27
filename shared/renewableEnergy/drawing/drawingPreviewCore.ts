import type { DrawingPoint } from "./drawingTypes";

export function pagePointToOverlay(
  point: DrawingPoint,
  page: { width: number; height: number },
): DrawingPoint {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(page.width) ||
    !Number.isFinite(page.height) ||
    page.width <= 0 ||
    page.height <= 0
  )
    throw new Error("Preview alignment input is invalid.");
  return { x: point.x, y: point.y };
}

export function overlayPointToPixels(
  point: DrawingPoint,
  page: { width: number; height: number },
  rendered: { width: number; height: number },
): DrawingPoint {
  if (rendered.width <= 0 || rendered.height <= 0) throw new Error("Rendered size is invalid.");
  return {
    x: (point.x / page.width) * rendered.width,
    y: (point.y / page.height) * rendered.height,
  };
}
