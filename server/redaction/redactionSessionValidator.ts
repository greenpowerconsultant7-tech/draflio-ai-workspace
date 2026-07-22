/// <reference types="node" />
/// <reference lib="esnext.float16" />

import { basename, extname } from "node:path";
import { getDocument, type PDFDocumentLoadingTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import { badRequest, conflict, unprocessableContent } from "../errors/apiError.js";
import { validatePdfFile, type UploadedFile } from "../validation/fileValidation.js";
import {
  REDACTION_MAX_CANVAS_SIDE,
  REDACTION_MAX_DPI,
  REDACTION_MAX_INPUT_BYTES,
  REDACTION_MAX_PAGE_PIXELS,
  REDACTION_MAX_PAGES,
  REDACTION_MAX_RECTANGLES,
  REDACTION_MAX_TOTAL_PIXELS,
  REDACTION_MIN_DPI,
  type NormalizedRedactionRectangle,
} from "./redactionTypes.js";
import type {
  RedactionFinalizeRequest,
  RedactionPageDimension,
  RedactionSessionRecord,
} from "./redactionSessionTypes.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function assertRedactionSessionId(value: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw badRequest("The redaction session ID is invalid.");
  }
}

export function sanitizeRedactionInputFilename(value: string): string {
  const name = basename(value.replace(/\\/g, "/"))
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 150);
  const base = extname(name).toLowerCase() === ".pdf" ? name.slice(0, -4) : name;
  return `${base || "document"}.pdf`;
}

export function createRedactedOutputFilename(originalFilename: string): string {
  return `${originalFilename.slice(0, -4)}-redacted.pdf`;
}

export function validateRedactionUpload(file: UploadedFile | undefined): UploadedFile {
  if (!file) {
    return validatePdfFile(undefined, { maximumSizeBytes: REDACTION_MAX_INPUT_BYTES });
  }
  const validationView: UploadedFile = { ...file, originalname: "document.pdf" };
  validatePdfFile(validationView, { maximumSizeBytes: REDACTION_MAX_INPUT_BYTES });
  return file;
}

export async function inspectRedactionPdf(
  bytes: Uint8Array,
): Promise<{ pageCount: number; pageDimensions: RedactionPageDimension[] }> {
  const pdfBytes = new Uint8Array(bytes.byteLength);
  pdfBytes.set(bytes);
  let loadingTask: PDFDocumentLoadingTask | undefined;
  try {
    loadingTask = getDocument({ data: pdfBytes, verbosity: 0 });
    const document = await loadingTask.promise;
    if (document.numPages > REDACTION_MAX_PAGES) {
      throw unprocessableContent(`PDFs may contain no more than ${REDACTION_MAX_PAGES} pages.`);
    }
    const pageDimensions: RedactionPageDimension[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      try {
        const viewport = page.getViewport({ scale: 1 });
        pageDimensions.push({ width: viewport.width, height: viewport.height });
      } finally {
        page.cleanup();
      }
    }
    return { pageCount: document.numPages, pageDimensions };
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException") {
      throw unprocessableContent("Password-protected or encrypted PDFs are not supported.");
    }
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }
    throw unprocessableContent("The PDF could not be safely prepared for redaction.");
  } finally {
    await loadingTask?.destroy();
    if (pdfBytes.byteLength > 0) {
      pdfBytes.fill(0);
    }
  }
}

function validateRectangle(value: unknown, pageCount: number): NormalizedRedactionRectangle {
  if (!isRecord(value)) {
    throw badRequest("Every redaction rectangle must be an object.");
  }
  const { pageIndex, x, y, width, height } = value;
  if (
    !Number.isInteger(pageIndex) ||
    !finite(pageIndex) ||
    pageIndex < 0 ||
    pageIndex >= pageCount
  ) {
    throw badRequest("A redaction rectangle references an invalid page.");
  }
  if (!finite(x) || !finite(y) || !finite(width) || !finite(height)) {
    throw badRequest("Redaction rectangle coordinates must be finite numbers.");
  }
  if (width <= 0 || height <= 0 || x < 0 || y < 0 || x + width > 1 || y + height > 1) {
    throw badRequest("Redaction rectangles must remain within normalized page bounds.");
  }
  return { pageIndex, x, y, width, height };
}

export function validateFinalizeRequest(
  value: unknown,
  session: RedactionSessionRecord,
): RedactionFinalizeRequest {
  if (!isRecord(value)) {
    throw badRequest("A JSON finalization request is required.");
  }
  if (value.confirmation !== true) {
    throw badRequest("Explicit redaction confirmation is required.");
  }
  if (!Number.isInteger(value.revision) || !finite(value.revision) || value.revision <= 0) {
    throw badRequest("The revision must be a positive integer.");
  }
  if (value.revision !== session.revision) {
    throw conflict("The redaction session revision is stale.");
  }
  if (!finite(value.dpi) || value.dpi < REDACTION_MIN_DPI || value.dpi > REDACTION_MAX_DPI) {
    throw badRequest(`DPI must be between ${REDACTION_MIN_DPI} and ${REDACTION_MAX_DPI}.`);
  }
  if (!Array.isArray(value.rectangles) || value.rectangles.length < 1) {
    throw badRequest("At least one redaction rectangle is required.");
  }
  if (value.rectangles.length > REDACTION_MAX_RECTANGLES) {
    throw badRequest(`No more than ${REDACTION_MAX_RECTANGLES} rectangles are allowed.`);
  }
  const rectangles = value.rectangles.map((rectangle) =>
    validateRectangle(rectangle, session.pageCount),
  );
  validatePixelBudget(session.pageDimensions, value.dpi);
  return { confirmation: true, revision: value.revision, dpi: value.dpi, rectangles };
}

export function validatePixelBudget(pageDimensions: RedactionPageDimension[], dpi: number): number {
  const scale = dpi / 72;
  let totalPixels = 0;
  for (const dimension of pageDimensions) {
    const width = Math.ceil(dimension.width * scale);
    const height = Math.ceil(dimension.height * scale);
    if (width > REDACTION_MAX_CANVAS_SIDE || height > REDACTION_MAX_CANVAS_SIDE) {
      throw unprocessableContent("A rendered page would exceed the canvas-side limit.");
    }
    const pixels = width * height;
    if (pixels > REDACTION_MAX_PAGE_PIXELS) {
      throw unprocessableContent("A rendered page would exceed the pixel limit.");
    }
    totalPixels += pixels;
  }
  if (totalPixels > REDACTION_MAX_TOTAL_PIXELS) {
    throw unprocessableContent("The document would exceed the total pixel limit.");
  }
  return totalPixels;
}
