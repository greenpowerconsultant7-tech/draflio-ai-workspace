import { runIsolatedDocumentExtraction } from "./documentIntelligenceExtractorClient.js";
import {
  completeDocumentIntelligenceSession,
  DOCUMENT_INTELLIGENCE_LIMITS,
  failDocumentIntelligenceSession,
  getDocumentIntelligenceSession,
  setDocumentIntelligenceExpirationHandler,
  updateDocumentIntelligenceSession,
} from "./documentIntelligenceSessionStore.js";

const waiting: string[] = [];
let activeSessionId: string | undefined;
let shutdown = false;

export function getDocumentIntelligenceQueueMetrics() {
  return { waiting: waiting.length, active: activeSessionId ? 1 : 0 };
}

export function enqueueDocumentIntelligenceSession(id: string) {
  if (
    shutdown ||
    waiting.includes(id) ||
    activeSessionId === id ||
    waiting.length >= DOCUMENT_INTELLIGENCE_LIMITS.maximumQueuedExtractions
  ) {
    throw new Error("DOCUMENT_INTELLIGENCE_QUEUE_FULL");
  }
  waiting.push(id);
  updateDocumentIntelligenceSession(id, {
    status: "queued",
    stage: "queued",
    message: "Document inspection is queued.",
  });
  queueMicrotask(() => {
    void drain();
  });
}

export function removeQueuedDocumentIntelligenceSession(id: string) {
  const index = waiting.indexOf(id);
  if (index >= 0) waiting.splice(index, 1);
}

async function processSession(id: string) {
  const session = getDocumentIntelligenceSession(id);
  if (!session?.inputBytes || session.status === "cancelled") return;
  updateDocumentIntelligenceSession(id, {
    status: "extracting",
    stage: "opening",
    message: "Opening the PDF in an isolated parser.",
    progress: { mode: "indeterminate" },
  });
  try {
    const result = await runIsolatedDocumentExtraction({
      bytes: session.inputBytes,
      signal: session.abortController.signal,
      onProgress: (completed, total) => {
        updateDocumentIntelligenceSession(id, {
          status: "extracting",
          stage: "extracting-text",
          message: "Inspecting searchable page content.",
          progress: { mode: "determinate", unit: "pages", completed, total },
        });
      },
    });
    completeDocumentIntelligenceSession(id, result.context);
  } catch (error) {
    if (
      session.abortController.signal.aborted ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      return;
    }
    const code =
      error instanceof Error &&
      [
        "DOCUMENT_INTELLIGENCE_PAGE_LIMIT",
        "DOCUMENT_INTELLIGENCE_COMPLEXITY_LIMIT",
        "DOCUMENT_INTELLIGENCE_ENCRYPTED_PDF",
      ].includes(error.message)
        ? error.message
        : "DOCUMENT_INTELLIGENCE_EXTRACTION_FAILED";
    failDocumentIntelligenceSession(id, code);
  }
}

async function drain() {
  if (shutdown || activeSessionId) return;
  const id = waiting.shift();
  if (!id) return;
  activeSessionId = id;
  try {
    await processSession(id);
  } finally {
    activeSessionId = undefined;
    void drain();
  }
}

setDocumentIntelligenceExpirationHandler(removeQueuedDocumentIntelligenceSession);

export async function closeDocumentIntelligenceQueue() {
  if (shutdown) return;
  shutdown = true;
  waiting.length = 0;
  const active = activeSessionId
    ? getDocumentIntelligenceSession(activeSessionId)
    : undefined;
  active?.abortController.abort();
  const deadline = Date.now() + DOCUMENT_INTELLIGENCE_CANCELLATION_WAIT_MS;
  while (activeSessionId && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const DOCUMENT_INTELLIGENCE_CANCELLATION_WAIT_MS = 4_250;
