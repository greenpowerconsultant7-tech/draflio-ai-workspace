/// <reference types="node" />
/// <reference lib="esnext.float16" />

import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { PDFDocument } from "pdf-lib";
import {
  AnnotationMode,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask,
} from "pdfjs-dist/legacy/build/pdf.mjs";
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
  type RasterRedactionOptions,
  type RasterRedactionResult,
  type RedactionProgress,
  type RedactionStage,
} from "./redactionTypes.js";
import { NEUTRAL_METADATA, verifyRasterRedactionOutput } from "./redactionVerificationService.js";

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
    throw new Error("REDACTION_INPUT_EMPTY");
  }
  if (input.byteLength > REDACTION_MAX_INPUT_BYTES) {
    throw new Error("REDACTION_INPUT_TOO_LARGE");
  }
  if (
    input.byteLength < PDF_SIGNATURE.length ||
    PDF_SIGNATURE.some((byte, index) => input[index] !== byte)
  ) {
    throw new Error("REDACTION_INPUT_INVALID_SIGNATURE");
  }
  if (
    !Number.isFinite(options.dpi) ||
    options.dpi < REDACTION_MIN_DPI ||
    options.dpi > REDACTION_MAX_DPI
  ) {
    throw new Error("REDACTION_DPI_INVALID");
  }
  if (options.rectangles.length === 0 || options.rectangles.length > REDACTION_MAX_RECTANGLES) {
    throw new Error("REDACTION_RECTANGLE_COUNT_INVALID");
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
      throw new Error("REDACTION_RECTANGLE_VALUE_INVALID");
    }
    if (!Number.isInteger(rectangle.pageIndex) || rectangle.pageIndex < 0) {
      throw new Error("REDACTION_PAGE_INDEX_INVALID");
    }
    if (rectangle.width <= 0 || rectangle.height <= 0) {
      throw new Error("REDACTION_RECTANGLE_SIZE_INVALID");
    }
    if (
      rectangle.x < 0 ||
      rectangle.y < 0 ||
      rectangle.x + rectangle.width > 1 ||
      rectangle.y + rectangle.height > 1
    ) {
      throw new Error("REDACTION_RECTANGLE_BOUNDS_INVALID");
    }
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function zeroOwnedBuffer(buffer: Uint8Array): void {
  if (buffer.byteLength > 0) {
    buffer.fill(0);
  }
}

async function loadPdf(
  sourceBytes: Uint8Array,
  signal?: AbortSignal,
): Promise<{ loadingTask: PDFDocumentLoadingTask; document: PDFDocumentProxy }> {
  const loadingTask = getDocument({
    data: sourceBytes,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    useSystemFonts: false,
  });
  const abortLoading = () => {
    void loadingTask.destroy();
  };
  signal?.addEventListener("abort", abortLoading, { once: true });
  if (signal?.aborted) {
    abortLoading();
  }
  try {
    const document = await loadingTask.promise;
    throwIfAborted(signal);
    return { loadingTask, document };
  } catch (error) {
    if (signal?.aborted) {
      throw abortError();
    }
    throw error;
  } finally {
    signal?.removeEventListener("abort", abortLoading);
  }
}

async function renderPage(
  page: PDFPageProxy,
  pageCanvas: Canvas,
  viewport: ReturnType<PDFPageProxy["getViewport"]>,
  signal?: AbortSignal,
): Promise<void> {
  const pageContext = pageCanvas.getContext("2d");
  const renderTask: RenderTask = page.render({
    canvas: null,
    canvasContext: pageContext as unknown as CanvasRenderingContext2D,
    viewport,
    annotationMode: AnnotationMode.DISABLE,
    background: "#ffffff",
  });
  const cancelRender = () => {
    renderTask.cancel();
  };
  signal?.addEventListener("abort", cancelRender, { once: true });
  if (signal?.aborted) {
    cancelRender();
  }
  try {
    await renderTask.promise;
  } catch (error) {
    if (signal?.aborted) {
      throw abortError();
    }
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancelRender);
  }
}

