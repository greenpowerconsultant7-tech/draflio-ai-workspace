/// <reference types="node" />
/// <reference lib="esnext.float16" />

import { fileURLToPath } from "node:url";
import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { PDFDocument, PDFName } from "pdf-lib";
import {
  AnnotationMode,
  getDocument,
  type PDFDocumentProxy,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  REDACTION_MAX_DPI,
  REDACTION_MAX_INPUT_BYTES,
  REDACTION_MAX_PAGES,
  REDACTION_MAX_RECTANGLES,
  REDACTION_MIN_DPI,
  type NormalizedRedactionRectangle,
  type RasterRedactionOptions,
  type RasterRedactionResult,
  type RedactionProgress,
  type RedactionStage,
} from "./redactionTypes.js";

const PDF_SIGNATURE = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const STANDARD_FONT_DATA_URL = `${fileURLToPath(
  new URL("../../node_modules/pdfjs-dist/standard_fonts/", import.meta.url),
).replaceAll("\\", "/")}/`;

function abortError(): DOMException {
  return new DOMException("Redaction cancelled", "AbortError");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortError();
  }
}

function report(
  onProgress: RasterRedactionOptions["onProgress"],
  stage: RedactionStage,
  completedPages?: number,
  totalPages?: number,
): void {
  const progress: RedactionProgress = { stage };
  if (completedPages !== undefined && totalPages !== undefined) {
    progress.completedPages = completedPages;
    progress.totalPages = totalPages;
  }
  onProgress?.(progress);
}

function validateInput(input: Uint8Array, options: RasterRedactionOptions): void {
  if (input.byteLength === 0) {
    throw new Error("Input PDF must not be empty");
  }
  if (input.byteLength > REDACTION_MAX_INPUT_BYTES) {
    throw new Error("Input PDF exceeds the 20 MB spike limit");
  }
  if (
    input.byteLength < PDF_SIGNATURE.length ||
    PDF_SIGNATURE.some((byte, index) => input[index] !== byte)
  ) {
    throw new Error("Input does not have a valid PDF signature");
  }
  if (
    !Number.isFinite(options.dpi) ||
    options.dpi < REDACTION_MIN_DPI ||
    options.dpi > REDACTION_MAX_DPI
  ) {
    throw new Error(`DPI must be between ${REDACTION_MIN_DPI} and ${REDACTION_MAX_DPI}`);
  }
  if (options.rectangles.length > REDACTION_MAX_RECTANGLES) {
    throw new Error(
      `Redaction count exceeds the ${REDACTION_MAX_RECTANGLES} rectangle spike limit`,
    );
  }

  for (const rectangle of options.rectangles) {
    const values = [
      rectangle.pageIndex,
      rectangle.x,
      rectangle.y,
      rectangle.width,
      rectangle.height,
    ];
    if (!values.every(Number.isFinite)) {
      throw new Error("Redaction rectangle values must be finite numbers");
    }
    if (!Number.isInteger(rectangle.pageIndex) || rectangle.pageIndex < 0) {
      throw new Error("Redaction page indexes must be non-negative integers");
    }
    if (rectangle.width <= 0 || rectangle.height <= 0) {
      throw new Error("Redaction rectangle width and height must be greater than zero");
    }
    if (
      rectangle.x < 0 ||
      rectangle.y < 0 ||
      rectangle.x + rectangle.width > 1 ||
      rectangle.y + rectangle.height > 1
    ) {
      throw new Error("Redaction rectangles must be fully inside normalized page bounds");
    }
  }
}

function validatePageIndexes(rectangles: NormalizedRedactionRectangle[], pageCount: number): void {
  if (pageCount > REDACTION_MAX_PAGES) {
    throw new Error(`PDF exceeds the ${REDACTION_MAX_PAGES} page spike limit`);
  }
  for (const rectangle of rectangles) {
    if (rectangle.pageIndex >= pageCount) {
      throw new Error(`Redaction page index ${rectangle.pageIndex} does not exist`);
    }
  }
}

async function verifyFreshOutput(bytes: Uint8Array, expectedPages: number): Promise<void> {
  if (PDF_SIGNATURE.some((byte, index) => bytes[index] !== byte)) {
    throw new Error("Rebuilt output does not have a valid PDF signature");
  }

  const output = await PDFDocument.load(bytes);
  if (output.getPageCount() !== expectedPages) {
    throw new Error("Rebuilt output page count does not match the input");
  }

  const catalog = output.catalog;
  for (const key of ["AcroForm", "OpenAction", "AA", "OCProperties"]) {
    if (catalog.has(PDFName.of(key))) {
      throw new Error(`Rebuilt output unexpectedly contains catalog entry ${key}`);
    }
  }
  if (catalog.has(PDFName.of("Names"))) {
    throw new Error("Rebuilt output unexpectedly contains a Names dictionary");
  }
}

