import { API_BASE_URL } from "@/config/api";
import { createApiError } from "@/lib/apiError";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import type {
  DocumentClassification,
  DocumentIntelligenceProgress,
  DocumentIntelligenceStage,
  DocumentIntelligenceStatus,
  PublicDocumentIntelligenceSession,
} from "../../shared/documentIntelligenceTypes";

const STATUSES = new Set<DocumentIntelligenceStatus>([
  "preparing",
  "queued",
  "extracting",
  "ready",
  "failed",
  "cancelled",
]);
const STAGES = new Set<DocumentIntelligenceStage>([
  "uploaded",
  "queued",
  "opening",
  "inspecting-pages",
  "extracting-text",
  "classifying",
  "chunking",
  "ready",
  "failed",
  "cancelled",
]);
const CLASSIFICATIONS = new Set<DocumentClassification>([
  "native-vector-searchable",
  "searchable-low-vector",
  "mixed-content",
  "image-only",
  "empty-or-unsupported",
]);

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function progress(value: unknown): value is DocumentIntelligenceProgress {
  if (!record(value)) return false;
  if (value.mode === "indeterminate") return Object.keys(value).length === 1;
  return (
    Object.keys(value).every((key) => ["mode", "unit", "completed", "total"].includes(key)) &&
    value.mode === "determinate" &&
    value.unit === "pages" &&
    Number.isInteger(value.completed) &&
    Number.isInteger(value.total) &&
    Number(value.completed) >= 0 &&
    Number(value.total) > 0 &&
    Number(value.completed) <= Number(value.total)
  );
}

export function validateDocumentIntelligenceResponse(
  value: unknown,
): PublicDocumentIntelligenceSession {
  if (!record(value) || !record(value.session)) throw new Error("Invalid document session response.");
  const session = value.session;
  if (
    typeof session.id !== "string" ||
    typeof session.status !== "string" ||
    !STATUSES.has(session.status as DocumentIntelligenceStatus) ||
    typeof session.stage !== "string" ||
    !STAGES.has(session.stage as DocumentIntelligenceStage) ||
    typeof session.message !== "string" ||
    !progress(session.progress) ||
    !Number.isInteger(session.revision) ||
    typeof session.originalFilename !== "string" ||
    typeof session.searchableTextAvailable !== "boolean" ||
    typeof session.ocrRequired !== "boolean" ||
    typeof session.createdAt !== "string" ||
    typeof session.updatedAt !== "string" ||
    typeof session.ready !== "boolean"
  ) {
    throw new Error("Invalid document session response.");
  }
  if (
    session.documentClassification !== undefined &&
    (typeof session.documentClassification !== "string" ||
      !CLASSIFICATIONS.has(session.documentClassification as DocumentClassification))
  ) {
    throw new Error("Invalid document session response.");
  }
  if (
    (session.pageCount !== undefined &&
      (!Number.isInteger(session.pageCount) || Number(session.pageCount) < 0)) ||
    (session.pageDimensions !== undefined &&
      (!Array.isArray(session.pageDimensions) ||
        !session.pageDimensions.every(
          (dimension) =>
            record(dimension) &&
            Number.isInteger(dimension.pageIndex) &&
            typeof dimension.width === "number" &&
            Number.isFinite(dimension.width) &&
            dimension.width > 0 &&
            typeof dimension.height === "number" &&
            Number.isFinite(dimension.height) &&
            dimension.height > 0 &&
            typeof dimension.rotation === "number" &&
            [0, 90, 180, 270].includes(dimension.rotation),
        ))) ||
    (session.error !== undefined &&
      (!record(session.error) ||
        typeof session.error.code !== "string" ||
        typeof session.error.message !== "string"))
  ) {
    throw new Error("Invalid document session response.");
  }
  return session as PublicDocumentIntelligenceSession;
}

async function read(response: Response) {
  if (!response.ok) throw await createApiError(response, "The document could not be inspected.");
  return validateDocumentIntelligenceResponse(await response.json());
}

export function validateSummaryPdfFile(file: File) {
  const mime = file.type.toLowerCase();
  if (
    !file.name.toLowerCase().endsWith(".pdf") ||
    (mime && !["application/pdf", "application/x-pdf", "application/octet-stream"].includes(mime))
  ) {
    throw new Error("Please select one PDF file.");
  }
  if (!file.size) throw new Error("The selected PDF is empty.");
  if (file.size > 20 * 1024 * 1024) throw new Error("The selected PDF exceeds the 20 MB limit.");
}

export async function createDocumentIntelligenceSession(file: File, signal?: AbortSignal) {
  validateSummaryPdfFile(file);
  const form = new FormData();
  form.append("file", file);
  return read(
    await fetchWithTimeout(`${API_BASE_URL}/api/document-intelligence/sessions`, {
      method: "POST",
      body: form,
      signal,
      timeoutMs: 180_000,
    }),
  );
}

export async function getDocumentIntelligenceSession(id: string, signal?: AbortSignal) {
  return read(
    await fetchWithTimeout(
      `${API_BASE_URL}/api/document-intelligence/sessions/${encodeURIComponent(id)}`,
      { signal, timeoutMs: 30_000 },
    ),
  );
}

export async function cancelDocumentIntelligenceSession(id: string, signal?: AbortSignal) {
  return read(
    await fetchWithTimeout(
      `${API_BASE_URL}/api/document-intelligence/sessions/${encodeURIComponent(id)}`,
      { method: "DELETE", signal, timeoutMs: 130_000 },
    ),
  );
}
