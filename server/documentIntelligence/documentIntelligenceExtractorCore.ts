/// <reference types="node" />
/// <reference lib="esnext.float16" />

import type { TextItem } from "pdfjs-dist/types/src/display/api.js";
import { chunkDocumentPages } from "./documentChunking.js";
import type {
  DocumentIntelligenceContext,
  DocumentPageContext,
  NormalizedTextItem,
} from "./documentIntelligenceTypes.js";

const MAX_PAGES = 50;
const MAX_ITEMS_PER_PAGE = 50_000;
const MAX_TOTAL_ITEMS = 250_000;
const MAX_OPERATIONS_PER_PAGE = 100_000;
const MAX_TOTAL_OPERATIONS = 500_000;
const MAX_PAGE_TEXT = 2_000_000;
const MAX_TOTAL_TEXT = 15_000_000;

function normalizeText(value: string) {
  return [...value.normalize("NFKC")]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .replace(/[ \t\f\v]+/g, " ")
    .trim();
}

function isTextItem(value: unknown): value is TextItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "str" in value &&
    typeof value.str === "string" &&
    "transform" in value &&
    Array.isArray(value.transform)
  );
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function createTextItem(
  pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs"),
  value: TextItem,
  pageIndex: number,
  sourceIndex: number,
  viewport: ReturnType<Awaited<ReturnType<import("pdfjs-dist").PDFDocumentProxy["getPage"]>>["getViewport"]>,
): NormalizedTextItem | undefined {
  const text = normalizeText(value.str);
  if (!text) return undefined;
  const transformed = pdfjs.Util.transform(viewport.transform, value.transform);
  const x = transformed[4];
  const baselineY = transformed[5];
  const width = Math.abs(value.width * viewport.scale);
  const height = Math.abs(value.height * viewport.scale) || Math.abs(transformed[3]);
  const top = baselineY - height;
  if (![x, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return undefined;
  }
  const normalizedX = clamp(x / viewport.width);
  const normalizedY = clamp(top / viewport.height);
  const normalizedWidth = Math.min(1 - normalizedX, width / viewport.width);
  const normalizedHeight = Math.min(1 - normalizedY, height / viewport.height);
  if (normalizedWidth <= 0 || normalizedHeight <= 0) return undefined;
  return {
    id: `item-p${pageIndex}-${sourceIndex}`,
    pageIndex,
    x: normalizedX,
    y: normalizedY,
    width: normalizedWidth,
    height: normalizedHeight,
    text,
    hasLineBreak: Boolean(value.hasEOL),
    direction: typeof value.dir === "string" ? value.dir : undefined,
    sourceIndex,
  };
}

function assemblePageText(items: readonly NormalizedTextItem[]) {
  let output = "";
  let previous: NormalizedTextItem | undefined;
  for (const item of items) {
    if (previous) {
      const newLine = previous.hasLineBreak || Math.abs(item.y - previous.y) > Math.max(item.height, previous.height) * 0.8;
      const distantRegion = item.x - (previous.x + previous.width) > 0.18;
      output += newLine || distantRegion ? "\n" : " ";
    }
    output += item.text;
    previous = item;
  }
  return output.replace(/[ ]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function classify(pages: readonly DocumentPageContext[]) {
  const text = pages.reduce((sum, page) => sum + page.evidence.textItems, 0);
  const vectors = pages.reduce((sum, page) => sum + page.evidence.vectorOperations, 0);
  const images = pages.reduce((sum, page) => sum + page.evidence.imageOperations, 0);
  if (text > 0 && vectors > 0 && images > 0) return "mixed-content" as const;
  if (text > 0 && vectors > images) return "native-vector-searchable" as const;
  if (text > 0) return "searchable-low-vector" as const;
  if (images > 0) return "image-only" as const;
  return "empty-or-unsupported" as const;
}

export async function extractDocumentIntelligence(
  inputBytes: Uint8Array,
  options: {
    signal?: AbortSignal;
    onProgress?: (completed: number, total: number) => void;
  } = {},
): Promise<DocumentIntelligenceContext> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const ownedBytes = Uint8Array.from(inputBytes);
  const loadingTask = pdfjs.getDocument({ data: ownedBytes, verbosity: 0 });
  let totalItems = 0;
  let totalOperations = 0;
  let totalText = 0;
  try {
    const document = await loadingTask.promise;
    if (document.numPages > MAX_PAGES) throw new Error("DOCUMENT_INTELLIGENCE_PAGE_LIMIT");
    const pages: DocumentPageContext[] = [];
    const pageDimensions = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      if (options.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      const page = await document.getPage(pageNumber);
      try {
        const viewport = page.getViewport({ scale: 1 });
        pageDimensions.push({
          pageIndex: pageNumber - 1,
          width: viewport.width,
          height: viewport.height,
          rotation: viewport.rotation,
        });
        const [textContent, operatorList] = await Promise.all([
          page.getTextContent({ disableNormalization: true }),
          page.getOperatorList(),
        ]);
        if (
          textContent.items.length > MAX_ITEMS_PER_PAGE ||
          operatorList.fnArray.length > MAX_OPERATIONS_PER_PAGE
        ) {
          throw new Error("DOCUMENT_INTELLIGENCE_COMPLEXITY_LIMIT");
        }
        totalItems += textContent.items.length;
        totalOperations += operatorList.fnArray.length;
        if (totalItems > MAX_TOTAL_ITEMS || totalOperations > MAX_TOTAL_OPERATIONS) {
          throw new Error("DOCUMENT_INTELLIGENCE_COMPLEXITY_LIMIT");
        }
        const items = textContent.items
          .map((item, index) =>
            isTextItem(item)
              ? createTextItem(pdfjs, item, pageNumber - 1, index, viewport)
              : undefined,
          )
          .filter((item): item is NormalizedTextItem => item !== undefined);
        const pageText = assemblePageText(items);
        if (pageText.length > MAX_PAGE_TEXT) {
          throw new Error("DOCUMENT_INTELLIGENCE_COMPLEXITY_LIMIT");
        }
        totalText += pageText.length;
        if (totalText > MAX_TOTAL_TEXT) {
          throw new Error("DOCUMENT_INTELLIGENCE_COMPLEXITY_LIMIT");
        }
        const vectorOps = new Set([
          pdfjs.OPS.constructPath,
          pdfjs.OPS.stroke,
          pdfjs.OPS.fill,
          pdfjs.OPS.fillStroke,
          pdfjs.OPS.closeStroke,
          pdfjs.OPS.closeFillStroke,
        ]);
        const imageOps = new Set([
          pdfjs.OPS.paintImageXObject,
          pdfjs.OPS.paintInlineImageXObject,
          pdfjs.OPS.paintImageMaskXObject,
        ]);
        pages.push({
          pageIndex: pageNumber - 1,
          text: pageText,
          items,
          evidence: {
            textItems: items.length,
            vectorOperations: operatorList.fnArray.filter((operation) => vectorOps.has(operation)).length,
            imageOperations: operatorList.fnArray.filter((operation) => imageOps.has(operation)).length,
          },
        });
        options.onProgress?.(pageNumber, document.numPages);
      } finally {
        page.cleanup();
      }
    }
    const classification = classify(pages);
    return {
      classification,
      pageDimensions,
      pages,
      chunks: chunkDocumentPages(pages),
    };
  } catch (error) {
    if (error instanceof Error && /password|encrypted/i.test(error.message)) {
      throw new Error("DOCUMENT_INTELLIGENCE_ENCRYPTED_PDF");
    }
    throw error;
  } finally {
    await loadingTask.destroy();
    if (ownedBytes.buffer.byteLength > 0) {
      ownedBytes.fill(0);
    }
  }
}
