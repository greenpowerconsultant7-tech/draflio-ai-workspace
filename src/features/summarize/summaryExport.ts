import type { SummaryReferenceItem, SummaryResult } from "./summaryTypes";

export function formatPageReferences(references: readonly number[]) {
  return references.length === 1
    ? `Page ${references[0]}`
    : `Pages ${references.join(", ")}`;
}

function section(title: string, items: readonly SummaryReferenceItem[]) {
  if (!items.length) return "";
  return `${title}\n${items
    .map((item) => `- ${item.text} (${formatPageReferences(item.pageReferences)})`)
    .join("\n")}`;
}

export function serializeSummaryText(result: SummaryResult) {
  return [
    "Draflio Extractive Summary",
    `Generation method: ${result.generationMethod}`,
    `Mode: ${result.mode}`,
    "",
    "Overview",
    result.overview,
    "",
    section("Key points", result.keyPoints),
    "",
    section("Possible action items", result.possibleActionItems),
    "",
    result.pageSummaries.length
      ? `Page summaries\n${result.pageSummaries
          .map((page) => `Page ${page.pageNumber}\n${page.summary}`)
          .join("\n\n")}`
      : "",
    "",
    `Limitations\n${result.limitations.map((limitation) => `- ${limitation}`).join("\n")}`,
  ]
    .filter((part, index, parts) => part || (index > 0 && parts[index - 1]))
    .join("\n");
}

export function safeSummaryBase(filename: string) {
  const leaf = filename.split(/[\\/]/).pop() ?? "";
  const withoutExtension = leaf.replace(/\.pdf$/i, "");
  const safe = withoutExtension
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._ -]+/gu, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return safe || "document";
}

export function downloadSummaryBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
