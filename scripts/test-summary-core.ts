import assert from "node:assert/strict";
import {
  extractSummaryCandidates,
  generateExtractiveSummary,
  rankSummaryCandidates,
  removeRepeatedMargins,
  scoringTokens,
  selectNonRedundant,
} from "../server/summary/summaryEngine.js";
import type { DocumentIntelligenceContext } from "../server/documentIntelligence/documentIntelligenceTypes.js";
import { DEFAULT_SUMMARY_OPTIONS } from "../shared/summaryTypes.js";

const pages = [
  "Quarterly Report\nThe turbine inspection must be completed before Friday. The inspection report contains detailed bearing measurements.\nProject Alpha requires an approved maintenance plan.\nConfidential footer",
  "Quarterly Report\nThe maintenance team should review the bearing measurements and submit the signed plan. The report explains the current inspection sequence.\nConfidential footer",
  "Quarterly Report\nRecommendation: provide the final inspection record to the operations team. This page describes project risks and maintenance controls.\nConfidential footer",
];

const cleaned = removeRepeatedMargins(pages);
assert.ok(cleaned.every((page) => !page.includes("Quarterly Report")));
assert.ok(cleaned.every((page) => !page.includes("Confidential footer")));
assert.equal(
  removeRepeatedMargins(["Shared detail stays.", "Shared detail stays."])[0],
  "Shared detail stays.",
);

const candidates = extractSummaryCandidates([
  "Heading without punctuation\n- The project team must submit the completed inspection report by Friday.\nTiny.\nA useful paragraph contains enough words to remain available for deterministic sentence selection! Another useful sentence asks whether the plan is ready?",
]);
assert.equal(candidates.some((candidate) => candidate.text === "Tiny."), false);
assert.ok(candidates.some((candidate) => candidate.bulletLike));
assert.ok(candidates.every((candidate) => candidate.text.length <= 2_000));
assert.equal(scoringTokens("the and inspection inspection").join(","), "inspection,inspection");

const rankedOne = rankSummaryCandidates(candidates);
const rankedTwo = rankSummaryCandidates(candidates);
assert.deepEqual(rankedOne, rankedTwo);
assert.ok(rankedOne.every((candidate) => Number.isFinite(candidate.score)));
const duplicate = { ...rankedOne[0], id: "duplicate", sourceIndex: 99 };
assert.equal(selectNonRedundant([rankedOne[0], duplicate], 10, 1_500).length, 1);

const context: DocumentIntelligenceContext = {
  classification: "mixed-content",
  pageDimensions: pages.map((_, pageIndex) => ({
    pageIndex,
    width: 612,
    height: 792,
    rotation: 0,
  })),
  pages: pages.map((text, pageIndex) => ({
    pageIndex,
    text,
    items: [],
    evidence: { textItems: 5, vectorOperations: 2, imageOperations: pageIndex === 1 ? 1 : 0 },
  })),
  chunks: [],
};

const result = await generateExtractiveSummary(
  context,
  { ...DEFAULT_SUMMARY_OPTIONS, mode: "page-by-page", includePageSummaries: true },
  new AbortController().signal,
);
assert.equal(result.schemaVersion, "1.0");
assert.equal(result.generationMethod, "deterministic-extractive");
assert.equal(result.mode, "page-by-page");
assert.equal(result.pageSummaries.length, 3);
assert.ok(result.pageSummaries.every((page) => page.summary.length <= 1_200));
assert.ok(result.keyPoints.every((item) => item.pageReferences.every((page) => page > 0)));
assert.ok(result.possibleActionItems.some((item) => /\bmust\b/i.test(item.text)));
assert.ok(result.possibleActionItems.every((item) => !/owner:|priority:/i.test(item.text)));
assert.ok(result.limitations.some((limitation) => /Image-only regions/i.test(limitation)));
assert.ok(result.limitations.some((limitation) => /possible action items/i.test(limitation)));
assert.doesNotMatch(result.keyPoints.map((item) => item.id).join(" "), /inspection|project/i);
assert.ok(Buffer.byteLength(JSON.stringify(result)) < 1024 * 1024);
assert.doesNotMatch(JSON.stringify(result), /chunks|pdfBytes|scoringMap|tokenMap|AbortController/);

const nonEnglish: DocumentIntelligenceContext = {
  ...context,
  classification: "searchable-low-vector",
  pages: [{
    ...context.pages[0],
    text: "यह दस्तावेज़ परियोजना की आवश्यकताओं और निरीक्षण प्रक्रिया का विस्तृत विवरण प्रस्तुत करता है। ".repeat(10),
  }],
  pageDimensions: [context.pageDimensions[0]],
};
const nonEnglishResult = await generateExtractiveSummary(
  nonEnglish,
  DEFAULT_SUMMARY_OPTIONS,
  new AbortController().signal,
);
assert.ok(nonEnglishResult.limitations.some((limitation) => /optimized for English/i.test(limitation)));

console.log("Summary core tests passed.");
