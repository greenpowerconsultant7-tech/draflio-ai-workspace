/// <reference types="node" />
/// <reference lib="esnext.float16" />

import { stat } from "node:fs/promises";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument, PDFName, StandardFonts, degrees, rgb } from "pdf-lib";
import { AnnotationMode, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { rasterRedactPdf } from "../server/redaction/redactionRasterSpike.js";

const SECRET = "REDACTION_SECRET_48291";
const METADATA_SECRET = "REDACTION_METADATA_71933";
const ORDINARY_TEXT = "Ordinary unredacted text remains visible";
const REPOSITORY_ROOT = resolve(process.cwd());
const REPOSITORY_TEMP_DIRECTORY = resolve(REPOSITORY_ROOT, "temp");
const TEMP_DIRECTORY = resolve(REPOSITORY_TEMP_DIRECTORY, "phase5b0-redaction-raster");
const INPUT_PATH = resolve(TEMP_DIRECTORY, "input.pdf");
const OUTPUT_PATH = resolve(TEMP_DIRECTORY, "output.pdf");
const VERIFY_IMAGE_PATH = resolve(TEMP_DIRECTORY, "verification-page-1.png");
const STANDARD_FONT_DATA_URL = `${fileURLToPath(
  new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url),
).replaceAll("\\", "/")}/`;

function includesUtf8(bytes: Uint8Array, value: string): boolean {
  return Buffer.from(bytes).includes(Buffer.from(value, "utf8"));
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertSafeRepositoryPaths(): Promise<void> {
  const packageManifest = await stat(resolve(REPOSITORY_ROOT, "package.json")).catch(() => null);
  const serverDirectory = await stat(resolve(REPOSITORY_ROOT, "server")).catch(() => null);
  if (!packageManifest?.isFile() || !serverDirectory?.isDirectory()) {
    throw new Error("Refusing cleanup: run the raster spike from the Draflio repository root");
  }

  const relativeTarget = relative(REPOSITORY_TEMP_DIRECTORY, TEMP_DIRECTORY);
  if (
    relativeTarget.length === 0 ||
    relativeTarget === ".." ||
    relativeTarget.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(relativeTarget)
  ) {
    throw new Error("Refusing cleanup: spike directory is outside the repository temp directory");
  }
}

async function createFixture(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(METADATA_SECRET);
  document.setSubject(METADATA_SECRET);
  document.setKeywords([METADATA_SECRET]);
  const font = await document.embedFont(StandardFonts.Helvetica);

  const firstPage = document.addPage([612, 792]);
  firstPage.drawText(SECRET, { x: 72, y: 650, size: 24, font, color: rgb(0, 0, 0) });
  firstPage.drawText(ORDINARY_TEXT, { x: 72, y: 575, size: 18, font, color: rgb(0, 0, 0) });
  const secondPage = document.addPage([612, 792]);
  secondPage.setRotation(degrees(90));
  secondPage.drawText("Rotated landscape second page", {
    x: 72,
    y: 650,
    size: 24,
    font,
    color: rgb(0, 0, 0),
  });

  return document.save({ useObjectStreams: false });
}

async function getVisiblePageDimensions(
  bytes: Uint8Array,
): Promise<Array<{ width: number; height: number }>> {
  const loadingTask = getDocument({
    data: bytes.slice(),
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    useSystemFonts: false,
  });
  const document = await loadingTask.promise;
  const dimensions: Array<{ width: number; height: number }> = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      dimensions.push({ width: viewport.width, height: viewport.height });
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  return dimensions;
}

async function extractText(bytes: Uint8Array): Promise<string> {
  const loadingTask = getDocument({
    data: bytes.slice(),
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    useSystemFonts: false,
  });
  const document = await loadingTask.promise;
  const values: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if ("str" in item) {
          values.push(item.str);
        }
      }
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  return values.join(" ");
}

async function renderVerificationPage(bytes: Uint8Array): Promise<{
  png: Buffer;
  maskPixelBlack: boolean;
  ordinaryRegionHasInk: boolean;
}> {
  const loadingTask = getDocument({
    data: bytes.slice(),
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    useSystemFonts: false,
  });
  const document = await loadingTask.promise;
  try {
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const pageCanvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const pageContext = pageCanvas.getContext("2d");
    try {
      await page.render({
        canvas: null,
        canvasContext: pageContext as unknown as CanvasRenderingContext2D,
        viewport,
        annotationMode: AnnotationMode.DISABLE,
        background: "#ffffff",
      }).promise;

      const maskX = Math.floor(0.25 * pageCanvas.width);
      const maskY = Math.floor(0.17 * pageCanvas.height);
      const maskPixel = pageContext.getImageData(maskX, maskY, 1, 1).data;
      const maskPixelBlack =
        maskPixel[0] === 0 && maskPixel[1] === 0 && maskPixel[2] === 0 && maskPixel[3] === 255;

      const ordinary = pageContext.getImageData(
        Math.floor((60 / 612) * pageCanvas.width),
        Math.floor((185 / 792) * pageCanvas.height),
        Math.floor((440 / 612) * pageCanvas.width),
        Math.floor((40 / 792) * pageCanvas.height),
      ).data;
      let darkPixels = 0;
      for (let index = 0; index < ordinary.length; index += 4) {
        if (ordinary[index] < 128 && ordinary[index + 1] < 128 && ordinary[index + 2] < 128) {
          darkPixels += 1;
        }
      }
      const png = pageCanvas.toBuffer("image/png");
      return { png, maskPixelBlack, ordinaryRegionHasInk: darkPixels > 100 };
    } finally {
      pageCanvas.width = 0;
      pageCanvas.height = 0;
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
}

async function main(): Promise<void> {
  await assertSafeRepositoryPaths();
  await rm(TEMP_DIRECTORY, { recursive: true, force: true });
  await mkdir(TEMP_DIRECTORY, { recursive: true });

  const fixture = await createFixture();
  await writeFile(INPUT_PATH, fixture);
  const inputDocument = await PDFDocument.load(fixture);
  const inputDimensions = await getVisiblePageDimensions(fixture);
  const memoryBefore = process.memoryUsage().rss;
  const startedAt = performance.now();
  const stages: string[] = [];

  const result = await rasterRedactPdf(fixture, {
    dpi: 144,
    rectangles: [
      {
        pageIndex: 0,
        x: 60 / 612,
        y: 105 / 792,
        width: 350 / 612,
        height: 50 / 792,
      },
    ],
    onProgress: (progress) => {
      stages.push(
        `${progress.stage}${progress.totalPages ? ` ${progress.completedPages}/${progress.totalPages}` : ""}`,
      );
    },
  });
  const elapsedMilliseconds = performance.now() - startedAt;
  const memoryAfter = process.memoryUsage().rss;
  await writeFile(OUTPUT_PATH, result.bytes);

  const outputDocument = await PDFDocument.load(result.bytes);
  const outputDimensions = outputDocument.getPages().map((page) => page.getSize());
  const extractedText = await extractText(result.bytes);
  const rendered = await renderVerificationPage(result.bytes);
  await writeFile(VERIFY_IMAGE_PATH, rendered.png);

  assert(
    Buffer.from(result.bytes.subarray(0, 5)).toString("ascii") === "%PDF-",
    "Output PDF signature failed",
  );
  assert(outputDocument.getPageCount() === inputDocument.getPageCount(), "Page count changed");
  assert(inputDimensions.length === outputDimensions.length, "Dimension count changed");
  inputDimensions.forEach((input, index) => {
    const output = outputDimensions[index];
    assert(Math.abs(input.width - output.width) <= 0.01, `Page ${index + 1} width changed`);
    assert(Math.abs(input.height - output.height) <= 0.01, `Page ${index + 1} height changed`);
  });
  assert(!extractedText.includes(SECRET), "Secret remained in PDF.js text extraction");
  assert(extractedText.trim() === "", "Image-only output unexpectedly contains extractable text");
  assert(!includesUtf8(result.bytes, SECRET), "Secret remained in raw output bytes");
  assert(
    !includesUtf8(result.bytes, METADATA_SECRET),
    "Metadata secret remained in raw output bytes",
  );
  assert(outputDocument.getTitle() !== METADATA_SECRET, "Original title metadata remained");
  assert(outputDocument.getSubject() !== METADATA_SECRET, "Original subject metadata remained");
  assert(
    !outputDocument.getKeywords()?.includes(METADATA_SECRET),
    "Original keywords metadata remained",
  );
  assert(!outputDocument.catalog.has(PDFName.of("AcroForm")), "Output contains AcroForm");
  assert(!outputDocument.catalog.has(PDFName.of("Names")), "Output contains a Names dictionary");
  assert(!outputDocument.catalog.has(PDFName.of("OpenAction")), "Output contains OpenAction");
  assert(!outputDocument.catalog.has(PDFName.of("AA")), "Output contains additional actions");
  assert(
    !outputDocument.catalog.has(PDFName.of("OCProperties")),
    "Output contains optional-content layers",
  );
  assert(
    !Buffer.from(result.bytes).equals(Buffer.from(fixture)),
    "Output bytes equal the original input",
  );
  assert(rendered.maskPixelBlack, "Approved mask is not opaque black in the verification render");
  assert(rendered.ordinaryRegionHasInk, "Unredacted text region has no visible dark glyph pixels");

  const report = {
    inputBytes: fixture.byteLength,
    outputBytes: result.bytes.byteLength,
    pageCount: outputDocument.getPageCount(),
    inputDimensions,
    outputDimensions,
    extractedText,
    secretInExtractedText: extractedText.includes(SECRET),
    secretInRawBytes: includesUtf8(result.bytes, SECRET),
    metadataSecretInRawBytes: includesUtf8(result.bytes, METADATA_SECRET),
    outputMetadata: {
      title: outputDocument.getTitle(),
      subject: outputDocument.getSubject(),
      keywords: outputDocument.getKeywords(),
      creator: outputDocument.getCreator(),
      producer: outputDocument.getProducer(),
    },
    catalogChecks: {
      acroForm: outputDocument.catalog.has(PDFName.of("AcroForm")),
      names: outputDocument.catalog.has(PDFName.of("Names")),
      openAction: outputDocument.catalog.has(PDFName.of("OpenAction")),
      additionalActions: outputDocument.catalog.has(PDFName.of("AA")),
      optionalContent: outputDocument.catalog.has(PDFName.of("OCProperties")),
    },
    originalEqualsOutput: Buffer.from(result.bytes).equals(Buffer.from(fixture)),
    maskPixelBlack: rendered.maskPixelBlack,
    ordinaryRegionHasInk: rendered.ordinaryRegionHasInk,
    elapsedMilliseconds: Math.round(elapsedMilliseconds),
    rssBeforeBytes: memoryBefore,
    rssAfterBytes: memoryAfter,
    rssDeltaBytes: memoryAfter - memoryBefore,
    stages,
    files: { input: INPUT_PATH, output: OUTPUT_PATH, verificationImage: VERIFY_IMAGE_PATH },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
