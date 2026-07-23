import assert from "node:assert/strict";
import {
  safeSummaryBase,
  serializeSummaryText,
} from "../src/features/summarize/summaryExport.js";
import {
  validateSummaryJobResponse,
  validateSummaryResult,
} from "../src/features/summarize/summaryValidation.js";
import type { SummaryResult } from "../shared/summaryTypes.js";

const job = validateSummaryJobResponse({
  summary: {
    id: "123e4567-e89b-42d3-a456-426614174000",
    documentSessionId: "123e4567-e89b-42d3-a456-426614174001",
    status: "ready",
    stage: "ready",
    message: "Ready.",
    progress: { mode: "indeterminate" },
    mode: "brief",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ready: true,
    resultReady: true,
  },
});
assert.equal(job.ready, true);
assert.throws(() => validateSummaryJobResponse({ summary: { ...job, status: "unknown" } }));

const result: SummaryResult = {
  schemaVersion: "1.0",
  generationMethod: "deterministic-extractive",
  mode: "brief",
  documentClassification: "native-vector-searchable",
  overview: "The inspection report must be reviewed.",
  keyPoints: [{ id: "key-point-1", text: "A selected sentence.", pageReferences: [1, 3] }],
  possibleActionItems: [{ id: "possible-action-1", text: "The report must be reviewed.", pageReferences: [2] }],
  pageSummaries: [],
  limitations: ["Review against the original document."],
  generatedAt: new Date(0).toISOString(),
};
assert.deepEqual(validateSummaryResult(result), result);
assert.throws(() =>
  validateSummaryResult({
    ...result,
    keyPoints: [{ ...result.keyPoints[0], pageReferences: [3, 1] }],
  }),
);
const text = serializeSummaryText(result);
assert.match(text, /Draflio Extractive Summary/);
assert.match(text, /Pages 1, 3/);
assert.match(text, /Possible action items/);
assert.match(text, /Limitations/);
assert.doesNotMatch(text, /key-point-1/);
assert.equal(safeSummaryBase("../../Unsafe<> Report.pdf"), "Unsafe- Report");
assert.equal(safeSummaryBase(".pdf"), "document");
assert.doesNotMatch(JSON.stringify(result), /pageText|chunks|pdfBytes|parserError/);
console.log("Summary frontend tests passed.");
