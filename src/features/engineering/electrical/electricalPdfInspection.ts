import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import {
  MAX_PAGE_OPERATIONS,
  MAX_PAGE_TEXT_ITEMS,
  MAX_TOTAL_OPERATIONS,
  MAX_TOTAL_TEXT_ITEMS,
  type InspectionResult,
  type PageEvidence,
  type TextFragment,
} from "./electricalInspectorTypes";
import {
  classifyEvidence,
  clampRectangle,
  combineClassification,
  detectPageEquipment,
  hasPdfSignature,
  validatePageCount,
} from "./electricalInspectorCore";

export type InspectionProgress = {
  state: "loading-pdf" | "inspecting-pages" | "detecting-equipment";
  page?: number;
  pageCount?: number;
};

export type LoadedInspection = {
  document: PDFDocumentProxy;
  loadingTask: PDFDocumentLoadingTask;
  result: InspectionResult;
};

type UsableTextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

function isTextItem(value: unknown): value is UsableTextItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "str" in value &&
    "transform" in value &&
    "width" in value &&
    "height" in value
  );
}

export async function inspectElectricalPdf(
  bytes: Uint8Array,
  signal: AbortSignal,
  onProgress: (progress: InspectionProgress) => void,
): Promise<LoadedInspection> {
  if (!hasPdfSignature(bytes)) throw new Error("invalid-file");
  onProgress({ state: "loading-pdf" });
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const loadingTask = pdfjs.getDocument({ data: bytes });
  signal.addEventListener("abort", () => loadingTask.destroy(), { once: true });
  const document = await loadingTask.promise;
  const pageError = validatePageCount(document.numPages);
  if (pageError) {
    await loadingTask.destroy();
    throw new Error("page-limit");
  }
  const pages: PageEvidence[] = [];
  const equipment = [];
  let totalTextItems = 0;
  let totalOperations = 0;
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    onProgress({ state: "inspecting-pages", page: pageNumber, pageCount: document.numPages });
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1, rotation: page.rotate });
    const [textContent, operatorList] = await Promise.all([
      page.getTextContent(),
      page.getOperatorList(),
    ]);
    if (
      textContent.items.length > MAX_PAGE_TEXT_ITEMS ||
      operatorList.fnArray.length > MAX_PAGE_OPERATIONS
    ) {
      await loadingTask.destroy();
      throw new Error("complexity-limit");
    }
    totalTextItems += textContent.items.length;
    totalOperations += operatorList.fnArray.length;
    if (totalTextItems > MAX_TOTAL_TEXT_ITEMS || totalOperations > MAX_TOTAL_OPERATIONS) {
      await loadingTask.destroy();
      throw new Error("complexity-limit");
    }
    const vectorIds = new Set([
      pdfjs.OPS.constructPath,
      pdfjs.OPS.stroke,
      pdfjs.OPS.fill,
      pdfjs.OPS.fillStroke,
      pdfjs.OPS.closeStroke,
      pdfjs.OPS.closeFillStroke,
    ]);
    const imageIds = new Set([
      pdfjs.OPS.paintImageXObject,
      pdfjs.OPS.paintInlineImageXObject,
      pdfjs.OPS.paintImageMaskXObject,
    ]);
    const vectors = operatorList.fnArray.filter((operation) => vectorIds.has(operation)).length;
    const images = operatorList.fnArray.filter((operation) => imageIds.has(operation)).length;
    const fragments: TextFragment[] = [];
    for (const item of textContent.items) {
      if (!isTextItem(item) || !item.str.trim()) continue;
      const transform = pdfjs.Util.transform(viewport.transform, item.transform);
      const fontHeight = Math.hypot(transform[2], transform[3]);
      const rectangle = clampRectangle({
        x: transform[4] / viewport.width,
        y: (viewport.height - transform[5] - fontHeight) / viewport.height,
        width: Math.abs(item.width * viewport.scale) / viewport.width,
        height: fontHeight / viewport.height,
      });
      if (rectangle)
        fragments.push({ value: item.str.trim(), pageIndex: pageNumber - 1, rectangle });
    }
    const evidence: PageEvidence = {
      pageIndex: pageNumber - 1,
      width: viewport.width,
      height: viewport.height,
      rotation: page.rotate,
      textItemCount: fragments.length,
      vectorOperationCount: vectors,
      imageOperationCount: images,
      classification: classifyEvidence(fragments.length, vectors, images),
    };
    pages.push(evidence);
    onProgress({ state: "detecting-equipment", page: pageNumber, pageCount: document.numPages });
    equipment.push(...detectPageEquipment(fragments, equipment.length));
    page.cleanup();
  }
  return {
    document,
    loadingTask,
    result: {
      pageCount: document.numPages,
      classification: combineClassification(pages),
      pages,
      equipment,
    },
  };
}
