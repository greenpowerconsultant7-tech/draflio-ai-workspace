import { ApiError } from "../errors/apiError.js";
import {
  getDocumentIntelligenceContext,
  getDocumentIntelligenceSession,
  serializeDocumentIntelligenceSession,
} from "../documentIntelligence/documentIntelligenceSessionStore.js";
import { validateDocumentIntelligenceSessionId } from "../documentIntelligence/documentIntelligenceValidator.js";
import type { SummaryOptions } from "../../shared/summaryTypes.js";
import { enqueueSummaryJob, removeQueuedSummaryJob } from "./summaryQueue.js";
import {
  cancelSummaryJob,
  createSummaryJob,
  deleteSummaryJob,
  getSummaryJob,
  getSummaryResult,
  serializeSummaryJob,
} from "./summaryStore.js";
import { validateSummaryId } from "./summaryValidation.js";

function summaryNotFound(): never {
  throw new ApiError({
    statusCode: 404,
    code: "SUMMARY_SESSION_NOT_FOUND",
    message: "The summary session was not found.",
  });
}

export function createSummary(documentIdValue: string, options: SummaryOptions) {
  const documentSessionId = validateDocumentIntelligenceSessionId(documentIdValue);
  const document = getDocumentIntelligenceSession(documentSessionId);
  if (!document) {
    throw new ApiError({
      statusCode: 404,
      code: "DOCUMENT_INTELLIGENCE_SESSION_NOT_FOUND",
      message: "The document session was not found.",
    });
  }
  const publicDocument = serializeDocumentIntelligenceSession(document);
  if (document.status !== "ready") {
    throw new ApiError({
      statusCode: 409,
      code: "SUMMARY_DOCUMENT_NOT_READY",
      message: "The document is not ready to summarize.",
    });
  }
  if (!publicDocument.searchableTextAvailable) {
    throw new ApiError({
      statusCode: 409,
      code: "SUMMARY_DOCUMENT_NOT_SEARCHABLE",
      message:
        "This PDF does not contain enough searchable text to summarize. Run Smart OCR first, then summarize the searchable PDF.",
    });
  }
  getDocumentIntelligenceContext(documentSessionId);
  let job;
  try {
    job = createSummaryJob(documentSessionId, options);
    enqueueSummaryJob(job.id);
  } catch (error) {
    if (job) deleteSummaryJob(job.id);
    if (error instanceof Error && error.message === "SUMMARY_QUEUE_FULL") {
      throw new ApiError({
        statusCode: 503,
        code: "SUMMARY_QUEUE_FULL",
        message: "Summary capacity is currently full.",
      });
    }
    throw error;
  }
  return serializeSummaryJob(job);
}

export function getPublicSummary(idValue: string) {
  const job = getSummaryJob(validateSummaryId(idValue));
  if (!job) return summaryNotFound();
  return serializeSummaryJob(job);
}

export function getPublicSummaryResult(idValue: string) {
  const id = validateSummaryId(idValue);
  const job = getSummaryJob(id);
  if (!job) return summaryNotFound();
  if (job.status !== "ready" || !job.result) {
    throw new ApiError({
      statusCode: 409,
      code: "SUMMARY_RESULT_NOT_READY",
      message:
        job.status === "failed"
          ? "The summary could not be created."
          : job.status === "cancelled"
            ? "Summary creation was cancelled."
            : "The summary result is not ready.",
    });
  }
  const result = getSummaryResult(id);
  if (!result) throw new Error("SUMMARY_RESULT_NOT_READY");
  return result;
}

export function cancelPublicSummary(idValue: string) {
  const id = validateSummaryId(idValue);
  const job = getSummaryJob(id);
  if (!job) return summaryNotFound();
  removeQueuedSummaryJob(id);
  const before = serializeSummaryJob(job);
  const cancelled = cancelSummaryJob(id);
  return (
    cancelled
      ? serializeSummaryJob(cancelled)
      : {
          ...before,
          status: "cancelled",
          stage: "cancelled",
          message: "The summary was deleted.",
          ready: false,
          resultReady: false,
        }
  );
}
