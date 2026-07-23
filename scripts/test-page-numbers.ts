import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { formatPageNumber } from "../src/features/pageNumbers/pageNumberFormatting";
import { getPageNumberPlacement } from "../src/features/pageNumbers/pageNumberGeometry";
import {
  PageRangeError,
  parsePageRange,
  resolveNumberedPages,
} from "../src/features/pageNumbers/pageNumberRange";
import {
  createNumberedFilename,
  generateNumberedPdf,
  hasPdfSignature,
  MAX_PDF_BYTES,
  validatePageCount,
  validatePageNumberFile,
  validatePageNumberOptions,
} from "../src/features/pageNumbers/pageNumberPdfService";
import {
  DEFAULT_PAGE_NUMBER_OPTIONS,
  PAGE_NUMBER_POSITIONS,
} from "../src/features/pageNumbers/pageNumberTypes";

function rejectsRange(value: string, pageCount = 12) {
  assert.throws(
    () => parsePageRange(value, pageCount),
    (error: unknown) => error instanceof PageRangeError,
  );
}

async function createFixture() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const rotations = [0, 0, 90, 180, 270];
  const sizes: [number, number][] = [
    [420, 595],
    [595, 420],
    [420, 595],
    [420, 595],
    [420, 595],
  ];
  rotations.forEach((rotation, index) => {
    const page = pdf.addPage(sizes[index]);
    page.setRotation(degrees(rotation));
    page.drawText(`ORIGINAL VECTOR TEXT ${index + 1}`, {
      x: 40,
      y: 300,
      font,
      size: 14,
    });
    page.drawRectangle({
      x: 35,
      y: 250,
      width: 140,
      height: 30,
      borderWidth: 2,
      borderColor: rgb(0, 0, 1),
    });
  });
  return pdf.save({ useObjectStreams: false });
}

