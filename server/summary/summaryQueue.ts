import { getDocumentIntelligenceContext } from "../documentIntelligence/documentIntelligenceSessionStore.js";
import { generateExtractiveSummary } from "./summaryEngine.js";
import {
  cancelSummaryJob,
  completeSummaryJob,
  failSummaryJob,
  getSummaryJob,
  setSummaryExpirationHandler,
  SUMMARY_LIMITS,
  updateSummaryJob,
} from "./summaryStore.js";

const waiting: string[] = [];
let activeId: string | undefined;
let shutdown = false;

export function enqueueSummaryJob(id: string) {
  if (
    shutdown ||
    waiting.length >= SUMMARY_LIMITS.maximumQueuedJobs ||
    waiting.includes(id) ||
    activeId === id
  ) {
    throw new Error("SUMMARY_QUEUE_FULL");
  }
  waiting.push(id);
  queueMicrotask(() => void drain());
}

export function removeQueuedSummaryJob(id: string) {
  const index = waiting.indexOf(id);
  if (index >= 0) waiting.splice(index, 1);
}

async function processJob(id: string) {
  const job = getSummaryJob(id);
  if (!job || job.status === "cancelled") return;
  try {
    const context = getDocumentIntelligenceContext(job.documentSessionId);
    const result = await generateExtractiveSummary(
      context,
      job.options,
      job.abortController.signal,
      (update) => updateSummaryJob(id, update),
    );
    completeSummaryJob(id, result);
  } catch (error) {
    if (
      job.abortController.signal.aborted ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      return;
    }
    failSummaryJob(
      id,
      error instanceof Error && error.message === "SUMMARY_COMPLEXITY_LIMIT"
        ? "SUMMARY_COMPLEXITY_LIMIT"
        : "SUMMARY_GENERATION_FAILED",
    );
  }
}

async function drain() {
  if (shutdown || activeId) return;
  const id = waiting.shift();
  if (!id) return;
  activeId = id;
  try {
    await processJob(id);
  } finally {
    activeId = undefined;
    void drain();
  }
}

setSummaryExpirationHandler(removeQueuedSummaryJob);

export function getSummaryQueueMetrics() {
  return { queued: waiting.length, active: activeId ? 1 : 0 };
}

export async function closeSummaryQueue() {
  if (shutdown) return;
  shutdown = true;
  for (const id of waiting.splice(0)) cancelSummaryJob(id);
  const active = activeId ? getSummaryJob(activeId) : undefined;
  active?.abortController.abort();
  const deadline = Date.now() + 4_250;
  while (activeId && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
