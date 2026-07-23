import type { PageNumberOptions, PageNumberResult } from "./pageNumberTypes";
import { formatPageNumber } from "./pageNumberFormatting";
import { getPageNumberPlacement } from "./pageNumberGeometry";
import { resolveNumberedPages } from "./pageNumberRange";

export const MAX_PDF_BYTES = 100 * 1024 * 1024;
export const MAX_PDF_PAGES = 500;

export function validatePageNumberFile(file: {
  name: string;
  type: string;
  size: number;
}) {
  const genericMime = !file.type || file.type === "application/octet-stream";
  if (!file.name.toLowerCase().endsWith(".pdf") || (!genericMime && file.type !== "application/pdf")) {
    throw new Error("Select a valid PDF.");
  }
  if (file.size === 0) throw new Error("Select a valid PDF.");
  if (file.size > MAX_PDF_BYTES) throw new Error("This PDF is too large.");
}

export function validatePageCount(pageCount: number) {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error("This PDF could not be opened.");
  }
  if (pageCount > MAX_PDF_PAGES) {
    throw new Error("This PDF contains too many pages.");
  }
}

export function hasPdfSignature(bytes: Uint8Array) {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

export function createNumberedFilename(filename: string) {
  const printableFilename = [...filename]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("");
  const base = printableFilename
    .replace(/\.pdf$/i, "")
    .replace(/[/\\:*?"<>|]+/g, "-")
    .replace(/\.+/g, ".")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, 120);
  return `${base || "document"}-numbered.pdf`;
}

export function validatePageNumberOptions(options: PageNumberOptions, pageCount: number) {
  if (
    !Number.isInteger(options.startingNumber) ||
    options.startingNumber < -999_999 ||
    options.startingNumber > 999_999 ||
    !Number.isInteger(options.fontSize) ||
    options.fontSize < 6 ||
    options.fontSize > 48 ||
    !Number.isInteger(options.margin) ||
    options.margin < 6 ||
    options.margin > 144 ||
    !/^#[0-9A-Fa-f]{6}$/.test(options.color)
  ) {
    throw new Error("Check the page-number options.");
  }
  return resolveNumberedPages(
    pageCount,
    options.pageMode,
    options.customRange,
    options.skipFirst,
  );
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const error = new Error("Page numbering was cancelled.");
    error.name = "AbortError";
    throw error;
  }
}

export async function generateNumberedPdf(
  sourceBytes: Uint8Array,
  sourceFilename: string,
  options: PageNumberOptions,
  runOptions: {
    signal?: AbortSignal;
    onProgress?: (processed: number, total: number) => void;
  } = {},
): Promise<PageNumberResult> {
  if (!sourceBytes.length || sourceBytes.length > MAX_PDF_BYTES || !hasPdfSignature(sourceBytes)) {
    throw new Error("Select a valid PDF.");
  }
  const { PDFDocument, StandardFonts, degrees, rgb } = await import("pdf-lib");
  throwIfAborted(runOptions.signal);
  const defensiveCopy = Uint8Array.from(sourceBytes);
  let pdf;
  try {
    pdf = await PDFDocument.load(defensiveCopy, { updateMetadata: false });
  } catch {
    defensiveCopy.fill(0);
    throw new Error("This PDF could not be opened.");
  }
  const pages = pdf.getPages();
  try {
    validatePageCount(pages.length);
  } catch (error) {
    defensiveCopy.fill(0);
    throw error;
  }

  const selected = validatePageNumberOptions(options, pages.length);
  if (selected.length === 0) {
    defensiveCopy.fill(0);
    throw new Error("Select at least one page to number.");
  }
  const fontNames = {
    Helvetica: options.bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica,
    "Times Roman": options.bold ? StandardFonts.TimesRomanBold : StandardFonts.TimesRoman,
    Courier: options.bold ? StandardFonts.CourierBold : StandardFonts.Courier,
  } as const;
  const font = await pdf.embedFont(fontNames[options.font]);
  const red = Number.parseInt(options.color.slice(1, 3), 16) / 255;
  const green = Number.parseInt(options.color.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(options.color.slice(5, 7), 16) / 255;

  for (let sequenceIndex = 0; sequenceIndex < selected.length; sequenceIndex += 1) {
    throwIfAborted(runOptions.signal);
    const page = pages[selected[sequenceIndex]];
    const text = formatPageNumber(
      options.startingNumber + sequenceIndex,
      selected.length,
      options.format,
    );
    const textWidth = font.widthOfTextAtSize(text, options.fontSize);
    const textHeight = font.heightAtSize(options.fontSize, { descender: false });
    const { width, height } = page.getSize();
    const rotation = page.getRotation().angle;
    const placement = getPageNumberPlacement(
      width,
      height,
      rotation,
      options.position,
      options.margin,
      textWidth,
      textHeight,
    );
    page.drawText(text, {
      x: placement.x,
      y: placement.y,
      size: options.fontSize,
      font,
      color: rgb(red, green, blue),
      rotate: degrees(placement.rotation),
    });
    runOptions.onProgress?.(sequenceIndex + 1, selected.length);
    await Promise.resolve();
  }

  throwIfAborted(runOptions.signal);
  const originalShape = pages.map((page) => ({
    size: page.getSize(),
    rotation: page.getRotation().angle,
  }));
  const saved = await pdf.save({ useObjectStreams: false, addDefaultPage: false });
  defensiveCopy.fill(0);
  if (!saved.length || !hasPdfSignature(saved)) {
    throw new Error("The numbered PDF could not be generated.");
  }
  const reopened = await PDFDocument.load(saved, { updateMetadata: false });
  if (reopened.getPageCount() !== pages.length) {
    throw new Error("The numbered PDF could not be generated.");
  }
  reopened.getPages().forEach((page, index) => {
    const size = page.getSize();
    const original = originalShape[index];
    if (
      size.width !== original.size.width ||
      size.height !== original.size.height ||
      page.getRotation().angle !== original.rotation
    ) {
      throw new Error("The numbered PDF could not be generated.");
    }
  });
  if (typeof window !== "undefined") {
    const [pdfjs, worker] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const loadingTask = pdfjs.getDocument({ data: Uint8Array.from(saved) });
    try {
      const previewDocument = await loadingTask.promise;
      if (previewDocument.numPages !== pages.length) {
        throw new Error("The numbered PDF could not be generated.");
      }
    } catch {
      throw new Error("The numbered PDF could not be generated.");
    } finally {
      await loadingTask.destroy();
    }
  }
  const resultBytes = Uint8Array.from(saved);
  const blob = new Blob([resultBytes], { type: "application/pdf" });
  return {
    blob,
    bytes: resultBytes,
    filename: createNumberedFilename(sourceFilename),
    totalPages: pages.length,
    numberedPages: selected.length,
    options: { ...options },
  };
}
