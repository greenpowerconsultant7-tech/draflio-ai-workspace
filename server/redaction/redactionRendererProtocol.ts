/// <reference types="node" />

import type {
  NormalizedRedactionRectangle,
  RasterRedactionMetrics,
  RedactionProgress,
} from "./redactionTypes.js";

export const REDACTION_RENDERER_ENVIRONMENT_KEYS = [
  "NODE_ENV",
  "SYSTEMROOT",
  "WINDIR",
  "TEMP",
  "TMP",
  "TZ",
  "LANG",
] as const;

export interface RendererDocumentExpectation {
  pageCount: number;
  pageDimensions: Array<{ width: number; height: number }>;
}

export interface RendererRequestMessage {
  kind: "render";
  requestId: string;
  pdfBytes: Uint8Array;
  dpi: number;
  rectangles: NormalizedRedactionRectangle[];
  expected: RendererDocumentExpectation;
}

export interface RendererCancelMessage {
  kind: "cancel";
  requestId: string;
}

export type RendererParentMessage = RendererRequestMessage | RendererCancelMessage;

export interface RendererReadyMessage {
  kind: "ready";
}

export interface RendererProgressMessage {
  kind: "progress";
  requestId: string;
  progress: RedactionProgress;
}

export interface RendererCompletedMessage {
  kind: "completed";
  requestId: string;
  outputBytes: Uint8Array;
  metrics: RasterRedactionMetrics & { environmentKeys: string[] };
}

export type RendererFailureCode =
  "INVALID_IPC_MESSAGE" | "RENDERER_PROCESSING_FAILED" | "EXPECTED_DOCUMENT_MISMATCH";

export interface RendererFailedMessage {
  kind: "failed";
  requestId?: string;
  code: RendererFailureCode;
}

export interface RendererCancelledMessage {
  kind: "cancelled";
  requestId: string;
}

export type RendererChildMessage =
  | RendererReadyMessage
  | RendererProgressMessage
  | RendererCompletedMessage
  | RendererFailedMessage
  | RendererCancelledMessage;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const progressStages = new Set([
  "validating",
  "rasterizing",
  "applying-redactions",
  "rebuilding",
  "verifying",
  "completed",
  "failed",
  "cancelled",
]);
const failureCodes = new Set<RendererFailureCode>([
  "INVALID_IPC_MESSAGE",
  "RENDERER_PROCESSING_FAILED",
  "EXPECTED_DOCUMENT_MISMATCH",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRequestId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isBinary(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

function isDimension(value: unknown): value is { width: number; height: number } {
  return (
    isRecord(value) &&
    isFiniteNumber(value.width) &&
    value.width > 0 &&
    isFiniteNumber(value.height) &&
    value.height > 0
  );
}

function isRectangle(value: unknown): value is NormalizedRedactionRectangle {
  return (
    isRecord(value) &&
    Number.isInteger(value.pageIndex) &&
    isFiniteNumber(value.pageIndex) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height)
  );
}

export function isRedactionProgress(value: unknown): value is RedactionProgress {
  if (!isRecord(value) || typeof value.stage !== "string" || !progressStages.has(value.stage)) {
    return false;
  }
  const hasCompleted = value.completedPages !== undefined;
  const hasTotal = value.totalPages !== undefined;
  return (
    hasCompleted === hasTotal &&
    (!hasCompleted ||
      (Number.isInteger(value.completedPages) &&
        isFiniteNumber(value.completedPages) &&
        value.completedPages >= 0 &&
        Number.isInteger(value.totalPages) &&
        isFiniteNumber(value.totalPages) &&
        value.totalPages > 0 &&
        value.completedPages <= value.totalPages))
  );
}

export function isRendererParentMessage(value: unknown): value is RendererParentMessage {
  if (!isRecord(value) || !isRequestId(value.requestId)) {
    return false;
  }
  if (value.kind === "cancel") {
    return Object.keys(value).every((key) => key === "kind" || key === "requestId");
  }
  if (value.kind !== "render") {
    return false;
  }
  return (
    isBinary(value.pdfBytes) &&
    isFiniteNumber(value.dpi) &&
    Array.isArray(value.rectangles) &&
    value.rectangles.every(isRectangle) &&
    isRecord(value.expected) &&
    Number.isInteger(value.expected.pageCount) &&
    isFiniteNumber(value.expected.pageCount) &&
    value.expected.pageCount > 0 &&
    Array.isArray(value.expected.pageDimensions) &&
    value.expected.pageDimensions.length === value.expected.pageCount &&
    value.expected.pageDimensions.every(isDimension)
  );
}

function isMetrics(value: unknown): value is RendererCompletedMessage["metrics"] {
  return (
    isRecord(value) &&
    Number.isInteger(value.pageCount) &&
    isFiniteNumber(value.pageCount) &&
    value.pageCount > 0 &&
    Number.isInteger(value.totalPixels) &&
    isFiniteNumber(value.totalPixels) &&
    value.totalPixels > 0 &&
    Number.isInteger(value.outputBytes) &&
    isFiniteNumber(value.outputBytes) &&
    value.outputBytes > 0 &&
    Number.isInteger(value.processingMilliseconds) &&
    isFiniteNumber(value.processingMilliseconds) &&
    value.processingMilliseconds >= 0 &&
    Array.isArray(value.environmentKeys) &&
    value.environmentKeys.every((key) => typeof key === "string")
  );
}

export function isRendererChildMessage(value: unknown): value is RendererChildMessage {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }
  if (value.kind === "ready") {
    return Object.keys(value).length === 1;
  }
  if (value.kind === "failed") {
    return (
      (value.requestId === undefined || isRequestId(value.requestId)) &&
      typeof value.code === "string" &&
      failureCodes.has(value.code as RendererFailureCode)
    );
  }
  if (!isRequestId(value.requestId)) {
    return false;
  }
  if (value.kind === "cancelled") {
    return true;
  }
  if (value.kind === "progress") {
    return isRedactionProgress(value.progress);
  }
  if (value.kind === "completed") {
    return isBinary(value.outputBytes) && isMetrics(value.metrics);
  }
  return false;
}