export async function rasterRedactPdf(
  inputBuffer: Uint8Array,
  options: RasterRedactionOptions,
): Promise<RasterRedactionResult> {
  report(options.onProgress, "validating");
  throwIfAborted(options.signal);
  validateInput(inputBuffer, options);

  let source: PDFDocumentProxy | undefined;
  let loadingTask: ReturnType<typeof getDocument> | undefined;
  let cleanupCanvas: Canvas | undefined;

  try {
    loadingTask = getDocument({
      data: inputBuffer.slice(),
      standardFontDataUrl: STANDARD_FONT_DATA_URL,
      useSystemFonts: false,
    });
    source = await loadingTask.promise;
    throwIfAborted(options.signal);
    validatePageIndexes(options.rectangles, source.numPages);

    const output = await PDFDocument.create();
    output.setTitle("Redacted document");
    output.setAuthor("");
    output.setSubject("");
    output.setKeywords([]);
    output.setCreator("Draflio raster redaction spike");
    output.setProducer("Draflio raster redaction spike");

    const pageDimensions: Array<{ width: number; height: number }> = [];
    const scale = options.dpi / 72;

    for (let pageIndex = 0; pageIndex < source.numPages; pageIndex += 1) {
      throwIfAborted(options.signal);
      report(options.onProgress, "rasterizing", pageIndex, source.numPages);

      const sourcePage = await source.getPage(pageIndex + 1);
      const viewport = sourcePage.getViewport({ scale });
      const pointViewport = sourcePage.getViewport({ scale: 1 });
      const pixelWidth = Math.ceil(viewport.width);
      const pixelHeight = Math.ceil(viewport.height);
      const pageCanvas = createCanvas(pixelWidth, pixelHeight);
      cleanupCanvas = pageCanvas;
      const pageContext = pageCanvas.getContext("2d");

      try {
        await sourcePage.render({
          canvas: null,
          canvasContext: pageContext as unknown as CanvasRenderingContext2D,
          viewport,
          annotationMode: AnnotationMode.DISABLE,
          background: "#ffffff",
        }).promise;
        throwIfAborted(options.signal);

        report(options.onProgress, "applying-redactions", pageIndex, source.numPages);
        pageContext.fillStyle = "#000000";
        for (const rectangle of options.rectangles) {
          if (rectangle.pageIndex !== pageIndex) {
            continue;
          }
          pageContext.fillRect(
            rectangle.x * pixelWidth,
            rectangle.y * pixelHeight,
            rectangle.width * pixelWidth,
            rectangle.height * pixelHeight,
          );
        }
        throwIfAborted(options.signal);

        report(options.onProgress, "rebuilding", pageIndex, source.numPages);
        const pngBytes = pageCanvas.toBuffer("image/png");
        try {
          const image = await output.embedPng(pngBytes);
          const outputPage = output.addPage([pointViewport.width, pointViewport.height]);
          outputPage.drawImage(image, {
            x: 0,
            y: 0,
            width: pointViewport.width,
            height: pointViewport.height,
          });
          pageDimensions.push({ width: pointViewport.width, height: pointViewport.height });
        } finally {
          pngBytes.fill(0);
        }
      } finally {
        pageCanvas.width = 0;
        pageCanvas.height = 0;
        cleanupCanvas = undefined;
        sourcePage.cleanup();
      }
      report(options.onProgress, "rebuilding", pageIndex + 1, source.numPages);
    }

    throwIfAborted(options.signal);
    const bytes = await output.save({ useObjectStreams: false });
    report(options.onProgress, "verifying");
    throwIfAborted(options.signal);
    await verifyFreshOutput(bytes, source.numPages);
    throwIfAborted(options.signal);
    report(options.onProgress, "completed", source.numPages, source.numPages);
    return { bytes, pageDimensions };
  } catch (error) {
    if (options.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      report(options.onProgress, "cancelled");
      throw abortError();
    }
    report(options.onProgress, "failed");
    throw error;
  } finally {
    if (cleanupCanvas) {
      cleanupCanvas.width = 0;
      cleanupCanvas.height = 0;
    }
    await loadingTask?.destroy();
  }
}
