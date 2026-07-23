import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { OCRSupportedLocale } from "@adobe/pdfservices-node-sdk";
import {
  DEFAULT_OCR_LANGUAGE_CODE,
  OCR_LANGUAGES,
  getOcrLanguage,
  searchOcrLanguages,
} from "../shared/ocrLanguages";
import {
  assertOcrLanguageMappingComplete,
  getSdkOcrLocale,
  InvalidOcrLanguageError,
  parseOcrLanguage,
} from "../server/ocr/ocrLanguageMapping";
import {
  cancelOcrJob,
  closeOcrJobStore,
  createOcrJob,
  deleteOcrJob,
  getOcrJobPublicData,
  updateOcrJob,
} from "../server/ocr/ocrJobStore";
import { createOcrRequestPayload } from "../server/adobePdfService";
import {
  createOcrLanguageFormData,
  validatePublicOcrLanguage,
} from "../src/features/ocr/ocrLanguageClient";

function expectInvalidLanguage(value: unknown) {
  assert.throws(
    () => parseOcrLanguage(value),
    (error: unknown) => error instanceof InvalidOcrLanguageError,
  );
}

function makePublicJob(languageCode = DEFAULT_OCR_LANGUAGE_CODE) {
  return {
    job: {
      id: "00000000-0000-4000-8000-000000000001",
      status: "queued",
      stage: "queued",
      message: "OCR job is queued.",
      progress: { mode: "indeterminate" },
      originalFilename: "input.pdf",
      outputFilename: "input_searchable.pdf",
      ocrLanguage: {
        code: languageCode,
        label: getOcrLanguage(parseOcrLanguage(languageCode)).label,
      },
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      resultReady: false,
    },
  };
}

