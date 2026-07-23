/// <reference types="node" />
/// <reference lib="esnext.float16" />

import { extractDocumentIntelligence } from "./documentIntelligenceExtractorCore.js";
import {
  DOCUMENT_INTELLIGENCE_ENVIRONMENT_KEYS,
  isExtractionParentMessage,
  type ExtractionChildMessage,
  type ExtractionParentMessage,
  type ExtractionRequest,
} from "./documentIntelligenceProtocol.js";

const allowedKeys = new Set<string>(DOCUMENT_INTELLIGENCE_ENVIRONMENT_KEYS);
for (const key of Object.keys(process.env)) {
  if (!allowedKeys.has(key)) delete process.env[key];
}

let requestReceived = false;
let settled = false;
let activeRequestId: string | undefined;
let abortController: AbortController | undefined;

function send(message: ExtractionChildMessage) {
  return new Promise<void>((resolve) => {
    if (!process.send || !process.connected) {
      resolve();
      return;
    }
    process.send(message, () => resolve());
  });
}

function finish() {
  if (process.connected) process.disconnect();
}

function errorCode(error: unknown): Extract<ExtractionChildMessage, { kind: "failed" }>["code"] {
  if (
    error instanceof Error &&
    [
      "DOCUMENT_INTELLIGENCE_PAGE_LIMIT",
      "DOCUMENT_INTELLIGENCE_COMPLEXITY_LIMIT",
      "DOCUMENT_INTELLIGENCE_ENCRYPTED_PDF",
    ].includes(error.message)
  ) {
    return error.message as
      | "DOCUMENT_INTELLIGENCE_PAGE_LIMIT"
      | "DOCUMENT_INTELLIGENCE_COMPLEXITY_LIMIT"
      | "DOCUMENT_INTELLIGENCE_ENCRYPTED_PDF";
  }
  return "DOCUMENT_INTELLIGENCE_EXTRACTION_FAILED";
}

async function processRequest(message: ExtractionRequest) {
  activeRequestId = message.requestId;
  abortController = new AbortController();
  const inputCopy = Uint8Array.from(message.pdfBytes);
  message.pdfBytes.fill(0);
  try {
    const context = await extractDocumentIntelligence(inputCopy, {
      signal: abortController.signal,
      onProgress: (completed, total) => {
        void send({ kind: "progress", requestId: message.requestId, completed, total });
      },
    });
    if (abortController.signal.aborted) throw new DOMException("Cancelled", "AbortError");
    settled = true;
    await send({
      kind: "completed",
      requestId: message.requestId,
      context,
      environmentKeys: Object.keys(process.env).sort(),
    });
  } catch (error) {
    settled = true;
    if (abortController.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      await send({ kind: "cancelled", requestId: message.requestId });
    } else {
      await send({ kind: "failed", requestId: message.requestId, code: errorCode(error) });
      process.exitCode = 1;
    }
  } finally {
    inputCopy.fill(0);
    finish();
  }
}

async function handle(value: unknown) {
  if (!isExtractionParentMessage(value)) {
    if (!settled) {
      settled = true;
      await send({ kind: "failed", code: "INVALID_IPC_MESSAGE" });
      process.exitCode = 1;
      finish();
    }
    return;
  }
  const message: ExtractionParentMessage = value;
  if (message.kind === "cancel") {
    if (activeRequestId === undefined || activeRequestId === message.requestId) {
      abortController?.abort();
      if (!requestReceived && !settled) {
        settled = true;
        await send({ kind: "cancelled", requestId: message.requestId });
        finish();
      }
    }
    return;
  }
  if (requestReceived || settled) {
    settled = true;
    await send({ kind: "failed", requestId: message.requestId, code: "INVALID_IPC_MESSAGE" });
    process.exitCode = 1;
    finish();
    return;
  }
  requestReceived = true;
  await processRequest(message);
}

process.on("message", (value: unknown) => void handle(value));
process.on("disconnect", () => abortController?.abort());
void send({ kind: "ready" });
