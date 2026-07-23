import type {
  PublicSummaryJob,
  SummaryMode,
  SummaryResult,
  SummaryStage,
  SummaryStatus,
} from "./summaryTypes";
import type { DocumentIntelligenceProgress } from "../../../shared/documentIntelligenceTypes";

const STATUSES = new Set<SummaryStatus>(["queued", "summarizing", "ready", "failed", "cancelled"]);
const STAGES = new Set<SummaryStage>([
  "queued",
  "preparing-context",
  "selecting-sentences",
  "building-key-points",
  "finding-possible-actions",
  "building-page-summaries",
  "finalizing",
  "ready",
  "failed",
  "cancelled",
]);
const MODES = new Set<SummaryMode>(["brief", "detailed", "page-by-page"]);

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pageReferences(value: unknown) {
  return (
    Array.isArray(value) &&
    value.every((page) => Number.isInteger(page) && page > 0) &&
    value.every((page, index) => index === 0 || page > value[index - 1])
  );
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

export function validateSummaryJobResponse(value: unknown): PublicSummaryJob {
  if (!record(value) || !record(value.summary)) throw new Error("Invalid summary response.");
  const job = value.summary;
  if (
    typeof job.id !== "string" ||
    typeof job.documentSessionId !== "string" ||
    typeof job.status !== "string" ||
    !STATUSES.has(job.status as SummaryStatus) ||
    typeof job.stage !== "string" ||
    !STAGES.has(job.stage as SummaryStage) ||
    typeof job.message !== "string" ||
    !progress(job.progress) ||
    typeof job.mode !== "string" ||
    !MODES.has(job.mode as SummaryMode) ||
    typeof job.createdAt !== "string" ||
    typeof job.updatedAt !== "string" ||
    typeof job.ready !== "boolean" ||
    typeof job.resultReady !== "boolean" ||
    (job.error !== undefined &&
      (!record(job.error) ||
        typeof job.error.code !== "string" ||
        typeof job.error.message !== "string"))
  ) {
    throw new Error("Invalid summary response.");
  }
  return job as PublicSummaryJob;
}

export function validateSummaryResult(value: unknown): SummaryResult {
  const classifications = new Set([
    "native-vector-searchable",
    "searchable-low-vector",
    "mixed-content",
    "image-only",
    "empty-or-unsupported",
  ]);
  if (
    !record(value) ||
    value.schemaVersion !== "1.0" ||
    value.generationMethod !== "deterministic-extractive" ||
    typeof value.mode !== "string" ||
    !MODES.has(value.mode as SummaryMode) ||
    typeof value.documentClassification !== "string" ||
    !classifications.has(value.documentClassification) ||
    typeof value.overview !== "string" ||
    !Array.isArray(value.keyPoints) ||
    !Array.isArray(value.possibleActionItems) ||
    !Array.isArray(value.pageSummaries) ||
    !Array.isArray(value.limitations) ||
    typeof value.generatedAt !== "string"
  ) {
    throw new Error("Invalid summary result.");
  }
  const validItem = (item: unknown) =>
    record(item) &&
    typeof item.id === "string" &&
    typeof item.text === "string" &&
    pageReferences(item.pageReferences);
  if (
    !value.keyPoints.every(validItem) ||
    !value.possibleActionItems.every(validItem) ||
    !value.pageSummaries.every(
      (page) =>
        record(page) &&
        Number.isInteger(page.pageNumber) &&
        Number(page.pageNumber) > 0 &&
        typeof page.summary === "string",
    ) ||
    !value.limitations.every((limitation) => typeof limitation === "string")
  ) {
    throw new Error("Invalid summary result.");
  }
  return value as SummaryResult;
}
