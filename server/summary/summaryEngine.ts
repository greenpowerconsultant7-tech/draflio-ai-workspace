import type { DocumentIntelligenceContext } from "../documentIntelligence/documentIntelligenceTypes.js";
import type { SummaryOptions, SummaryReferenceItem, SummaryResult } from "../../shared/summaryTypes.js";
import type { SummaryCandidate, SummaryProgressUpdate } from "./summaryTypes.js";

export const SUMMARY_ENGINE_LIMITS = {
  maximumInputCharacters: 15_000_000,
  maximumSourcePages: 50,
  maximumSourceChunks: 10_000,
  maximumCandidateSentences: 100_000,
  maximumSentenceLength: 2_000,
  minimumSentenceLength: 25,
  maximumResultBytes: 1024 * 1024,
  maximumKeyPoints: 30,
  maximumPossibleActionItems: 30,
  maximumPageSummaryLength: 1_200,
} as const;

const STOP_WORDS = new Set(
  "a an and are as at be been by for from has have he her in is it its of on or our that the their this to was were will with you your".split(
    " ",
  ),
);
const ACTION_PATTERN =
  /\b(must|shall|should|required|requires|action|follow[- ]?up|review|approve|submit|provide|complete|deadline|due|assign|responsible|next step|recommendation)\b/i;

