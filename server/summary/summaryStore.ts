import { randomUUID } from "node:crypto";
import type { PublicSummaryJob, SummaryOptions, SummaryResult } from "../../shared/summaryTypes.js";
import type { SummaryJobRecord, SummaryProgressUpdate } from "./summaryTypes.js";

export const SUMMARY_LIMITS = {
  maximumJobsPerDocument: 5,
  maximumLiveJobs: 25,
  maximumQueuedJobs: 10,
  maximumActiveJobs: 1,
  expirationMs: 25 * 60 * 1000,
  cleanupIntervalMs: 60 * 1000,
} as const;

const jobs = new Map<string, SummaryJobRecord>();
let shutdown = false;
let expirationHandler: ((id: string) => void) | undefined;

function expiration() {
  return new Date(Date.now() + SUMMARY_LIMITS.expirationMs);
}

function clearResult(job: SummaryJobRecord) {
  if (!job.result) return;
  job.result.overview = "";
  for (const item of [...job.result.keyPoints, ...job.result.possibleActionItems]) {
    item.text = "";
    item.pageReferences.length = 0;
  }
  for (const page of job.result.pageSummaries) page.summary = "";
  job.result.keyPoints.length = 0;
  job.result.possibleActionItems.length = 0;
  job.result.pageSummaries.length = 0;
  job.result.limitations.length = 0;
  job.result = undefined;
}

export function setSummaryExpirationHandler(handler: (id: string) => void) {
  expirationHandler = handler;
}

export function serializeSummaryJob(job: SummaryJobRecord): PublicSummaryJob {
  return {
    id: job.id,
    documentSessionId: job.documentSessionId,
    status: job.status,
    stage: job.stage,
    message: job.message,
    progress: { ...job.progress },
    mode: job.options.mode,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    ready: job.status === "ready",
    resultReady: job.status === "ready" && Boolean(job.result),
    ...(job.error ? { error: { ...job.error } } : {}),
  };
}

export function createSummaryJob(documentSessionId: string, options: SummaryOptions) {
  if (shutdown || jobs.size >= SUMMARY_LIMITS.maximumLiveJobs) {
    throw new Error("SUMMARY_QUEUE_FULL");
  }
  const documentJobs = [...jobs.values()].filter(
    (job) => job.documentSessionId === documentSessionId,
  ).length;
  if (documentJobs >= SUMMARY_LIMITS.maximumJobsPerDocument) {
    throw new Error("SUMMARY_QUEUE_FULL");
  }
  const now = new Date();
  const job: SummaryJobRecord = {
    id: randomUUID(),
    documentSessionId,
    status: "queued",
    stage: "queued",
    message: "The extractive summary is queued.",
    progress: { mode: "indeterminate" },
    options: { ...options },
    createdAt: now,
    updatedAt: now,
    expiresAt: expiration(),
    abortController: new AbortController(),
  };
  jobs.set(job.id, job);
  return job;
}

export function getSummaryJob(id: string) {
  const job = jobs.get(id);
  if (!job) return undefined;
  if (job.expiresAt.getTime() <= Date.now()) {
    expirationHandler?.(id);
    deleteSummaryJob(id);
    return undefined;
  }
  return job;
}

export function updateSummaryJob(id: string, update: SummaryProgressUpdate) {
  const job = getSummaryJob(id);
  if (!job || ["ready", "failed", "cancelled"].includes(job.status)) return job;
  job.status = "summarizing";
  job.stage = update.stage;
  job.message = update.message;
  job.progress = { ...update.progress };
  job.updatedAt = new Date();
  job.expiresAt = expiration();
  return job;
}

export function completeSummaryJob(id: string, result: SummaryResult) {
  const job = getSummaryJob(id);
  if (!job || ["ready", "failed", "cancelled"].includes(job.status)) return undefined;
  job.result = result;
  job.status = "ready";
  job.stage = "ready";
  job.message = "The extractive summary is ready.";
  job.progress = { mode: "indeterminate" };
  job.updatedAt = new Date();
  job.expiresAt = expiration();
  return job;
}

export function failSummaryJob(id: string, code: string) {
  const job = getSummaryJob(id);
  if (!job || ["ready", "cancelled"].includes(job.status)) return job;
  clearResult(job);
  job.status = "failed";
  job.stage = "failed";
  job.message = "The extractive summary could not be created.";
  job.progress = { mode: "indeterminate" };
  job.error = {
    code,
    message: "The summary could not be created from this document.",
  };
  job.updatedAt = new Date();
  return job;
}

export function cancelSummaryJob(id: string) {
  const job = getSummaryJob(id);
  if (!job) return undefined;
  if (job.status === "cancelled") return job;
  if (job.status === "ready" || job.status === "failed") {
    deleteSummaryJob(id);
    return undefined;
  }
  job.abortController.abort();
  clearResult(job);
  job.status = "cancelled";
  job.stage = "cancelled";
  job.message = "Summary creation was cancelled.";
  job.progress = { mode: "indeterminate" };
  job.updatedAt = new Date();
  return job;
}

export function getSummaryResult(id: string) {
  const job = getSummaryJob(id);
  if (!job?.result || job.status !== "ready") return undefined;
  return structuredClone(job.result);
}

export function deleteSummaryJob(id: string) {
  const job = jobs.get(id);
  if (!job) return false;
  job.abortController.abort();
  clearResult(job);
  return jobs.delete(id);
}

export function cleanupExpiredSummaryJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.expiresAt.getTime() <= now) {
      expirationHandler?.(id);
      deleteSummaryJob(id);
    }
  }
}

export function getSummaryStoreMetrics() {
  return { jobs: jobs.size };
}

const cleanupTimer = setInterval(cleanupExpiredSummaryJobs, SUMMARY_LIMITS.cleanupIntervalMs);
cleanupTimer.unref();

export function closeSummaryStore() {
  if (shutdown) return;
  shutdown = true;
  clearInterval(cleanupTimer);
  for (const id of [...jobs.keys()]) deleteSummaryJob(id);
}
