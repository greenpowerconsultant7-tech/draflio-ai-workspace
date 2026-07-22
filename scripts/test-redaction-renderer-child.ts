/// <reference types="node" />
/// <reference lib="esnext.float16" />

import { fork } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { AnnotationMode, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const SECRET = "REDACTION_SECRET_48291";
const METADATA_SECRET = "REDACTION_METADATA_71933";
const mode = process.argv.includes("--compiled") ? "compiled" : "source";
const protectedEnvironmentKeys = [
  "PDF_SERVICES_CLIENT_ID",
  "PDF_SERVICES_CLIENT_SECRET",
  "DRAFLIO_API_KEY",
  "SUPABASE_KEY",
  "DATABASE_URL",
  "AUTHORIZATION_TOKEN",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "NODE_OPTIONS",
] as const;

interface TestProgress {
  stage: string;
  completedPages?: number;
  totalPages?: number;
}

let observedProgress: TestProgress[] = [];

interface TestRunInput {
  inputBytes: Uint8Array;
  dpi: number;
  rectangles: Array<{ pageIndex: number; x: number; y: number; width: number; height: number }>;
  expected: {
    pageCount: number;
    pageDimensions: Array<{ width: number; height: number }>;
  };
  signal?: AbortSignal;
  onProgress?: (progress: TestProgress) => void;
}

interface TestRunResult {
  bytes: Uint8Array;
  metrics: {
    pageCount: number;
    totalPixels: number;
    outputBytes: number;
    processingMilliseconds: number;
    environmentKeys: string[];
  };
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

interface RendererClientModule {
  runIsolatedRedaction(input: TestRunInput): Promise<TestRunResult>;
  getActiveRedactionRendererCount(): number;
  getRedactionRendererEnvironmentAllowlist(): readonly string[];
}

interface RendererSupervisorModule {
  superviseChildProcess(options: {
    modulePath: string;
    execArgv: string[];
    environment: NodeJS.ProcessEnv;
    watchdogMs: number;
    cancellationGraceMs: number;
  }): Promise<{
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    cancellationReason?: "user" | "timeout";
    forced: boolean;
  }>;
  getActiveSupervisedChildCount(): number;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isRendererClientModule(value: unknown): value is RendererClientModule {
  return (
    typeof value === "object" &&
    value !== null &&
    "runIsolatedRedaction" in value &&
    typeof value.runIsolatedRedaction === "function" &&
    "getActiveRedactionRendererCount" in value &&
    typeof value.getActiveRedactionRendererCount === "function" &&
    "getRedactionRendererEnvironmentAllowlist" in value &&
    typeof value.getRedactionRendererEnvironmentAllowlist === "function"
  );
}

function errorDetails(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { name: "UnknownError" };
  }
  const details: Record<string, unknown> = { name: error.name, message: error.message };
  for (const key of ["termination", "forced", "exitCode", "signal", "code"]) {
    if (key in error) {
      details[key] = Reflect.get(error, key);
    }
  }
  return details;
}

async function loadClient(): Promise<RendererClientModule> {
  const url =
    mode === "compiled"
      ? new URL("../dist/server/redaction/redactionRendererClient.js", import.meta.url)
      : new URL("../server/redaction/redactionRendererClient.ts", import.meta.url);
  const loaded: unknown = await import(url.href);
  assert(isRendererClientModule(loaded), "Renderer client module exports are invalid");
  return loaded;
}

async function loadSupervisor(): Promise<RendererSupervisorModule> {
  const url =
    mode === "compiled"
      ? new URL("../dist/server/redaction/redactionRendererSupervisor.js", import.meta.url)
      : new URL("../server/redaction/redactionRendererSupervisor.ts", import.meta.url);
  const loaded: unknown = await import(url.href);
  assert(
    typeof loaded === "object" &&
      loaded !== null &&
      "superviseChildProcess" in loaded &&
      typeof loaded.superviseChildProcess === "function" &&
      "getActiveSupervisedChildCount" in loaded &&
      typeof loaded.getActiveSupervisedChildCount === "function",
    "Renderer supervisor module exports are invalid",
  );
  return loaded as RendererSupervisorModule;
}

async function createFixture(pageCount = 2): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(METADATA_SECRET);
  document.setSubject(METADATA_SECRET);
  document.setKeywords([METADATA_SECRET]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pageCount; index += 1) {
    const page = document.addPage([612, 792]);
    if (index === 1) {
      page.setRotation(degrees(90));
    }
    page.drawText(index === 0 ? SECRET : `Ordinary page ${index + 1}`, {
      x: 72,
      y: 650,
      size: 24,
      font,
      color: rgb(0, 0, 0),
    });
    page.drawText("Ordinary unredacted text remains visible", {
      x: 72,
      y: 575,
      size: 18,
      font,
      color: rgb(0, 0, 0),
    });
  }
  return document.save({ useObjectStreams: false });
}

async function getVisibleDimensions(
  bytes: Uint8Array,
): Promise<Array<{ width: number; height: number }>> {
  const loadingTask = getDocument({ data: bytes.slice() });
  try {
    const document = await loadingTask.promise;
    const dimensions: Array<{ width: number; height: number }> = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      try {
        const viewport = page.getViewport({ scale: 1 });
        dimensions.push({ width: viewport.width, height: viewport.height });
      } finally {
        page.cleanup();
      }
    }
    return dimensions;
  } finally {
    await loadingTask.destroy();
  }
}

