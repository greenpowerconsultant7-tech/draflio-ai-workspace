import { randomUUID } from "node:crypto";
import type { PublicDocumentIntelligenceSession } from "../../shared/documentIntelligenceTypes.js";
import type {
  DocumentIntelligenceContext,
  DocumentIntelligenceSessionRecord,
} from "./documentIntelligenceTypes.js";

export const DOCUMENT_INTELLIGENCE_LIMITS = {
  maximumInputBytes: 20 * 1024 * 1024,
  maximumPages: 50,
  maximumLiveSessions: 25,
  maximumQueuedExtractions: 10,
  maximumActiveExtractions: 1,
  maximumRetainedInputBytes: 200 * 1024 * 1024,
  maximumRetainedTextBytes: 50 * 1024 * 1024,
  expirationMs: 25 * 60 * 1000,
  cleanupIntervalMs: 60 * 1000,
} as const;

const sessions = new Map<string, DocumentIntelligenceSessionRecord>();
let retainedInputBytes = 0;
let retainedTextBytes = 0;
let shutdown = false;
let expirationHandler: ((sessionId: string) => void) | undefined;

function expiry() {
  return new Date(Date.now() + DOCUMENT_INTELLIGENCE_LIMITS.expirationMs);
}

function contextTextBytes(context: DocumentIntelligenceContext) {
  return (
    context.pages.reduce((sum, page) => sum + Buffer.byteLength(page.text), 0) +
    context.chunks.reduce((sum, chunk) => sum + Buffer.byteLength(chunk.text), 0)
  );
}

function clearContext(context: DocumentIntelligenceContext | undefined) {
  if (!context) return;
  for (const page of context.pages) {
    page.text = "";
    for (const item of page.items) item.text = "";
    page.items.length = 0;
  }
  for (const chunk of context.chunks) chunk.text = "";
  context.pages.length = 0;
  context.chunks.length = 0;
  context.pageDimensions.length = 0;
}

function releaseInput(session: DocumentIntelligenceSessionRecord) {
  if (!session.inputBytes) return;
  retainedInputBytes -= session.inputBytes.byteLength;
  session.inputBytes.fill(0);
  session.inputBytes = undefined;
}

function releaseContext(session: DocumentIntelligenceSessionRecord) {
  if (!session.context) return;
  retainedTextBytes -= contextTextBytes(session.context);
  clearContext(session.context);
  session.context = undefined;
}

export function setDocumentIntelligenceExpirationHandler(handler: (sessionId: string) => void) {
  expirationHandler = handler;
}

export function serializeDocumentIntelligenceSession(
  session: DocumentIntelligenceSessionRecord,
): PublicDocumentIntelligenceSession {
  const context = session.context;
  const classification = context?.classification;
  const searchable =
    classification === "native-vector-searchable" ||
    classification === "searchable-low-vector" ||
    classification === "mixed-content";
  return {
    id: session.id,
    status: session.status,
    stage: session.stage,
    message: session.message,
    progress: { ...session.progress },
    revision: session.revision,
    originalFilename: session.originalFilename,
    ...(context
      ? {
          pageCount: context.pageDimensions.length,
          pageDimensions: context.pageDimensions.map((dimension) => ({ ...dimension })),
          documentClassification: context.classification,
        }
      : {}),
    searchableTextAvailable: searchable,
    ocrRequired:
      classification === "image-only" || classification === "empty-or-unsupported",
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    ready: session.status === "ready",
    ...(session.error ? { error: { ...session.error } } : {}),
  };
}

export function createDocumentIntelligenceSession(filename: string, input: Uint8Array) {
  if (shutdown) throw new Error("DOCUMENT_INTELLIGENCE_QUEUE_FULL");
  if (
    sessions.size >= DOCUMENT_INTELLIGENCE_LIMITS.maximumLiveSessions ||
    retainedInputBytes + input.byteLength >
      DOCUMENT_INTELLIGENCE_LIMITS.maximumRetainedInputBytes
  ) {
    throw new Error("DOCUMENT_INTELLIGENCE_QUEUE_FULL");
  }
  const now = new Date();
  const bytes = Uint8Array.from(input);
  retainedInputBytes += bytes.byteLength;
  const session: DocumentIntelligenceSessionRecord = {
    id: randomUUID(),
    status: "preparing",
    stage: "uploaded",
    message: "The PDF was accepted for document inspection.",
    progress: { mode: "indeterminate" },
    revision: 1,
    originalFilename: filename,
    createdAt: now,
    updatedAt: now,
    expiresAt: expiry(),
    inputBytes: bytes,
    abortController: new AbortController(),
  };
  sessions.set(session.id, session);
  return session;
}

