import type { RedactionRectanglePayload } from "@/lib/redactionSessionClient";

export interface EditorRectangle extends RedactionRectanglePayload {
  id: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface DisplayRectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type ResizeCorner = "north-west" | "north-east" | "south-west" | "south-east";

export const MAXIMUM_REDACTION_RECTANGLES = 100;
export const MINIMUM_RECTANGLE_PIXELS = 6;

export function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function displayPointToNormalized(point: Point, width: number, height: number): Point {
  return { x: clamp(point.x / width), y: clamp(point.y / height) };
}

export function drawNormalizedRectangle(
  start: Point,
  end: Point,
  pageIndex: number,
): EditorRectangle {
  const left = clamp(Math.min(start.x, end.x));
  const top = clamp(Math.min(start.y, end.y));
  const right = clamp(Math.max(start.x, end.x));
  const bottom = clamp(Math.max(start.y, end.y));
  return {
    id: crypto.randomUUID(),
    pageIndex,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function normalizedToDisplay(
  rectangle: RedactionRectanglePayload,
  width: number,
  height: number,
): DisplayRectangle {
  return {
    left: rectangle.x * width,
    top: rectangle.y * height,
    width: rectangle.width * width,
    height: rectangle.height * height,
  };
}

export function isLargeEnough(
  rectangle: RedactionRectanglePayload,
  width: number,
  height: number,
): boolean {
  return (
    rectangle.width * width >= MINIMUM_RECTANGLE_PIXELS &&
    rectangle.height * height >= MINIMUM_RECTANGLE_PIXELS
  );
}

export function moveRectangle(rectangle: EditorRectangle, delta: Point): EditorRectangle {
  return {
    ...rectangle,
    x: clamp(rectangle.x + delta.x, 0, 1 - rectangle.width),
    y: clamp(rectangle.y + delta.y, 0, 1 - rectangle.height),
  };
}

export function resizeRectangle(
  rectangle: EditorRectangle,
  corner: ResizeCorner,
  point: Point,
  minimumWidth: number,
  minimumHeight: number,
): EditorRectangle {
  const right = rectangle.x + rectangle.width;
  const bottom = rectangle.y + rectangle.height;
  const west = corner.endsWith("west");
  const north = corner.startsWith("north");
  const x = west ? clamp(point.x, 0, right - minimumWidth) : rectangle.x;
  const y = north ? clamp(point.y, 0, bottom - minimumHeight) : rectangle.y;
  const nextRight = west ? right : clamp(point.x, rectangle.x + minimumWidth, 1);
  const nextBottom = north ? bottom : clamp(point.y, rectangle.y + minimumHeight, 1);
  return { ...rectangle, x, y, width: nextRight - x, height: nextBottom - y };
}

export function withoutEditorId(rectangle: EditorRectangle): RedactionRectanglePayload {
  return {
    pageIndex: rectangle.pageIndex,
    x: rectangle.x,
    y: rectangle.y,
    width: rectangle.width,
    height: rectangle.height,
  };
}

export function pageAspectRatioMatches(
  local: { width: number; height: number },
  server: { width: number; height: number },
  tolerance = 0.005,
): boolean {
  return Math.abs(local.width / local.height - server.width / server.height) <= tolerance;
}
