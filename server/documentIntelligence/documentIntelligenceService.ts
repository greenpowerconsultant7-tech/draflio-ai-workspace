import { ApiError } from "../errors/apiError.js";
import {
  cancelDocumentIntelligenceSession,
  createDocumentIntelligenceSession,
  deleteDocumentIntelligenceSession,
  getDocumentIntelligenceSession,
  serializeDocumentIntelligenceSession,
} from "./documentIntelligenceSessionStore.js";
import {
  enqueueDocumentIntelligenceSession,
  removeQueuedDocumentIntelligenceSession,
} from "./documentIntelligenceQueue.js";
import { validateDocumentIntelligenceSessionId } from "./documentIntelligenceValidator.js";

function notFound(): never {
  throw new ApiError({
    statusCode: 404,
    code: "DOCUMENT_INTELLIGENCE_SESSION_NOT_FOUND",
    message: "The document session was not found.",
  });
}

export function createDocumentIntelligence(filename: string, bytes: Uint8Array) {
  let session;
  try {
    session = createDocumentIntelligenceSession(filename, bytes);
    enqueueDocumentIntelligenceSession(session.id);
  } catch (error) {
    if (session) deleteDocumentIntelligenceSession(session.id);
    if (error instanceof Error && error.message === "DOCUMENT_INTELLIGENCE_QUEUE_FULL") {
      throw new ApiError({
        statusCode: 503,
        code: "DOCUMENT_INTELLIGENCE_QUEUE_FULL",
        message: "Document inspection capacity is currently full.",
      });
    }
    throw error;
  }
  return serializeDocumentIntelligenceSession(session);
}

export function getPublicDocumentIntelligenceSession(idValue: string) {
  const id = validateDocumentIntelligenceSessionId(idValue);
  const session = getDocumentIntelligenceSession(id);
  if (!session) return notFound();
  return serializeDocumentIntelligenceSession(session);
}

export function cancelPublicDocumentIntelligenceSession(idValue: string) {
  const id = validateDocumentIntelligenceSessionId(idValue);
  const existing = getDocumentIntelligenceSession(id);
  if (!existing) return notFound();
  removeQueuedDocumentIntelligenceSession(id);
  const publicBeforeDelete = serializeDocumentIntelligenceSession(existing);
  const cancelled = cancelDocumentIntelligenceSession(id);
  if (cancelled) return serializeDocumentIntelligenceSession(cancelled);
  return {
    ...publicBeforeDelete,
    status: "cancelled" as const,
    stage: "cancelled" as const,
    message: "Document inspection data was deleted.",
    ready: false,
  };
}
