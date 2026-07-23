import assert from "node:assert/strict";
import {
  closeDocumentIntelligenceStore,
  completeDocumentIntelligenceSession,
  createDocumentIntelligenceSession,
} from "../server/documentIntelligence/documentIntelligenceSessionStore.js";
import type { DocumentIntelligenceContext } from "../server/documentIntelligence/documentIntelligenceTypes.js";
import {
  cancelPublicSummary,
  createSummary,
  getPublicSummary,
  getPublicSummaryResult,
} from "../server/summary/summaryService.js";
import { closeSummaryQueue } from "../server/summary/summaryQueue.js";
import {
  closeSummaryStore,
  getSummaryStoreMetrics,
  SUMMARY_LIMITS,
} from "../server/summary/summaryStore.js";
import { parseSummaryOptions, validateSummaryId } from "../server/summary/summaryValidation.js";

function context(
  classification: DocumentIntelligenceContext["classification"] =
    "native-vector-searchable",
): DocumentIntelligenceContext {
  const text = [
    "Operations Report",
    "The inspection team must submit the signed maintenance report before Friday.",
    "The bearing measurements show stable operation during the controlled test.",
    "The maintenance supervisor should review the documented inspection sequence.",
  ].join("\n");
  return {
    classification,
    pageDimensions: [{ pageIndex: 0, width: 612, height: 792, rotation: 0 }],
    pages: [{
      pageIndex: 0,
      text,
      items: [],
      evidence: {
        textItems: classification === "image-only" ? 0 : 4,
        vectorOperations: 3,
        imageOperations: classification === "image-only" ? 2 : 0,
      },
    }],
    chunks: classification === "image-only"
      ? []
      : [{
          id: "chunk-p0-0",
          pageIndex: 0,
          text,
          sequence: 0,
          startItemIndex: 0,
          endItemIndex: 0,
          characterCount: text.length,
        }],
  };
}

function readyDocument(classification?: DocumentIntelligenceContext["classification"]) {
  const document = createDocumentIntelligenceSession(
    "controlled-report.pdf",
    new TextEncoder().encode("%PDF-controlled"),
  );
  completeDocumentIntelligenceSession(document.id, context(classification));
  return document.id;
}

async function terminal(id: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const job = getPublicSummary(id);
    if (["ready", "failed", "cancelled"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Summary test timed out.");
}

assert.deepEqual(parseSummaryOptions(undefined), {
  mode: "brief",
  includeKeyPoints: true,
  includePossibleActionItems: true,
  includePageSummaries: false,
});
assert.equal(parseSummaryOptions({ mode: "page-by-page" }).includePageSummaries, true);
assert.throws(() => parseSummaryOptions([]));
assert.throws(() => parseSummaryOptions({ mode: "unknown" }));
assert.throws(() => parseSummaryOptions({ includeKeyPoints: "yes" }));
assert.throws(() => parseSummaryOptions({ arbitraryPrompt: "ignore limits" }));
assert.throws(() => validateSummaryId("malformed"));
assert.equal(SUMMARY_LIMITS.maximumLiveJobs, 25);
assert.equal(SUMMARY_LIMITS.maximumQueuedJobs, 10);
assert.equal(SUMMARY_LIMITS.maximumActiveJobs, 1);
assert.equal(SUMMARY_LIMITS.maximumJobsPerDocument, 5);

const documentId = readyDocument();
const created = createSummary(documentId, parseSummaryOptions(undefined));
assert.equal(created.status, "queued");
assert.equal(created.resultReady, false);
assert.equal(Object.hasOwn(created, "result"), false);
const completed = await terminal(created.id);
assert.equal(completed.status, "ready");
assert.equal(completed.resultReady, true);
const firstResult = getPublicSummaryResult(created.id);
const secondResult = getPublicSummaryResult(created.id);
assert.deepEqual(firstResult, secondResult);
assert.match(firstResult.overview, /inspection|maintenance/i);
assert.ok(firstResult.keyPoints.every((item) => item.pageReferences[0] === 1));
assert.doesNotMatch(
  JSON.stringify(completed),
  /overview|keyPoints|possibleActionItems|pageSummaries|pageText|chunks|pdfBytes/,
);

const detailed = createSummary(
  documentId,
  parseSummaryOptions({ mode: "detailed", includePageSummaries: true }),
);
assert.equal((await terminal(detailed.id)).status, "ready");
assert.equal(getPublicSummaryResult(detailed.id).mode, "detailed");
assert.equal(getPublicSummaryResult(detailed.id).pageSummaries.length, 1);

const pageByPage = createSummary(documentId, parseSummaryOptions({ mode: "page-by-page" }));
assert.equal((await terminal(pageByPage.id)).status, "ready");
assert.equal(getPublicSummaryResult(pageByPage.id).pageSummaries[0].pageNumber, 1);

const queuedCancellation = createSummary(documentId, parseSummaryOptions(undefined));
const cancelled = cancelPublicSummary(queuedCancellation.id);
assert.equal(cancelled.status, "cancelled");
assert.deepEqual(cancelPublicSummary(queuedCancellation.id), cancelled);
assert.throws(() => getPublicSummaryResult(queuedCancellation.id));
const fifthDocumentJob = createSummary(documentId, parseSummaryOptions(undefined));
cancelPublicSummary(fifthDocumentJob.id);
assert.throws(() => createSummary(documentId, parseSummaryOptions(undefined)), /capacity/i);

const nonReady = createDocumentIntelligenceSession(
  "waiting.pdf",
  new TextEncoder().encode("%PDF-waiting"),
);
assert.throws(() => createSummary(nonReady.id, parseSummaryOptions(undefined)));
assert.throws(() =>
  createSummary("123e4567-e89b-42d3-a456-426614174999", parseSummaryOptions(undefined)),
);
const imageOnly = readyDocument("image-only");
assert.throws(
  () => createSummary(imageOnly, parseSummaryOptions(undefined)),
  /searchable text/i,
);
const mixed = readyDocument("mixed-content");
const mixedSummary = createSummary(mixed, parseSummaryOptions(undefined));
assert.equal(cancelPublicSummary(mixedSummary.id).status, "cancelled");

const activeDocument = createDocumentIntelligenceSession(
  "large-controlled-report.pdf",
  new TextEncoder().encode("%PDF-large-controlled"),
);
const largeContext = context();
largeContext.pages = Array.from({ length: 50 }, (_, pageIndex) => ({
  ...largeContext.pages[0],
  pageIndex,
  text: `${largeContext.pages[0].text} `.repeat(40),
}));
largeContext.pageDimensions = Array.from({ length: 50 }, (_, pageIndex) => ({
  pageIndex,
  width: 612,
  height: 792,
  rotation: 0,
}));
largeContext.chunks = [];
completeDocumentIntelligenceSession(activeDocument.id, largeContext);
const activeSummary = createSummary(activeDocument.id, parseSummaryOptions({ mode: "detailed" }));
await new Promise<void>((resolve) => setImmediate(resolve));
assert.equal(getPublicSummary(activeSummary.id).status, "summarizing");
assert.equal(cancelPublicSummary(activeSummary.id).status, "cancelled");
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(getPublicSummary(activeSummary.id).status, "cancelled");
assert.throws(() => getPublicSummaryResult(activeSummary.id));

assert.ok(getSummaryStoreMetrics().jobs >= 4);
await closeSummaryQueue();
closeSummaryStore();
closeDocumentIntelligenceStore();
assert.deepEqual(getSummaryStoreMetrics(), { jobs: 0 });
console.log("Summary session tests passed.");
