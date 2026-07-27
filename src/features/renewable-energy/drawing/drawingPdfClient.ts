import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import {
  IDENTITY_MATRIX,
  cleanExtractedPaths,
  classifyPage,
  multiplyMatrices,
  transformPoint,
  type Matrix,
} from "../../../../shared/renewableEnergy/drawing/drawingCore";
import {
  DRAWING_LIMITS,
  type DrawingExtraction,
  type DrawingPath,
  type DrawingPoint,
  type PageRecord,
} from "../../../../shared/renewableEnergy/drawing/drawingTypes";

export type LoadedDrawing = {
  document: PDFDocumentProxy;
  loadingTask: PDFDocumentLoadingTask;
  extraction: DrawingExtraction;
};

export async function inspectDrawingPdf(
  bytes: Uint8Array,
  selectedPages: number[] | null,
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<LoadedDrawing> {
  if (bytes.byteLength > DRAWING_LIMITS.maxFileBytes || !hasPdfSignature(bytes))
    throw new Error("The selected file is not a supported PDF or exceeds the 25 MB limit.");
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const documentParameters: Parameters<typeof pdfjs.getDocument>[0] & {
    isEvalSupported: boolean;
  } = { data: bytes.slice(), isEvalSupported: false };
  const loadingTask = pdfjs.getDocument(documentParameters);
  const abort = () => void loadingTask.destroy();
  signal.addEventListener("abort", abort, { once: true });
  try {
    progress("Loading PDF safely");
    const document = await loadingTask.promise;
    if (document.numPages < 1 || document.numPages > DRAWING_LIMITS.maxPages)
      throw new Error(`PDF page count must be between 1 and ${DRAWING_LIMITS.maxPages}.`);
    const pagesToRead =
      selectedPages ?? Array.from({ length: document.numPages }, (_, index) => index + 1);
    if (
      pagesToRead.length < 1 ||
      pagesToRead.length > DRAWING_LIMITS.maxPages ||
      new Set(pagesToRead).size !== pagesToRead.length ||
      pagesToRead.some((page) => !Number.isInteger(page) || page < 1 || page > document.numPages)
    )
      throw new Error(`Select between 1 and ${DRAWING_LIMITS.maxSelectedPages} valid pages.`);
    const pages: PageRecord[] = [];
    const rawPaths: DrawingPath[] = [];
    let totalOperators = 0;
    for (const pageNumber of [...pagesToRead].sort((a, b) => a - b)) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      progress(`Inspecting page ${pageNumber} of ${document.numPages}`);
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1, rotation: page.rotate });
      if (
        !Number.isFinite(viewport.width) ||
        !Number.isFinite(viewport.height) ||
        viewport.width <= 0 ||
        viewport.height <= 0 ||
        viewport.width > DRAWING_LIMITS.maxCoordinateMagnitude ||
        viewport.height > DRAWING_LIMITS.maxCoordinateMagnitude
      )
        throw new Error("A selected page has unsupported dimensions.");
      const [operators, text] = await Promise.all([page.getOperatorList(), page.getTextContent()]);
      if (operators.fnArray.length > DRAWING_LIMITS.maxOperatorsPerPage)
        throw new Error("A selected page exceeds the operator complexity limit.");
      totalOperators += operators.fnArray.length;
      if (totalOperators > DRAWING_LIMITS.maxTotalOperators)
        throw new Error("Selected pages exceed the total operator complexity limit.");
      const imageIds = new Set([
        pdfjs.OPS.paintImageXObject,
        pdfjs.OPS.paintInlineImageXObject,
        pdfjs.OPS.paintImageMaskXObject,
      ]);
      const vectorDrawIds = new Set([
        pdfjs.OPS.constructPath,
        pdfjs.OPS.stroke,
        pdfjs.OPS.fill,
        pdfjs.OPS.eoFill,
        pdfjs.OPS.fillStroke,
        pdfjs.OPS.eoFillStroke,
        pdfjs.OPS.closeStroke,
        pdfjs.OPS.closeFillStroke,
        pdfjs.OPS.closeEOFillStroke,
      ]);
      const vectorOperations = operators.fnArray.filter((operation) =>
        vectorDrawIds.has(operation),
      ).length;
      const imageOperations = operators.fnArray.filter((operation) =>
        imageIds.has(operation),
      ).length;
      const textOperations = text.items.length;
      const classified = classifyPage(vectorOperations, imageOperations, textOperations);
      pages.push({
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        rotation: page.rotate,
        vectorOperations,
        imageOperations,
        textOperations,
        operatorCount: operators.fnArray.length,
        ...classified,
      });
      if (vectorOperations > 0)
        rawPaths.push(
          ...extractPaths(
            operators.fnArray,
            operators.argsArray,
            pdfjs.OPS,
            pageNumber,
            viewport.width,
            viewport.height,
            viewport.transform as Matrix,
          ),
        );
      page.cleanup();
    }
    const cleaned = cleanExtractedPaths(rawPaths);
    return {
      document,
      loadingTask,
      extraction: {
        algorithmVersion: "drawing-vector-1.0",
        pages,
        originalPaths: rawPaths.map((path) => ({
          ...path,
          points: path.points.map((point) => ({ ...point })),
          findings: [...path.findings],
        })),
        paths: cleaned.paths,
        findings: cleaned.findings,
        cleanup: cleaned.cleanup,
      },
    };
  } catch (error) {
    await loadingTask.destroy();
    if (signal.aborted || (error instanceof DOMException && error.name === "AbortError"))
      throw error;
    if (error instanceof Error && error.message.startsWith("PDF ")) throw error;
    throw new Error("The PDF is encrypted, malformed, unsupported, or exceeds declared limits.");
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

function extractPaths(
  functions: number[],
  argumentsList: unknown[][],
  ops: Record<string, number>,
  pageNumber: number,
  pageWidth: number,
  pageHeight: number,
  pageMatrix: Matrix,
): DrawingPath[] {
  const results: DrawingPath[] = [];
  const stack: { matrix: Matrix; lineWidth: number }[] = [];
  let matrix = multiplyMatrices(IDENTITY_MATRIX, pageMatrix);
  let lineWidth = 1;
  let pending: { points: DrawingPoint[]; closed: boolean }[] = [];
  const flush = (forceClosed = false) => {
    for (const path of pending) {
      if (
        results.reduce((sum, item) => sum + item.points.length, 0) + path.points.length >
        DRAWING_LIMITS.maxSegments
      )
        throw new Error("Extracted segment limit exceeded.");
      const xs = path.points.map((point) => point.x);
      const ys = path.points.map((point) => point.y);
      results.push({
        id: `p${pageNumber}-path-${results.length + 1}`,
        pageNumber,
        points: path.points,
        closed: path.closed || forceClosed,
        sourceBounds: {
          x: Math.min(...xs),
          y: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
        },
        lineWidth,
        reviewState: "extracted-review-required",
        classification: "unclassified",
        findings: path.points.some(
          (point) => point.x < 0 || point.y < 0 || point.x > pageWidth || point.y > pageHeight,
        )
          ? ["OUT_OF_PAGE"]
          : [],
      });
    }
    pending = [];
  };
  for (let index = 0; index < functions.length; index += 1) {
    const fn = functions[index];
    const args = argumentsList[index] ?? [];
    if (fn === ops.save) stack.push({ matrix: [...matrix], lineWidth });
    else if (fn === ops.restore) {
      const restored = stack.pop();
      if (restored) ({ matrix, lineWidth } = restored);
    } else if (fn === ops.transform && args.length >= 6)
      matrix = multiplyMatrices(matrix, args.slice(0, 6).map(Number) as Matrix);
    else if (fn === ops.setLineWidth && Number.isFinite(Number(args[0])))
      lineWidth = Math.abs(Number(args[0]));
    else if (fn === ops.constructPath) {
      pending.push(...decodeConstructPath(args, ops, matrix));
      if (pending.length + results.length > DRAWING_LIMITS.maxPaths)
        throw new Error("Extracted path limit exceeded.");
      if (typeof args[0] === "number") flush();
    } else if (
      fn === ops.stroke ||
      fn === ops.fill ||
      fn === ops.eoFill ||
      fn === ops.fillStroke ||
      fn === ops.eoFillStroke ||
      fn === ops.closeStroke ||
      fn === ops.closeFillStroke ||
      fn === ops.closeEOFillStroke
    ) {
      flush(fn === ops.closeStroke || fn === ops.closeFillStroke || fn === ops.closeEOFillStroke);
    } else if (fn === ops.endPath) pending = [];
  }
  return results;
}

function decodeConstructPath(
  args: unknown[],
  ops: Record<string, number>,
  matrix: Matrix,
): { points: DrawingPoint[]; closed: boolean }[] {
  if (typeof args[0] === "number" && Array.isArray(args[1])) {
    return args[1].flatMap((value) => decodeCompactPath(value, matrix));
  }
  const commands =
    Array.isArray(args[0]) || ArrayBuffer.isView(args[0] as ArrayBufferView)
      ? Array.from(args[0] as ArrayLike<number>)
      : [];
  const coordinates =
    Array.isArray(args[1]) || ArrayBuffer.isView(args[1] as ArrayBufferView)
      ? Array.from(args[1] as ArrayLike<number>).map(Number)
      : [];
  const paths: { points: DrawingPoint[]; closed: boolean }[] = [];
  let current: DrawingPoint[] = [];
  let cursor = 0;
  const point = () =>
    transformPoint(matrix, { x: coordinates[cursor++], y: coordinates[cursor++] });
  for (const command of commands) {
    if (command === ops.moveTo) {
      if (current.length > 1) paths.push({ points: current, closed: false });
      current = [point()];
    } else if (command === ops.lineTo) current.push(point());
    else if (command === ops.rectangle) {
      const x = coordinates[cursor++],
        y = coordinates[cursor++],
        width = coordinates[cursor++],
        height = coordinates[cursor++];
      const rectangle = [
        transformPoint(matrix, { x, y }),
        transformPoint(matrix, { x: x + width, y }),
        transformPoint(matrix, { x: x + width, y: y + height }),
        transformPoint(matrix, { x, y: y + height }),
      ];
      paths.push({ points: rectangle, closed: true });
    } else if (command === ops.curveTo) {
      const start = current.at(-1);
      const control1 = point(),
        control2 = point(),
        end = point();
      if (start)
        for (let step = 1; step <= 8; step += 1)
          current.push(cubic(start, control1, control2, end, step / 8));
    } else if (command === ops.closePath) {
      if (current.length > 1) paths.push({ points: current, closed: true });
      current = [];
    }
  }
  if (current.length > 1) paths.push({ points: current, closed: false });
  return paths;
}

function decodeCompactPath(
  value: unknown,
  matrix: Matrix,
): { points: DrawingPoint[]; closed: boolean }[] {
  if (!Array.isArray(value) && !ArrayBuffer.isView(value as ArrayBufferView)) return [];
  const data = Array.from(value as ArrayLike<number>).map(Number);
  const paths: { points: DrawingPoint[]; closed: boolean }[] = [];
  let current: DrawingPoint[] = [];
  for (let index = 0; index < data.length;) {
    const command = data[index++];
    if (command === 0 || command === 1) {
      const next = transformPoint(matrix, { x: data[index++], y: data[index++] });
      if (command === 0) {
        if (current.length > 1) paths.push({ points: current, closed: false });
        current = [next];
      } else current.push(next);
    } else if (command === 2) {
      const start = current.at(-1);
      const first = transformPoint(matrix, { x: data[index++], y: data[index++] });
      const second = transformPoint(matrix, { x: data[index++], y: data[index++] });
      const end = transformPoint(matrix, { x: data[index++], y: data[index++] });
      if (start)
        for (let step = 1; step <= 8; step += 1)
          current.push(cubic(start, first, second, end, step / 8));
    } else if (command === 4) {
      if (current.length > 1) paths.push({ points: current, closed: true });
      current = [];
    } else throw new Error("The PDF contains an unsupported compact path operator.");
  }
  if (current.length > 1) paths.push({ points: current, closed: false });
  return paths;
}

function cubic(a: DrawingPoint, b: DrawingPoint, c: DrawingPoint, d: DrawingPoint, t: number) {
  const inverse = 1 - t;
  return {
    x: inverse ** 3 * a.x + 3 * inverse ** 2 * t * b.x + 3 * inverse * t ** 2 * c.x + t ** 3 * d.x,
    y: inverse ** 3 * a.y + 3 * inverse ** 2 * t * b.y + 3 * inverse * t ** 2 * c.y + t ** 3 * d.y,
  };
}

function hasPdfSignature(bytes: Uint8Array) {
  return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
}