async function extractPageText(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: Uint8Array.from(bytes) }).promise;
  const pages: string[] = [];
  for (let index = 1; index <= document.numPages; index += 1) {
    const page = await document.getPage(index);
    const text = await page.getTextContent();
    pages.push(text.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  await document.cleanup();
  return pages;
}

async function run() {
  assert.deepEqual(parsePageRange("1", 12), [0]);
  assert.deepEqual(parsePageRange("1-5", 12), [0, 1, 2, 3, 4]);
  assert.deepEqual(parsePageRange("1,3,5", 12), [0, 2, 4]);
  assert.deepEqual(parsePageRange(" 1-3, 8, 10-12 ", 12), [0, 1, 2, 7, 9, 10, 11]);
  assert.deepEqual(parsePageRange("5,1,3,3,1-3", 12), [0, 1, 2, 4]);
  for (const invalid of [
    "",
    "0",
    "-1",
    "1.5",
    "8-3",
    "13",
    "1,,2",
    "1-2-3",
    "1e2",
    "Infinity",
    "NaN",
    "+1",
  ]) {
    rejectsRange(invalid);
  }
  rejectsRange(Array.from({ length: 1_001 }, () => "1").join(","));
  assert.deepEqual(resolveNumberedPages(10, "custom", "1-3,5,7", 2), [2, 4, 6]);
  assert.deepEqual(resolveNumberedPages(5, "all", "", 2), [2, 3, 4]);

  assert.equal(formatPageNumber(1, 9, "numeric"), "1");
  assert.equal(formatPageNumber(1, 9, "zero-padded"), "01");
  assert.equal(formatPageNumber(1, 150, "zero-padded"), "001");
  assert.equal(formatPageNumber(-1, 20, "zero-padded"), "-01");
  assert.equal(formatPageNumber(4, 12, "page-prefix"), "Page 4");
  assert.equal(formatPageNumber(4, 12, "page-of-total"), "Page 4 of 12");
  assert.deepEqual(
    [2, 4, 6].map((_, index) => formatPageNumber(1 + index, 3, "numeric")),
    ["1", "2", "3"],
  );

  for (const rotation of [0, 90, 180, 270]) {
    for (const position of PAGE_NUMBER_POSITIONS) {
      const placement = getPageNumberPlacement(420, 595, rotation, position, 24, 40, 12);
      assert.ok(Number.isFinite(placement.x));
      assert.ok(Number.isFinite(placement.y));
      assert.equal(placement.rotation, ((360 - rotation) % 360) as 0 | 90 | 180 | 270);
    }
  }
  const bottomLeft = getPageNumberPlacement(420, 595, 0, "bottom-left", 24, 40, 12);
  assert.deepEqual(bottomLeft, { x: 24, y: 24, rotation: 0 });
  const topCenter = getPageNumberPlacement(420, 595, 0, "top-center", 24, 40, 12);
  assert.equal(topCenter.x, 190);
  assert.equal(topCenter.y, 559);
  assert.throws(() =>
    getPageNumberPlacement(100, 100, 0, "bottom-center", 90, 80, 20),
  );
  assert.throws(() =>
    getPageNumberPlacement(100, 100, 0, "top-left", 120, 20, 10),
  );

  assert.equal(createNumberedFilename("../../Quarterly\u0000Report.PDF"), "QuarterlyReport-numbered.pdf");
  assert.equal(createNumberedFilename("report.pdf.pdf"), "report.pdf-numbered.pdf");
  assert.equal(createNumberedFilename("..."), "document-numbered.pdf");
  assert.equal(hasPdfSignature(new TextEncoder().encode("%PDF-1.7")), true);
  assert.equal(hasPdfSignature(new TextEncoder().encode("no pdf")), false);
  assert.equal(hasPdfSignature(new Uint8Array()), false);
  assert.ok(MAX_PDF_BYTES === 100 * 1024 * 1024);
  validatePageNumberFile({ name: "scan.pdf", type: "application/pdf", size: 10 });
  validatePageNumberFile({ name: "scan.PDF", type: "", size: 10 });
  validatePageNumberFile({ name: "scan.pdf", type: "application/octet-stream", size: 10 });
  assert.throws(() => validatePageNumberFile({ name: "scan.txt", type: "text/plain", size: 10 }));
  assert.throws(() => validatePageNumberFile({ name: "scan.pdf", type: "application/pdf", size: 0 }));
  assert.throws(() =>
    validatePageNumberFile({
      name: "scan.pdf",
      type: "application/pdf",
      size: MAX_PDF_BYTES + 1,
    }),
  );
  validatePageCount(500);
  assert.throws(() => validatePageCount(0));
  assert.throws(() => validatePageCount(501));

  const fixture = await createFixture();
  const source = await PDFDocument.load(fixture);
  const sourceShape = source.getPages().map((page) => ({
    size: page.getSize(),
    rotation: page.getRotation().angle,
  }));
  const options = {
    ...DEFAULT_PAGE_NUMBER_OPTIONS,
    pageMode: "custom" as const,
    customRange: "1,3,5",
    skipFirst: 1,
    format: "page-of-total" as const,
  };
  assert.deepEqual(validatePageNumberOptions(options, 5), [2, 4]);
  const progress: string[] = [];
  const output = await generateNumberedPdf(fixture, "rotation-fixture.pdf", options, {
    onProgress: (processed, total) => progress.push(`${processed}/${total}`),
  });
  assert.deepEqual(progress, ["1/2", "2/2"]);
  assert.equal(output.blob.type, "application/pdf");
  assert.ok(output.blob.size > 0);
  assert.equal(hasPdfSignature(output.bytes), true);
  assert.equal(output.filename, "rotation-fixture-numbered.pdf");
  assert.equal(output.totalPages, 5);
  assert.equal(output.numberedPages, 2);

  const reopened = await PDFDocument.load(output.bytes);
  assert.equal(reopened.getPageCount(), 5);
  reopened.getPages().forEach((page, index) => {
    assert.deepEqual(page.getSize(), sourceShape[index].size);
    assert.equal(page.getRotation().angle, sourceShape[index].rotation);
  });
  const pageText = await extractPageText(output.bytes);
  pageText.forEach((text, index) => assert.match(text, new RegExp(`ORIGINAL VECTOR TEXT ${index + 1}`)));
  assert.doesNotMatch(pageText[0], /Page 1 of 2|Page 2 of 2/);
  assert.match(pageText[2], /Page 1 of 2/);
  assert.match(pageText[4], /Page 2 of 2/);
  assert.doesNotMatch(pageText[1], /Page 1 of 2|Page 2 of 2/);
  assert.doesNotMatch(pageText[3], /Page 1 of 2|Page 2 of 2/);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => generateNumberedPdf(fixture, "fixture.pdf", DEFAULT_PAGE_NUMBER_OPTIONS, {
      signal: controller.signal,
    }),
    (error: unknown) => error instanceof Error && error.name === "AbortError",
  );
  await assert.rejects(() =>
    generateNumberedPdf(new TextEncoder().encode("invalid"), "bad.pdf", DEFAULT_PAGE_NUMBER_OPTIONS),
  );

  const workspaceSource = await readFile(
    new URL("../src/features/pageNumbers/PageNumberWorkspace.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    workspaceSource,
    /fetch\(|axios|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie|caches\.open/,
  );
  assert.doesNotMatch(workspaceSource, /console\.(log|debug|info)|setInterval/);
  assert.match(workspaceSource, /URL\.revokeObjectURL/);
  assert.match(workspaceSource, /operationRef/);
  assert.match(workspaceSource, /abortRef/);

  console.log("Add Page Numbers tests passed.");
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Add Page Numbers tests failed.");
  process.exitCode = 1;
});
