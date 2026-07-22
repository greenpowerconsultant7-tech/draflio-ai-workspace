/// <reference types="node" />
/// <reference lib="esnext.float16" />

import { rasterRedactPdf } from "./redactionRasterEngine.js";
import {
  isRendererParentMessage,
  REDACTION_RENDERER_ENVIRONMENT_KEYS,
  type RendererChildMessage,
  type RendererParentMessage,
  type RendererRequestMessage,
} from "./redactionRendererProtocol.js";

const allowedEnvironmentKeys = new Set<string>(REDACTION_RENDERER_ENVIRONMENT_KEYS);
for (const key of Object.keys(process.env)) {
  if (!allowedEnvironmentKeys.has(key)) {
    delete process.env[key];
  }
}

let activeRequestId: string | undefined;
let abortController: AbortController | undefined;
let requestReceived = false;
let settled = false;

function send(message: RendererChildMessage): Promise<void> {
  return new Promise((resolve) => {
    if (!process.send || !process.connected) {
      resolve();
      return;
    }
    process.send(message, (error) => {
      if (error) {
        process.exitCode = 1;
      }
      resolve();
    });
  });
}

function exitAfterMessage(): void {
  if (process.connected) {
    process.disconnect();
  }
  process.exitCode ??= 0;
}

function dimensionsMatch(
  actual: Array<{ width: number; height: number }>,
  expected: Array<{ width: number; height: number }>,
): boolean {
  return (
    actual.length === expected.length &&
    actual.every(
      (dimension, index) =>
        Math.abs(dimension.width - expected[index].width) <= 0.01 &&
        Math.abs(dimension.height - expected[index].height) <= 0.01,
    )
  );
}

async function processRequest(message: RendererRequestMessage): Promise<void> {
  activeRequestId = message.requestId;
  abortController = new AbortController();
  const inputCopy = new Uint8Array(message.pdfBytes.byteLength);
  inputCopy.set(message.pdfBytes);
  message.pdfBytes.fill(0);
  try {
    const result = await rasterRedactPdf(inputCopy, {
      dpi: message.dpi,
      rectangles: message.rectangles,
      signal: abortController.signal,
      onProgress: (progress) => {
        void send({ kind: "progress", requestId: message.requestId, progress });
      },
    });
    if (
      result.metrics.pageCount !== message.expected.pageCount ||
      !dimensionsMatch(result.pageDimensions, message.expected.pageDimensions)
    ) {
      result.bytes.fill(0);
      settled = true;
      await send({
        kind: "failed",
        requestId: message.requestId,
        code: "EXPECTED_DOCUMENT_MISMATCH",
      });
      exitAfterMessage();
      return;
    }

    const outputBytes = new Uint8Array(result.bytes.byteLength);
    outputBytes.set(result.bytes);
    result.bytes.fill(0);
    settled = true;
    await send({
      kind: "completed",
      requestId: message.requestId,
      outputBytes,
      metrics: {
        ...result.metrics,
        environmentKeys: Object.keys(process.env).sort(),
      },
    });
    outputBytes.fill(0);
    exitAfterMessage();
  } catch (error) {
    settled = true;
    if (abortController.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      await send({ kind: "cancelled", requestId: message.requestId });
    } else {
      await send({
        kind: "failed",
        requestId: message.requestId,
        code: "RENDERER_PROCESSING_FAILED",
      });
      process.exitCode = 1;
    }
    exitAfterMessage();
  } finally {
    inputCopy.fill(0);
  }
}

async function handleMessage(value: unknown): Promise<void> {
  if (!isRendererParentMessage(value)) {
    if (!settled) {
      settled = true;
      await send({ kind: "failed", code: "INVALID_IPC_MESSAGE" });
      process.exitCode = 1;
      exitAfterMessage();
    }
    return;
  }

  const message: RendererParentMessage = value;
  if (message.kind === "cancel") {
    if (message.requestId !== activeRequestId && activeRequestId !== undefined) {
      return;
    }
    abortController?.abort();
    if (!requestReceived && !settled) {
      settled = true;
      await send({ kind: "cancelled", requestId: message.requestId });
      exitAfterMessage();
    }
    return;
  }

  if (requestReceived || settled) {
    settled = true;
    await send({ kind: "failed", requestId: message.requestId, code: "INVALID_IPC_MESSAGE" });
    process.exitCode = 1;
    exitAfterMessage();
    return;
  }
  requestReceived = true;
  await processRequest(message);
}

process.on("message", (message: unknown) => {
  void handleMessage(message);
});

process.on("disconnect", () => {
  abortController?.abort();
});

void send({ kind: "ready" });