function cleanText(value: string) {
  return value
    .normalize("NFKC")
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join("")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function scoringTokens(value: string) {
  return cleanText(value)
    .toLocaleLowerCase("en-US")
    .match(/[\p{L}\p{N}][\p{L}\p{N}'-]{0,63}/gu)
    ?.filter((token) => !STOP_WORDS.has(token)) ?? [];
}

function normalizedLine(value: string) {
  return cleanText(value).toLocaleLowerCase("en-US").replace(/\d+/g, "#");
}

export function removeRepeatedMargins(pageTexts: readonly string[]) {
  const occurrences = new Map<string, Set<number>>();
  const margins = pageTexts.map((text) => {
    const lines = text.split(/\r?\n/).map(cleanText).filter(Boolean);
    return new Set([...lines.slice(0, 2), ...lines.slice(-2)].map(normalizedLine));
  });
  margins.forEach((lines, pageIndex) => {
    for (const line of lines) {
      if (line.length < 5) continue;
      const pages = occurrences.get(line) ?? new Set<number>();
      pages.add(pageIndex);
      occurrences.set(line, pages);
    }
  });
  const threshold = Math.max(3, Math.ceil(pageTexts.length * 0.6));
  const repeated = new Set(
    [...occurrences].filter(([, pages]) => pages.size >= threshold).map(([line]) => line),
  );
  return pageTexts.map((text) => {
    const lines = text.split(/\r?\n/);
    const nonEmpty = lines.map(cleanText).filter(Boolean);
    const marginCandidates = new Set([
      ...nonEmpty.slice(0, 2).map(normalizedLine),
      ...nonEmpty.slice(-2).map(normalizedLine),
    ]);
    return lines
      .filter((line) => {
        const normalized = normalizedLine(line);
        return !(marginCandidates.has(normalized) && repeated.has(normalized));
      })
      .join("\n");
  });
}

function splitLongCandidate(value: string) {
  const output: string[] = [];
  let remaining = value;
  while (remaining.length > SUMMARY_ENGINE_LIMITS.maximumSentenceLength) {
    const searchFrom = SUMMARY_ENGINE_LIMITS.maximumSentenceLength - 300;
    const boundary = Math.max(
      remaining.lastIndexOf(" ", SUMMARY_ENGINE_LIMITS.maximumSentenceLength),
      searchFrom,
    );
    output.push(remaining.slice(0, boundary).trim());
    remaining = remaining.slice(boundary).trim();
  }
  if (remaining) output.push(remaining);
  return output;
}

export function extractSummaryCandidates(pageTexts: readonly string[]) {
  const candidates: SummaryCandidate[] = [];
  pageTexts.forEach((pageText, pageIndex) => {
    const blocks = pageText.split(/\n{2,}|\r?\n/);
    let sourceIndex = 0;
    for (const rawBlock of blocks) {
      const block = cleanText(rawBlock);
      if (!block) continue;
      const headingLike = block.length <= 100 && !/[.!?]$/.test(block);
      const bulletLike = /^[-*•▪‣]\s+/.test(block);
      const pieces = block
        .replace(/^[-*•▪‣]\s+/, "")
        .split(/(?<=[.!?])\s+|(?<=[:;])\s+(?=[A-Z\p{Lu}])/u);
      for (const piece of pieces.flatMap(splitLongCandidate)) {
        const text = cleanText(piece);
        if (text.length < SUMMARY_ENGINE_LIMITS.minimumSentenceLength) continue;
        const tokens = scoringTokens(text);
        if (!tokens.length) continue;
        candidates.push({
          id: `candidate-p${pageIndex + 1}-${sourceIndex}`,
          pageNumber: pageIndex + 1,
          sourceIndex,
          text,
          tokens,
          headingLike,
          bulletLike,
          score: 0,
        });
        sourceIndex += 1;
        if (candidates.length > SUMMARY_ENGINE_LIMITS.maximumCandidateSentences) {
          throw new Error("SUMMARY_COMPLEXITY_LIMIT");
        }
      }
    }
  });
  return candidates;
}

function tokenSimilarity(left: readonly string[], right: readonly string[]) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const union = new Set([...leftSet, ...rightSet]).size;
  if (!union) return 0;
  let intersection = 0;
  for (const token of leftSet) if (rightSet.has(token)) intersection += 1;
  return intersection / union;
}

export function rankSummaryCandidates(candidates: readonly SummaryCandidate[]) {
  const frequency = new Map<string, number>();
  const sentenceFrequency = new Map<string, number>();
  for (const candidate of candidates) {
    const unique = new Set(candidate.tokens);
    for (const token of candidate.tokens) frequency.set(token, (frequency.get(token) ?? 0) + 1);
    for (const token of unique) {
      sentenceFrequency.set(token, (sentenceFrequency.get(token) ?? 0) + 1);
    }
  }
  return candidates
    .map((candidate) => {
      const tokenScore = candidate.tokens.reduce((sum, token) => {
        const tf = frequency.get(token) ?? 0;
        const sf = sentenceFrequency.get(token) ?? 1;
        return sum + Math.log1p(tf) * Math.log1p(candidates.length / sf);
      }, 0) / Math.sqrt(candidate.tokens.length);
      const lengthPreference = Math.min(candidate.text.length, 400) / 400;
      const position = candidate.sourceIndex === 0 ? 0.35 : 0;
      const structure = (candidate.headingLike ? 0.2 : 0) + (candidate.bulletLike ? 0.25 : 0);
      const boilerplatePenalty = /copyright|all rights reserved|confidential/i.test(candidate.text)
        ? 2
        : 0;
      return {
        ...candidate,
        score: tokenScore + lengthPreference + position + structure - boilerplatePenalty,
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.pageNumber - right.pageNumber ||
        left.sourceIndex - right.sourceIndex,
    );
}

export function selectNonRedundant(
  ranked: readonly SummaryCandidate[],
  count: number,
  maximumCharacters: number,
) {
  const selected: SummaryCandidate[] = [];
  let characters = 0;
  for (const candidate of ranked) {
    if (selected.some((item) => tokenSimilarity(item.tokens, candidate.tokens) >= 0.72)) continue;
    if (characters + candidate.text.length + (selected.length ? 1 : 0) > maximumCharacters) continue;
    selected.push(candidate);
    characters += candidate.text.length + (selected.length > 1 ? 1 : 0);
    if (selected.length >= count) break;
  }
  return selected.sort(
    (left, right) =>
      left.pageNumber - right.pageNumber || left.sourceIndex - right.sourceIndex,
  );
}

function referenceItems(
  candidates: readonly SummaryCandidate[],
  prefix: string,
  maximum: number,
): SummaryReferenceItem[] {
  return candidates.slice(0, maximum).map((candidate, index) => ({
    id: `${prefix}-${index + 1}`,
    text: candidate.text,
    pageReferences: [candidate.pageNumber],
  }));
}

function isLikelyPrimarilyNonEnglish(value: string) {
  const letters = value.match(/\p{L}/gu) ?? [];
  if (letters.length < 100) return false;
  const asciiLetters = value.match(/[A-Za-z]/g) ?? [];
  return asciiLetters.length / letters.length < 0.55;
}

async function checkpoint(signal: AbortSignal, update?: () => void) {
  if (signal.aborted) throw new DOMException("Summary cancelled.", "AbortError");
  update?.();
  await new Promise<void>((resolve) => setImmediate(resolve));
  if (signal.aborted) throw new DOMException("Summary cancelled.", "AbortError");
}

export async function generateExtractiveSummary(
  context: DocumentIntelligenceContext,
  options: SummaryOptions,
  signal: AbortSignal,
  onProgress?: (update: SummaryProgressUpdate) => void,
): Promise<SummaryResult> {
  if (
    context.pages.length > SUMMARY_ENGINE_LIMITS.maximumSourcePages ||
    context.chunks.length > SUMMARY_ENGINE_LIMITS.maximumSourceChunks
  ) {
    throw new Error("SUMMARY_COMPLEXITY_LIMIT");
  }
  const totalCharacters = context.pages.reduce((sum, page) => sum + page.text.length, 0);
  if (totalCharacters > SUMMARY_ENGINE_LIMITS.maximumInputCharacters) {
    throw new Error("SUMMARY_COMPLEXITY_LIMIT");
  }
  await checkpoint(signal, () =>
    onProgress?.({
      stage: "preparing-context",
      message: "Preparing searchable document text.",
      progress: { mode: "indeterminate" },
    }),
  );
  const pageTexts = removeRepeatedMargins(context.pages.map((page) => page.text));
  const candidates: SummaryCandidate[] = [];
  for (let index = 0; index < pageTexts.length; index += 1) {
    candidates.push(...extractSummaryCandidates([pageTexts[index]]).map((candidate) => ({
      ...candidate,
      id: `candidate-p${index + 1}-${candidate.sourceIndex}`,
      pageNumber: index + 1,
    })));
    if (candidates.length > SUMMARY_ENGINE_LIMITS.maximumCandidateSentences) {
      throw new Error("SUMMARY_COMPLEXITY_LIMIT");
    }
    await checkpoint(signal, () =>
      onProgress?.({
        stage: "selecting-sentences",
        message: "Selecting important source sentences.",
        progress: {
          mode: "determinate",
          unit: "pages",
          completed: index + 1,
          total: pageTexts.length,
        },
      }),
    );
  }
  const ranked = rankSummaryCandidates(candidates);
  const overviewLimit =
    options.mode === "brief" ? 1_500 : options.mode === "detailed" ? 6_000 : 2_500;
  const overviewCount = options.mode === "brief" ? 8 : options.mode === "detailed" ? 25 : 12;
  const overviewCandidates = selectNonRedundant(ranked, overviewCount, overviewLimit);
  await checkpoint(signal, () =>
    onProgress?.({
      stage: "building-key-points",
      message: "Building page-referenced key points.",
      progress: { mode: "indeterminate" },
    }),
  );
  const keyPointCandidates = options.includeKeyPoints
    ? selectNonRedundant(ranked, SUMMARY_ENGINE_LIMITS.maximumKeyPoints, 12_000)
    : [];
  await checkpoint(signal, () =>
    onProgress?.({
      stage: "finding-possible-actions",
      message: "Finding possible action items.",
      progress: { mode: "indeterminate" },
    }),
  );
  const actionCandidates = options.includePossibleActionItems
    ? selectNonRedundant(
        ranked.filter((candidate) => ACTION_PATTERN.test(candidate.text)),
        SUMMARY_ENGINE_LIMITS.maximumPossibleActionItems,
        12_000,
      )
    : [];
  const pageSummaries: SummaryResult["pageSummaries"] = [];
  if (options.includePageSummaries) {
    for (let index = 0; index < pageTexts.length; index += 1) {
      const pageRanked = rankSummaryCandidates(
        candidates.filter((candidate) => candidate.pageNumber === index + 1),
      );
      const selected = selectNonRedundant(
        pageRanked,
        6,
        SUMMARY_ENGINE_LIMITS.maximumPageSummaryLength,
      );
      if (selected.length) {
        pageSummaries.push({
          pageNumber: index + 1,
          summary: selected.map((candidate) => candidate.text).join(" "),
        });
      }
      await checkpoint(signal, () =>
        onProgress?.({
          stage: "building-page-summaries",
          message: "Building page summaries.",
          progress: {
            mode: "determinate",
            unit: "pages",
            completed: index + 1,
            total: pageTexts.length,
          },
        }),
      );
    }
  }
  const limitations = [
    "This is an extractive summary made from searchable PDF text; it does not rewrite or interpret the document with a generative AI model.",
    "Review the selected sentences against the original document for context and completeness.",
  ];
  if (context.classification === "mixed-content") {
    limitations.push("Image-only regions may not be included.");
  }
  if (isLikelyPrimarilyNonEnglish(pageTexts.join(" "))) {
    limitations.push("Deterministic sentence scoring is optimized for English.");
  }
  if (options.includePossibleActionItems) {
    limitations.push(
      "Review possible action items against the source document; Draflio may include recommendations, requirements, or ordinary instructions that are not assigned tasks.",
    );
  }
  await checkpoint(signal, () =>
    onProgress?.({
      stage: "finalizing",
      message: "Finalizing the extractive summary.",
      progress: { mode: "indeterminate" },
    }),
  );
  const result: SummaryResult = {
    schemaVersion: "1.0",
    generationMethod: "deterministic-extractive",
    mode: options.mode,
    documentClassification: context.classification,
    overview: overviewCandidates.map((candidate) => candidate.text).join(" "),
    keyPoints: referenceItems(
      keyPointCandidates,
      "key-point",
      SUMMARY_ENGINE_LIMITS.maximumKeyPoints,
    ),
    possibleActionItems: referenceItems(
      actionCandidates,
      "possible-action",
      SUMMARY_ENGINE_LIMITS.maximumPossibleActionItems,
    ),
    pageSummaries,
    limitations,
    generatedAt: new Date().toISOString(),
  };
  if (!result.overview || Buffer.byteLength(JSON.stringify(result)) > SUMMARY_ENGINE_LIMITS.maximumResultBytes) {
    throw new Error("SUMMARY_COMPLEXITY_LIMIT");
  }
  return result;
}