async function verifyVisibleOutput(bytes: Uint8Array): Promise<{
  maskPixelBlack: boolean;
  ordinaryRegionHasInk: boolean;
}> {
  const loadingTask = getDocument({ data: bytes.slice() });
  try {
    const document = await loadingTask.promise;
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const pageCanvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = pageCanvas.getContext("2d");
    try {
      await page.render({
        canvas: null,
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
        annotationMode: AnnotationMode.DISABLE,
        background: "#ffffff",
      }).promise;
      const maskPixel = context.getImageData(
        Math.floor(0.25 * pageCanvas.width),
        Math.floor(0.17 * pageCanvas.height),
        1,
        1,
      ).data;
      const maskPixelBlack =
        maskPixel[0] === 0 && maskPixel[1] === 0 && maskPixel[2] === 0 && maskPixel[3] === 255;
      const ordinary = context.getImageData(
        Math.floor((60 / 612) * pageCanvas.width),
        Math.floor((185 / 792) * pageCanvas.height),
        Math.floor((440 / 612) * pageCanvas.width),
        Math.floor((40 / 792) * pageCanvas.height),
      ).data;
      let darkPixels = 0;
      for (let index = 0; index < ordinary.length; index += 4) {
        if (ordinary[index] < 128 && ordinary[index + 1] < 128 && ordinary[index + 2] < 128) {
          darkPixels += 1;
        }
      }
      return { maskPixelBlack, ordinaryRegionHasInk: darkPixels > 100 };
    } finally {
      pageCanvas.width = 0;
      pageCanvas.height = 0;
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
}

function containsUtf8(bytes: Uint8Array, value: string): boolean {
  return Buffer.from(bytes).includes(Buffer.from(value, "utf8"));
}

async function runMalformedMessageTest(): Promise<{
  responseCode: unknown;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}> {
  const childPath = fileURLToPath(
    mode === "compiled"
      ? new URL("../dist/server/redaction/redactionRendererChild.js", import.meta.url)
      : new URL("../server/redaction/redactionRendererChild.ts", import.meta.url),
  );
  return new Promise((resolve, reject) => {
    const child = fork(childPath, [], {
      execPath: process.execPath,
      execArgv: mode === "compiled" ? [] : ["--import", "tsx"],
      env: {},
      serialization: "advanced",
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    let responseCode: unknown;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Malformed IPC test timed out"));
    }, 5_000);
    child.on("message", (message: unknown) => {
      if (typeof message === "object" && message !== null && "kind" in message) {
        if (message.kind === "ready") {
          child.send({ kind: "malformed", data: [1, 2, 3] });
        } else if (message.kind === "failed" && "code" in message) {
          responseCode = message.code;
        }
      }
    });
    child.once("error", reject);
    child.once("exit", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ responseCode, exitCode, signal });
    });
  });
}

