/// <reference types="node" />

import type { DocumentIntelligenceContext } from "./documentIntelligenceTypes.js";

export const DOCUMENT_INTELLIGENCE_ENVIRONMENT_KEYS = [
  "NODE_ENV",
  "SYSTEMROOT",
  "WINDIR",
  "TEMP",
  "TMP",
  "TZ",
  "LANG",
] as const;

export type ExtractionRequest = {
  kind: "extract";
  requestId: string;
  pdfBytes: Uint8Array;
};
export type ExtractionCancel = { kind: "cancel"; requestId: string };
export type ExtractionParentMessage = ExtractionRequest | ExtractionCancel;

export type ExtractionChildMessage =
  | { kind: "ready" }
  | {
      kind: "progress";
      requestId: string;
      completed: number;
      total: number;
    }
  | {
      kind: "completed";
      requestId: string;
      context: DocumentIntelligenceContext;
      environmentKeys: string[];
    }
  | { kind: "cancelled"; requestId: string }
  | {
      kind: "failed";
      requestId?: string;
      code:
        | "INVALID_IPC_MESSAGE"
        | "DOCUMENT_INTELLIGENCE_PAGE_LIMIT"
        | "DOCUMENT_INTELLIGENCE_COMPLEXITY_LIMIT"
        | "DOCUMENT_INTELLIGENCE_ENCRYPTED_PDF"
        | "DOCUMENT_INTELLIGENCE_EXTRACTION_FAILED";
    };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRequestId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isContext(value: unknown): value is DocumentIntelligenceContext {
  const classifications = [
    "native-vector-searchable",
    "searchable-low-vector",
    "mixed-content",
    "image-only",
    "empty-or-unsupported",
  ];
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["classification", "pageDimensions", "pages", "chunks"]) ||
    typeof value.classification !== "string" ||
    !classifications.includes(value.classification) ||
    !Array.isArray(value.pageDimensions) ||
    !Array.isArray(value.pages) ||
    !Array.isArray(value.chunks)
  ) {
    return false;
  }
  return (
    value.pageDimensions.every(
      (dimension) =>
        isRecord(dimension) &&
        hasOnlyKeys(dimension, ["pageIndex", "width", "height", "rotation"]) &&
        Number.isInteger(dimension.pageIndex) &&
        isFiniteNumber(dimension.width) &&
        dimension.width > 0 &&
        isFiniteNumber(dimension.height) &&
        dimension.height > 0 &&
        isFiniteNumber(dimension.rotation) &&
        [0, 90, 180, 270].includes(dimension.rotation),
    ) &&
    value.pages.every(
      (page) =>
        isRecord(page) &&
        hasOnlyKeys(page, ["pageIndex", "text", "items", "evidence"]) &&
        Number.isInteger(page.pageIndex) &&
        typeof page.text === "string" &&
        Array.isArray(page.items) &&
        page.items.every(
          (item) =>
            isRecord(item) &&
            hasOnlyKeys(item, [
              "id",
              "pageIndex",
              "x",
              "y",
              "width",
              "height",
              "text",
              "hasLineBreak",
              "direction",
              "sourceIndex",
            ]) &&
            typeof item.id === "string" &&
            Number.isInteger(item.pageIndex) &&
            isFiniteNumber(item.x) &&
            isFiniteNumber(item.y) &&
            isFiniteNumber(item.width) &&
            isFiniteNumber(item.height) &&
            item.x >= 0 &&
            item.y >= 0 &&
            item.width > 0 &&
            item.height > 0 &&
            item.x + item.width <= 1 &&
            item.y + item.height <= 1 &&
            typeof item.text === "string" &&
            typeof item.hasLineBreak === "boolean" &&
            (item.direction === undefined || typeof item.direction === "string") &&
            Number.isInteger(item.sourceIndex),
        ) &&
        isRecord(page.evidence) &&
        hasOnlyKeys(page.evidence, [
          "textItems",
          "vectorOperations",
          "imageOperations",
        ]) &&
        Number.isInteger(page.evidence.textItems) &&
        Number.isInteger(page.evidence.vectorOperations) &&
        Number.isInteger(page.evidence.imageOperations),
    ) &&
    value.chunks.every(
      (chunk) =>
        isRecord(chunk) &&
        hasOnlyKeys(chunk, [
          "id",
          "pageIndex",
          "text",
          "sequence",
          "startItemIndex",
          "endItemIndex",
          "characterCount",
        ]) &&
        typeof chunk.id === "string" &&
        Number.isInteger(chunk.pageIndex) &&
        typeof chunk.text === "string" &&
        Number.isInteger(chunk.sequence) &&
        Number.isInteger(chunk.startItemIndex) &&
        Number.isInteger(chunk.endItemIndex) &&
        Number.isInteger(chunk.characterCount) &&
        chunk.characterCount === chunk.text.length,
    )
  );
}

export function isExtractionParentMessage(value: unknown): value is ExtractionParentMessage {
  if (!isRecord(value) || !isRequestId(value.requestId)) return false;
  if (value.kind === "cancel") {
    return Object.keys(value).every((key) => key === "kind" || key === "requestId");
  }
  return (
    value.kind === "extract" &&
    value.pdfBytes instanceof Uint8Array &&
    Object.keys(value).every((key) => ["kind", "requestId", "pdfBytes"].includes(key))
  );
}

export function isExtractionChildMessage(value: unknown): value is ExtractionChildMessage {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "ready") return Object.keys(value).length === 1;
  if (value.kind === "failed") {
    return (
      hasOnlyKeys(value, ["kind", "requestId", "code"]) &&
      (value.requestId === undefined || isRequestId(value.requestId)) &&
      typeof value.code === "string" &&
      [
        "INVALID_IPC_MESSAGE",
        "DOCUMENT_INTELLIGENCE_PAGE_LIMIT",
        "DOCUMENT_INTELLIGENCE_COMPLEXITY_LIMIT",
        "DOCUMENT_INTELLIGENCE_ENCRYPTED_PDF",
        "DOCUMENT_INTELLIGENCE_EXTRACTION_FAILED",
      ].includes(value.code)
    );
  }
  if (!isRequestId(value.requestId)) return false;
  if (value.kind === "cancelled") {
    return hasOnlyKeys(value, ["kind", "requestId"]);
  }
  if (value.kind === "progress") {
    return (
      hasOnlyKeys(value, ["kind", "requestId", "completed", "total"]) &&
      Number.isInteger(value.completed) &&
      Number.isInteger(value.total) &&
      typeof value.completed === "number" &&
      typeof value.total === "number" &&
      value.completed >= 0 &&
      value.total > 0 &&
      value.completed <= value.total
    );
  }
  return (
    value.kind === "completed" &&
    hasOnlyKeys(value, [
      "kind",
      "requestId",
      "context",
      "environmentKeys",
    ]) &&
    isContext(value.context) &&
    Array.isArray(value.environmentKeys) &&
    value.environmentKeys.every((key) => typeof key === "string")
  );
}
