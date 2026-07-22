export const REDACTION_MIN_DPI = 96;
export const REDACTION_MAX_DPI = 200;
export const REDACTION_MAX_PAGES = 10;
export const REDACTION_MAX_INPUT_BYTES = 20 * 1024 * 1024;
export const REDACTION_MAX_RECTANGLES = 100;
export const REDACTION_MAX_CANVAS_SIDE = 10_000;
export const REDACTION_MAX_PAGE_PIXELS = 16_000_000;
export const REDACTION_MAX_TOTAL_PIXELS = 40_000_000;

export const redactionStages = [
  "validating",
  "rasterizing",
  "applying-redactions",
  "rebuilding",
  "verifying",
  "completed",
  "failed",
  "cancelled",
] as const;

export type RedactionStage = (typeof redactionStages)[number];

export interface NormalizedRedactionRectangle {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RedactionProgress {
  stage: RedactionStage;
  completedPages?: number;
  totalPages?: number;
}

export interface RasterRedactionOptions {
  dpi: number;
  rectangles: NormalizedRedactionRectangle[];
  signal?: AbortSignal;
  onProgress?: (progress: RedactionProgress) => void;
}

export interface RasterRedactionResult {
  bytes: Uint8Array;
  pageDimensions: Array<{ width: number; height: number }>;
  metrics: RasterRedactionMetrics;
}

export interface RasterRedactionMetrics {
  pageCount: number;
  totalPixels: number;
  outputBytes: number;
  processingMilliseconds: number;
}