async function main(): Promise<void> {
  const client = await loadClient();
  const supervisor = await loadSupervisor();
  protectedEnvironmentKeys.forEach((key) => {
    process.env[key] = `protected-test-value-${key}`;
  });

  const fixture = await createFixture();
  const dimensions = await getVisibleDimensions(fixture);
  const progress: TestProgress[] = [];
  observedProgress = progress;
  const startedAt = performance.now();
  const success = await client.runIsolatedRedaction({
    inputBytes: fixture,
    dpi: 144,
    rectangles: [
      {
        pageIndex: 0,
        x: 60 / 612,
        y: 105 / 792,
        width: 350 / 612,
        height: 50 / 792,
      },
    ],
    expected: { pageCount: 2, pageDimensions: dimensions },
    onProgress: (update) => progress.push(update),
  });
  const elapsedMilliseconds = Math.round(performance.now() - startedAt);
  assert(success.exitCode === 0 && success.signal === null, "Success child did not exit cleanly");
  assert(client.getActiveRedactionRendererCount() === 0, "Success child handle remains active");
  assert(
    Buffer.from(success.bytes.subarray(0, 5)).toString("ascii") === "%PDF-",
    "Output is not PDF",
  );
  assert(!containsUtf8(success.bytes, SECRET), "Secret remains in output bytes");
  assert(!containsUtf8(success.bytes, METADATA_SECRET), "Metadata marker remains in output bytes");
  const outputDimensions = await getVisibleDimensions(success.bytes);
  assert(
    JSON.stringify(outputDimensions) === JSON.stringify(dimensions),
    "Visible dimensions changed",
  );
  const visible = await verifyVisibleOutput(success.bytes);
  assert(visible.maskPixelBlack, "Opaque mask verification failed");
  assert(visible.ordinaryRegionHasInk, "Unredacted ink verification failed");
  const progressText = JSON.stringify(progress);
  assert(!progressText.includes(SECRET), "Progress exposed document text");
  assert(!progressText.includes(METADATA_SECRET), "Progress exposed metadata");
  assert(!progressText.toLowerCase().includes(".pdf"), "Progress exposed a filename");
  const allowedKeys = new Set(client.getRedactionRendererEnvironmentAllowlist());
  assert(
    success.metrics.environmentKeys.every((key) => allowedKeys.has(key)),
    `Child environment contains a non-allowlisted key: ${success.metrics.environmentKeys.join(",")}`,
  );
  assert(
    protectedEnvironmentKeys.every((key) => !success.metrics.environmentKeys.includes(key)),
    "Child environment contains protected credentials",
  );

  const cancellationFixture = await createFixture(10);
  const cancellationDimensions = await getVisibleDimensions(cancellationFixture);
  const cancellationController = new AbortController();
  let cancellationError: Record<string, unknown> | undefined;
  try {
    await client.runIsolatedRedaction({
      inputBytes: cancellationFixture,
      dpi: 200,
      rectangles: [{ pageIndex: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.05 }],
      expected: { pageCount: 10, pageDimensions: cancellationDimensions },
      signal: cancellationController.signal,
      onProgress: (update) => {
        if (update.stage === "rasterizing") {
          cancellationController.abort();
        }
      },
    });
  } catch (error) {
    cancellationError = errorDetails(error);
  }
  assert(cancellationError?.name === "RedactionRendererCancellationError", "Cancellation failed");
  assert(cancellationError.termination === "cooperative", "Cancellation was not cooperative");
  assert(client.getActiveRedactionRendererCount() === 0, "Cancelled child handle remains active");

  const watchdogExit = await supervisor.superviseChildProcess({
    modulePath: fileURLToPath(new URL("./redaction-renderer-hang-child.ts", import.meta.url)),
    execArgv: ["--import", "tsx"],
    environment: {},
    watchdogMs: 150,
    cancellationGraceMs: 150,
  });
  assert(watchdogExit.cancellationReason === "timeout", "Watchdog did not time out");
  assert(watchdogExit.forced === true, "Watchdog did not report forced termination");
  assert(
    supervisor.getActiveSupervisedChildCount() === 0,
    "Watchdog supervisor child handle remains active",
  );
  assert(client.getActiveRedactionRendererCount() === 0, "Watchdog child handle remains active");

  const malformed = await runMalformedMessageTest();
  assert(malformed.responseCode === "INVALID_IPC_MESSAGE", "Malformed IPC was not rejected");
  assert(
    client.getActiveRedactionRendererCount() === 0,
    "Malformed IPC left an active client child",
  );

  const report = {
    mode,
    success: {
      inputBytes: fixture.byteLength,
      outputBytes: success.bytes.byteLength,
      elapsedMilliseconds,
      rendererProcessingMilliseconds: success.metrics.processingMilliseconds,
      totalPixels: success.metrics.totalPixels,
      pageDimensions: outputDimensions,
      maskPixelBlack: visible.maskPixelBlack,
      ordinaryRegionHasInk: visible.ordinaryRegionHasInk,
      exitCode: success.exitCode,
      signal: success.signal,
      progress,
      environmentKeys: success.metrics.environmentKeys,
    },
    cancellation: cancellationError,
    watchdog: watchdogExit,
    malformedIpc: malformed,
    activeChildren: client.getActiveRedactionRendererCount(),
  };
  success.bytes.fill(0);
  fixture.fill(0);
  cancellationFixture.fill(0);
  protectedEnvironmentKeys.forEach((key) => {
    delete process.env[key];
  });
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  const diagnostic =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          ...("code" in error && typeof error.code === "string" ? { code: error.code } : {}),
          ...("exitCode" in error && (typeof error.exitCode === "number" || error.exitCode === null)
            ? { exitCode: error.exitCode }
            : {}),
          ...("signal" in error && (typeof error.signal === "string" || error.signal === null)
            ? { signal: error.signal }
            : {}),
          observedProgress,
        }
      : { name: "UnknownError", message: "Renderer child test failed" };
  console.error(JSON.stringify(diagnostic));
  process.exitCode = 1;
});