async function run() {
  const sdkPackage = JSON.parse(
    await readFile(
      new URL("../node_modules/@adobe/pdfservices-node-sdk/package.json", import.meta.url),
      "utf8",
    ),
  ) as { version?: unknown };
  assert.equal(sdkPackage.version, "4.1.0");

  assert.equal(DEFAULT_OCR_LANGUAGE_CODE, "en-US");
  assert.equal(OCR_LANGUAGES.length, 38);
  assert.equal(OCR_LANGUAGES[0].code, DEFAULT_OCR_LANGUAGE_CODE);
  assert.equal(new Set(OCR_LANGUAGES.map(({ code }) => code)).size, OCR_LANGUAGES.length);
  assert.equal(new Set(OCR_LANGUAGES.map(({ label }) => label)).size, OCR_LANGUAGES.length);
  assert.ok(OCR_LANGUAGES.every(({ label }) => label.trim().length > 0));
  assert.deepEqual(
    OCR_LANGUAGES.slice(1).map(({ label }) => label),
    [...OCR_LANGUAGES.slice(1).map(({ label }) => label)].sort(
      (left, right) => left.localeCompare(right, "en"),
    ),
  );
  assert.ok(
    OCR_LANGUAGES.every((entry) =>
      Object.values(entry).every((value) => typeof value === "string"),
    ),
  );

  assert.equal(assertOcrLanguageMappingComplete(), true);
  assert.equal(Object.values(OCRSupportedLocale).length, OCR_LANGUAGES.length);
  for (const { code } of OCR_LANGUAGES) {
    assert.equal(parseOcrLanguage(code), code);
    assert.equal(getSdkOcrLocale(code), code);
  }
  assert.equal(parseOcrLanguage(undefined), "en-US");
  assert.equal(parseOcrLanguage("fr-FR"), "fr-FR");
  assert.equal(parseOcrLanguage("ja-JP"), "ja-JP");
  for (const value of ["", "EN-US", "en-us", "xx-XX", "x".repeat(1_000), [], {}, 1, null]) {
    expectInvalidLanguage(value);
  }

  assert.equal(searchOcrLanguages("").length, OCR_LANGUAGES.length);
  assert.deepEqual(
    searchOcrLanguages("french").map(({ code }) => code),
    ["fr-FR"],
  );
  assert.deepEqual(
    searchOcrLanguages("switzerland").map(({ code }) => code),
    ["de-CH"],
  );
  assert.deepEqual(
    searchOcrLanguages("ja-jp").map(({ code }) => code),
    ["ja-JP"],
  );
  assert.equal(searchOcrLanguages("auto-detect").length, 0);

  assert.deepEqual(createOcrRequestPayload("asset-1", { language: OCRSupportedLocale.EN_US }), {
    assetID: "asset-1",
    ocrLang: OCRSupportedLocale.EN_US,
  });
  assert.deepEqual(createOcrRequestPayload("asset-2", { language: OCRSupportedLocale.JA_JP }), {
    assetID: "asset-2",
    ocrLang: OCRSupportedLocale.JA_JP,
  });

  const job = createOcrJob({
    originalFilename: "input.pdf",
    outputFilename: "input_searchable.pdf",
    ocrLanguage: "fr-FR",
    inputBuffer: Buffer.from("%PDF-1.7"),
  });
  assert.deepEqual(getOcrJobPublicData(job.id)?.ocrLanguage, {
    code: "fr-FR",
    label: "French (France)",
  });
  updateOcrJob(job.id, {
    status: "completed",
    stage: "completed",
    message: "OCR completed.",
    outputBuffer: Buffer.from("%PDF-1.7 output"),
  });
  assert.equal(getOcrJobPublicData(job.id)?.ocrLanguage.code, "fr-FR");
  assert.equal("inputBuffer" in (getOcrJobPublicData(job.id) ?? {}), false);
  assert.equal("abortController" in (getOcrJobPublicData(job.id) ?? {}), false);
  deleteOcrJob(job.id);

  const cancelledJob = createOcrJob({
    originalFilename: "input.pdf",
    outputFilename: "input_searchable.pdf",
    ocrLanguage: "ja-JP",
    inputBuffer: Buffer.from("%PDF-1.7"),
  });
  cancelOcrJob(cancelledJob.id);
  assert.equal(getOcrJobPublicData(cancelledJob.id)?.ocrLanguage.code, "ja-JP");
  assert.equal(getOcrJobPublicData(cancelledJob.id)?.status, "cancelled");
  deleteOcrJob(cancelledJob.id);

  const failedJob = createOcrJob({
    originalFilename: "input.pdf",
    outputFilename: "input_searchable.pdf",
    ocrLanguage: "de-DE",
    inputBuffer: Buffer.from("%PDF-1.7"),
  });
  updateOcrJob(failedJob.id, {
    status: "failed",
    stage: "failed",
    message: "OCR processing failed.",
    error: {
      message: "The OCR job could not be completed.",
      code: "OCR_PROCESSING_FAILED",
    },
  });
  assert.equal(getOcrJobPublicData(failedJob.id)?.ocrLanguage.code, "de-DE");
  deleteOcrJob(failedJob.id);

  const accepted = validatePublicOcrLanguage(makePublicJob().job.ocrLanguage);
  assert.equal(accepted.code, "en-US");
  assert.throws(() =>
    validatePublicOcrLanguage({
      code: "en-US",
      label: "Client supplied label",
    }),
  );
  assert.throws(() => validatePublicOcrLanguage({ code: "xx-XX", label: "Unknown" }));

  const file = new File(["%PDF-1.7"], "input.pdf", { type: "application/pdf" });
  const formData = createOcrLanguageFormData(file, "de-DE");
  assert.equal(formData.get("ocrLanguage"), "de-DE");
  assert.equal(formData.getAll("ocrLanguage").length, 1);
  assert.equal(formData.has("languageLabel"), false);
  assert.ok(formData.get("file") instanceof File);

  const serviceSource = await readFile(
    new URL("../src/features/ocr/OcrPdfService.ts", import.meta.url),
    "utf8",
  );
  assert.match(serviceSource, /signal,/);
  assert.doesNotMatch(serviceSource, /localStorage|sessionStorage|indexedDB|document\.cookie/);
  const jobServiceSource = await readFile(
    new URL("../server/ocr/ocrJobService.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(jobServiceSource, /console\.error\([^)]*,\s*error/s);
  assert.match(jobServiceSource, /The OCR job could not be completed\./);

  closeOcrJobStore();
  console.log(`Smart OCR language tests passed (${OCR_LANGUAGES.length} provider locales).`);
}

run().catch((error: unknown) => {
  closeOcrJobStore();
  console.error(error instanceof Error ? error.message : "Smart OCR language tests failed.");
  process.exitCode = 1;
});