export function getDocumentIntelligenceSession(id: string) {
  const session = sessions.get(id);
  if (!session) return undefined;
  if (session.expiresAt.getTime() <= Date.now()) {
    expirationHandler?.(id);
    deleteDocumentIntelligenceSession(id);
    return undefined;
  }
  return session;
}

export function updateDocumentIntelligenceSession(
  id: string,
  update: Partial<
    Pick<
      DocumentIntelligenceSessionRecord,
      "status" | "stage" | "message" | "progress" | "error"
    >
  >,
) {
  const session = getDocumentIntelligenceSession(id);
  if (!session || ["ready", "failed", "cancelled"].includes(session.status)) return session;
  Object.assign(session, update);
  session.revision += 1;
  session.updatedAt = new Date();
  session.expiresAt = expiry();
  return session;
}

export function completeDocumentIntelligenceSession(
  id: string,
  context: DocumentIntelligenceContext,
) {
  const session = getDocumentIntelligenceSession(id);
  if (!session || session.status === "cancelled") {
    clearContext(context);
    return undefined;
  }
  const textBytes = contextTextBytes(context);
  if (
    retainedTextBytes + textBytes >
    DOCUMENT_INTELLIGENCE_LIMITS.maximumRetainedTextBytes
  ) {
    clearContext(context);
    throw new Error("DOCUMENT_INTELLIGENCE_COMPLEXITY_LIMIT");
  }
  retainedTextBytes += textBytes;
  session.context = context;
  releaseInput(session);
  session.status = "ready";
  session.stage = "ready";
  session.message = "Document inspection is ready.";
  session.progress = {
    mode: "determinate",
    unit: "pages",
    completed: context.pageDimensions.length,
    total: context.pageDimensions.length,
  };
  session.revision += 1;
  session.updatedAt = new Date();
  session.expiresAt = expiry();
  return session;
}

export function cancelDocumentIntelligenceSession(id: string) {
  const session = getDocumentIntelligenceSession(id);
  if (!session) return undefined;
  if (session.status === "cancelled") return session;
  if (session.status === "ready" || session.status === "failed") {
    deleteDocumentIntelligenceSession(id);
    return undefined;
  }
  session.abortController.abort();
  releaseInput(session);
  releaseContext(session);
  session.status = "cancelled";
  session.stage = "cancelled";
  session.message = "Document inspection was cancelled.";
  session.progress = { mode: "indeterminate" };
  session.revision += 1;
  session.updatedAt = new Date();
  return session;
}

export function failDocumentIntelligenceSession(id: string, code: string) {
  const session = getDocumentIntelligenceSession(id);
  if (!session || session.status === "cancelled" || session.status === "ready") return session;
  releaseInput(session);
  releaseContext(session);
  session.status = "failed";
  session.stage = "failed";
  session.message = "Document inspection failed.";
  session.error = { code, message: "The PDF could not be inspected." };
  session.revision += 1;
  session.updatedAt = new Date();
  return session;
}

export function deleteDocumentIntelligenceSession(id: string) {
  const session = sessions.get(id);
  if (!session) return false;
  session.abortController.abort();
  releaseInput(session);
  releaseContext(session);
  return sessions.delete(id);
}

function cloneContext(context: DocumentIntelligenceContext): DocumentIntelligenceContext {
  return {
    classification: context.classification,
    pageDimensions: context.pageDimensions.map((dimension) => ({ ...dimension })),
    pages: context.pages.map((page) => ({
      pageIndex: page.pageIndex,
      text: page.text,
      items: page.items.map((item) => ({ ...item })),
      evidence: { ...page.evidence },
    })),
    chunks: context.chunks.map((chunk) => ({ ...chunk })),
  };
}

export function getDocumentIntelligenceContext(id: string) {
  const session = getDocumentIntelligenceSession(id);
  if (!session || session.status !== "ready" || !session.context) {
    throw new Error("DOCUMENT_INTELLIGENCE_NOT_READY");
  }
  return cloneContext(session.context);
}

export function getDocumentIntelligenceStoreMetrics() {
  return {
    sessions: sessions.size,
    retainedInputBytes,
    retainedTextBytes,
  };
}

export function cleanupExpiredDocumentIntelligenceSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt.getTime() <= now) {
      expirationHandler?.(id);
      deleteDocumentIntelligenceSession(id);
    }
  }
}

const cleanupTimer = setInterval(
  cleanupExpiredDocumentIntelligenceSessions,
  DOCUMENT_INTELLIGENCE_LIMITS.cleanupIntervalMs,
);
cleanupTimer.unref();

export function closeDocumentIntelligenceStore() {
  if (shutdown) return;
  shutdown = true;
  clearInterval(cleanupTimer);
  for (const id of [...sessions.keys()]) deleteDocumentIntelligenceSession(id);
}
