/// <reference types="node" />
/// <reference lib="esnext.float16" />

import { PDFDocument, PDFName } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const PDF_SIGNATURE = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const DIMENSION_TOLERANCE_POINTS = 0.01;

export const NEUTRAL_METADATA = {
  title: "Redacted document",
  author: "",
  subject: "",
  keywords: "",
  creator: "Draflio raster redaction",
  producer: "pdf-lib (https://github.com/Hopding/pdf-lib)",
} as const;

export interface RedactionVerificationInput {
  inputBytes: Uint8Array;
  outputBytes: Uint8Array;
  expectedPageDimensions: Array<{ width: number; height: number }>;
}

export interface RedactionVerificationMetrics {
  pageCount: number;
  outputBytes: number;
}

function hasPdfSignature(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= PDF_SIGNATURE.length &&
    PDF_SIGNATURE.every((byte, index) => bytes[index] === byte)
  );
}

function dimensionsMatch(
  actual: { width: number; height: number },
  expected: { width: number; height: number },
): boolean {
  return (
    Math.abs(actual.width - expected.width) <= DIMENSION_TOLERANCE_POINTS &&
    Math.abs(actual.height - expected.height) <= DIMENSION_TOLERANCE_POINTS
  );
}

function buffersEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => right[index] === byte);
}

export async function verifyRasterRedactionOutput(
  input: RedactionVerificationInput,
): Promise<RedactionVerificationMetrics> {
  if (input.outputBytes.byteLength === 0 || !hasPdfSignature(input.outputBytes)) {
    throw new Error("REDACTION_OUTPUT_INVALID");
  }
  if (buffersEqual(input.inputBytes, input.outputBytes)) {
    throw new Error("REDACTION_OUTPUT_NOT_REBUILT");
  }

  const pdfDocument = await PDFDocument.load(input.outputBytes);
  const pages = pdfDocument.getPages();
  if (pages.length !== input.expectedPageDimensions.length) {
    throw new Error("REDACTION_PAGE_COUNT_MISMATCH");
  }
  pages.forEach((page, index) => {
    if (!dimensionsMatch(page.getSize(), input.expectedPageDimensions[index])) {
      throw new Error("REDACTION_PAGE_DIMENSIONS_MISMATCH");
    }
  });

  if (
    pdfDocument.getTitle() !== NEUTRAL_METADATA.title ||
    (pdfDocument.getAuthor() ?? "") !== NEUTRAL_METADATA.author ||
    (pdfDocument.getSubject() ?? "") !== NEUTRAL_METADATA.subject ||
    (pdfDocument.getKeywords() ?? "") !== NEUTRAL_METADATA.keywords ||
    pdfDocument.getCreator() !== NEUTRAL_METADATA.creator ||
    pdfDocument.getProducer() !== NEUTRAL_METADATA.producer
  ) {
    throw new Error("REDACTION_METADATA_INVALID");
  }

  for (const key of ["AcroForm", "Names", "OpenAction", "AA", "OCProperties"]) {
    if (pdfDocument.catalog.has(PDFName.of(key))) {
      throw new Error("REDACTION_FORBIDDEN_CATALOG_ENTRY");
    }
  }

  const pdfJsCopy = input.outputBytes.slice();
  const loadingTask = getDocument({ data: pdfJsCopy });
  try {
    const pdfJsDocument = await loadingTask.promise;
    if (pdfJsDocument.numPages !== input.expectedPageDimensions.length) {
      throw new Error("REDACTION_PDFJS_PAGE_COUNT_MISMATCH");
    }
    for (let pageNumber = 1; pageNumber <= pdfJsDocument.numPages; pageNumber += 1) {
      const page = await pdfJsDocument.getPage(pageNumber);
      try {
        const viewport = page.getViewport({ scale: 1 });
        if (!dimensionsMatch(viewport, input.expectedPageDimensions[pageNumber - 1])) {
          throw new Error("REDACTION_PDFJS_DIMENSIONS_MISMATCH");
        }
        const textContent = await page.getTextContent();
        const hasText = textContent.items.some((item) => "str" in item && item.str.length > 0);
        if (hasText) {
          throw new Error("REDACTION_OUTPUT_CONTAINS_TEXT");
        }
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await loadingTask.destroy();
    if (pdfJsCopy.byteLength > 0) {
      pdfJsCopy.fill(0);
    }
  }

  return {
    pageCount: pages.length,
    outputBytes: input.outputBytes.byteLength,
  };
}
