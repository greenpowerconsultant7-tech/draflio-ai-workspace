import type { DocumentPageContext, DocumentTextChunk } from "./documentIntelligenceTypes.js";

export const MAX_DOCUMENT_CHUNKS = 10_000;
const TARGET_CHARS = 1_800;
const MAX_CHARS = 2_500;
const OVERLAP_CHARS = 200;

export function chunkDocumentPages(pages: readonly DocumentPageContext[]): DocumentTextChunk[] {
  const chunks: DocumentTextChunk[] = [];
  for (const page of pages) {
    const text = page.text.trim();
    if (!text) continue;
    let start = 0;
    let pageSequence = 0;
    while (start < text.length) {
      let end = Math.min(start + TARGET_CHARS, text.length);
      if (end < text.length) {
        const boundaryStart = Math.min(start + 800, end);
        const boundaryText = text.slice(boundaryStart, Math.min(start + MAX_CHARS, text.length));
        const matches = [...boundaryText.matchAll(/(?:\n\n|[.!?]\s+)/g)];
        const preferred = matches.filter((match) => boundaryStart + (match.index ?? 0) <= start + MAX_CHARS);
        if (preferred.length) {
          const last = preferred[preferred.length - 1];
          end = boundaryStart + (last.index ?? 0) + last[0].length;
        } else {
          end = Math.min(start + MAX_CHARS, text.length);
        }
      }
      const chunkText = text.slice(start, end).trim();
      if (chunkText) {
        if (chunks.length >= MAX_DOCUMENT_CHUNKS) {
          throw new Error("DOCUMENT_INTELLIGENCE_COMPLEXITY_LIMIT");
        }
        chunks.push({
          id: `chunk-p${page.pageIndex}-${pageSequence}`,
          pageIndex: page.pageIndex,
          text: chunkText,
          sequence: chunks.length,
          startItemIndex: 0,
          endItemIndex: Math.max(0, page.items.length - 1),
          characterCount: chunkText.length,
        });
        pageSequence += 1;
      }
      if (end >= text.length) break;
      const next = Math.max(start + 1, end - OVERLAP_CHARS);
      start = next;
    }
  }
  return chunks;
}