async function inspectPages(
  source: PDFDocumentProxy,
  dpi: number,
  rectangles: NormalizedRedactionRectangle[],
  signal?: AbortSignal,
): Promise<{
  dimensions: Array<{ width: number; height: number }>;
  totalPixels: number;
}> {
  if (source.numPages === 0 || source.numPages > REDACTION_MAX_PAGES) {
    throw new Error("REDACTION_PAGE_COUNT_INVALID");
  }
  for (const rectangle of rectangles) {
    if (rectangle.pageIndex >= source.numPages) {
      throw new Error("REDACTION_PAGE_INDEX_INVALID");
    }
  }

  const dimensions: Array<{ width: number; height: number }> = [];
  let totalPixels = 0;
  const scale = dpi / 72;
  for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
    throwIfAborted(signal);
    const page = await source.getPage(pageNumber);
    try {
      const pointViewport = page.getViewport({ scale: 1 });
      const pixelViewport = page.getViewport({ scale });
      const width = Math.ceil(pixelViewport.width);
      const height = Math.ceil(pixelViewport.height);
      const pagePixels = width * height;
      if (
        width > REDACTION_MAX_CANVAS_SIDE ||
        height > REDACTION_MAX_CANVAS_SIDE ||
        pagePixels > REDACTION_MAX_PAGE_PIXELS
      ) {
        throw new Error("REDACTION_PAGE_PIXEL_BUDGET_EXCEEDED");
      }
      totalPixels += pagePixels;
      if (totalPixels > REDACTION_MAX_TOTAL_PIXELS) {
        throw new Error("REDACTION_TOTAL_PIXEL_BUDGET_EXCEEDED");
      }
      dimensions.push({ width: pointViewport.width, height: pointViewport.height });
    } finally {
      page.cleanup();
    }
  }
  return { dimensions, totalPixels };
}

export async function rasterRedactPdf(
  inputBuffer: Uint8Array,
  options: RasterRedactionOptions,
): Promise<RasterRedactionResult> {
  const startedAt = performance.now();
  report(options.onProgress, "validating");
  throwIfAborted(options.signal);
  validateInput(inputBuffer, options);

  const pdfJsInputCopy = inputBuffer.slice();
  let loadingTask: PDFDocumentLoadingTask | undefined;
  let source: PDFDocumentProxy | undefined;
  let cleanupCanvas: Canvas | undefined;
  try {
    const loaded = await loadPdf(pdfJsInputCopy, options.signal);
    loadingTask = loaded.loadingTask;
    source = loaded.document;
    const inspection = await inspectPages(source, options.dpi, options.rectangles, options.signal);

    const output = await PDFDocument.create();
    output.setTitle(NEUTRAL_METADATA.title);
    output.setAuthor(NEUTRAL_METADATA.author);
    output.setSubject(NEUTRAL_METADATA.subject);
    output.setKeywords([]);
    output.setCreator(NEUTRAL_METADATA.creator);
    output.setProducer(NEUTRAL_METADATA.producer);

    const scale = options.dpi / 72;
    for (let pageIndex = 0; pageIndex < source.numPages; pageIndex += 1) {
      throwIfAborted(options.signal);
      report(options.onProgress, "rasterizing", pageIndex, source.numPages);
      const sourcePage = await source.getPage(pageIndex + 1);
      const viewport = sourcePage.getViewport({ scale });
      const dimensions = inspection.dimensions[pageIndex];
      const pageCanvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      cleanupCanvas = pageCanvas;
      try {
        await renderPage(sourcePage, pageCanvas, viewport, options.signal);
        throwIfAborted(options.signal);
        report(options.onProgress, "applying-redactions", pageIndex, source.numPages);
        const pageContext = pageCanvas.getContext("2d");
        pageContext.fillStyle = "#000000";
        for (const rectangle of options.rectangles) {
          if (rectangle.pageIndex === pageIndex) {
            pageContext.fillRect(
              rectangle.x * pageCanvas.width,
              rectangle.y * pageCanvas.height,
              rectangle.width * pageCanvas.width,
              rectangle.height * pageCanvas.height,
            );
          }
        }
        throwIfAborted(options.signal);
        report(options.onProgress, "rebuilding", pageIndex, source.numPages);
        const pngBytes = pageCanvas.toBuffer("image/png");
        try {
          const image = await output.embedPng(pngBytes);
          const outputPage = output.addPage([dimensions.width, dimensions.height]);
          outputPage.drawImage(image, {
            x: 0,
            y: 0,
            width: dimensions.width,
            height: dimensions.height,
          });
        } finally {
          zeroOwnedBuffer(pngBytes);
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
    const outputBytes = await output.save({ useObjectStreams: false });
    report(options.onProgress, "verifying");
    throwIfAborted(options.signal);
    const verification = await verifyRasterRedactionOutput({
      inputBytes: inputBuffer,
      outputBytes,
      expectedPageDimensions: inspection.dimensions,
    });
    throwIfAborted(options.signal);
    report(options.onProgress, "completed", source.numPages, source.numPages);
    return {
      bytes: outputBytes,
      pageDimensions: inspection.dimensions,
      metrics: {
        pageCount: verification.pageCount,
        totalPixels: inspection.totalPixels,
        outputBytes: verification.outputBytes,
        processingMilliseconds: Math.round(performance.now() - startedAt),
      },
    };
  } catch (error) {
    if (options.signal?.aborted || isAbortError(error)) {
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
    zeroOwnedBuffer(pdfJsInputCopy);
  }
}
