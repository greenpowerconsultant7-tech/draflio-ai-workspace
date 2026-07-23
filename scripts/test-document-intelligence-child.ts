import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { degrees, PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { chunkDocumentPages } from "../server/documentIntelligence/documentChunking";
import { extractDocumentIntelligence } from "../server/documentIntelligence/documentIntelligenceExtractorCore";
import {
  getActiveDocumentIntelligenceChildCount,
  runIsolatedDocumentExtraction,
} from "../server/documentIntelligence/documentIntelligenceExtractorClient";
import {
  DOCUMENT_INTELLIGENCE_ENVIRONMENT_KEYS,
  isExtractionChildMessage,
  isExtractionParentMessage,
} from "../server/documentIntelligence/documentIntelligenceProtocol";
import type { DocumentPageContext } from "../server/documentIntelligence/documentIntelligenceTypes";
import { superviseChildProcess } from "../server/redaction/redactionRendererSupervisor";

async function searchableFixture() {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let pageIndex = 0; pageIndex < 2; pageIndex += 1) {
    const page = document.addPage(pageIndex === 0 ? [420, 595] : [595, 420]);
    if (pageIndex === 1) page.setRotation(degrees(90));
    for (let line = 0; line < 45; line += 1) {
      page.drawText(
        `Controlled paragraph ${pageIndex + 1}.${line + 1}. Searchable content remains page aware and deterministic.`,
        { x: 30, y: 560 - line * 11, size: 8, font },
      );
    }
    page.drawRectangle({
      x: 25,
      y: 20,
      width: 150,
      height: 25,
      borderWidth: 2,
      borderColor: rgb(0, 0, 1),
    });
  }
  return document.save({ useObjectStreams: false });
}

async function imageFixture(withText: boolean) {
  const document = await PDFDocument.create();
  const page = document.addPage([300, 300]);
  const png = await document.embedPng(
    Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGQAAAAASUVORK5CYII=",
        "base64",
      ),
    ),
  );
  page.drawImage(png, { x: 20, y: 20, width: 260, height: 260 });
  if (withText) {
    const font = await document.embedFont(StandardFonts.Helvetica);
    page.drawText("Mixed searchable content", { x: 30, y: 150, font, size: 12 });
    page.drawLine({ start: { x: 20, y: 10 }, end: { x: 280, y: 10 }, thickness: 2 });
  }
  return document.save({ useObjectStreams: false });
}

async function runCompiledChild(bytes: Uint8Array) {
  const childPath = fileURLToPath(
    new URL(
      "../dist/document-intelligence/server/documentIntelligence/documentIntelligenceExtractorChild.js",
      import.meta.url,
    ),
  );
  const child = fork(childPath, [], {
    execArgv: [],
    env: { TEMP: process.env.TEMP, TMP: process.env.TMP },
    serialization: "advanced",
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  const requestId = "123e4567-e89b-42d3-a456-426614174000";
  return new Promise<void>((resolve, reject) => {
    let sent = false;
    child.on("message", (value: unknown) => {
      if (!isExtractionChildMessage(value)) {
        reject(new Error("Invalid compiled child response."));
        child.kill();
        return;
      }
      if (value.kind === "ready" && !sent) {
        sent = true;
        child.send({ kind: "extract", requestId, pdfBytes: Uint8Array.from(bytes) });
      }
      if (value.kind === "completed") {
        assert.equal(value.context.pageDimensions.length, 2);
        child.disconnect();
      }
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error("Compiled child failed."));
    });
  });
}

async function run() {
  const searchable = await searchableFixture();
  const direct = await extractDocumentIntelligence(searchable);
  assert.equal(direct.pageDimensions.length, 2);
  assert.equal(direct.pageDimensions[0].rotation, 0);
  assert.equal(direct.pageDimensions[1].rotation, 90);
  assert.equal(direct.classification, "native-vector-searchable");
  assert.ok(direct.pages.every((page) => page.text.includes("Controlled paragraph")));
  assert.ok(direct.pages.flatMap((page) => page.items).every((item) =>
    [item.x, item.y, item.width, item.height].every(Number.isFinite) &&
    item.x >= 0 &&
    item.y >= 0 &&
    item.width > 0 &&
    item.height > 0 &&
    item.x + item.width <= 1 &&
    item.y + item.height <= 1
  ));
  assert.ok(direct.chunks.length >= 2);
  assert.ok(direct.chunks.every((chunk) => chunk.text.length <= 2_500));
  assert.ok(direct.chunks.every((chunk) => chunk.id.startsWith(`chunk-p${chunk.pageIndex}-`)));
  assert.equal(new Set(direct.chunks.map((chunk) => chunk.id)).size, direct.chunks.length);

  const mixed = await extractDocumentIntelligence(await imageFixture(true));
  assert.equal(mixed.classification, "mixed-content");
  const imageOnly = await extractDocumentIntelligence(await imageFixture(false));
  assert.equal(imageOnly.classification, "image-only");

  const empty = await PDFDocument.create();
  empty.addPage([100, 100]);
  const unsupported = await extractDocumentIntelligence(await empty.save());
  assert.equal(unsupported.classification, "empty-or-unsupported");
  await assert.rejects(() =>
    extractDocumentIntelligence(new TextEncoder().encode("%PDF-malformed")),
  );
  const tooManyPages = await PDFDocument.create();
  for (let index = 0; index < 51; index += 1) tooManyPages.addPage([10, 10]);
  const tooManyPageBytes = await tooManyPages.save();
  await assert.rejects(
    () => extractDocumentIntelligence(tooManyPageBytes),
    (error: unknown) =>
      error instanceof Error && error.message === "DOCUMENT_INTELLIGENCE_PAGE_LIMIT",
  );

  const pages: DocumentPageContext[] = [
    {
      pageIndex: 0,
      text: `${"First sentence. ".repeat(180)}\n\n${"Second paragraph. ".repeat(180)}`,
      items: [],
      evidence: { textItems: 1, vectorOperations: 0, imageOperations: 0 },
    },
    {
      pageIndex: 1,
      text: "Separate page content.",
      items: [],
      evidence: { textItems: 1, vectorOperations: 0, imageOperations: 0 },
    },
  ];
  const chunksOne = chunkDocumentPages(pages);
  const chunksTwo = chunkDocumentPages(pages);
  assert.deepEqual(chunksOne, chunksTwo);
  assert.ok(chunksOne.every((chunk) => chunk.pageIndex === 0 || chunk.text === "Separate page content."));

  assert.equal(
    isExtractionParentMessage({
      kind: "extract",
      requestId: "123e4567-e89b-42d3-a456-426614174000",
      pdfBytes: Uint8Array.from(searchable),
    }),
    true,
  );
  assert.equal(isExtractionParentMessage({ kind: "extract", requestId: "bad", pdfBytes: [] }), false);
  assert.equal(isExtractionChildMessage({ kind: "ready", extra: true }), false);

  const isolated = await runIsolatedDocumentExtraction({ bytes: searchable });
  assert.equal(isolated.context.classification, "native-vector-searchable");
  assert.deepEqual(isolated.environmentKeys, [...DOCUMENT_INTELLIGENCE_ENVIRONMENT_KEYS].filter(
    (key) => process.env[key] !== undefined,
  ).sort());
  const isolatedEnvironmentKeys: readonly string[] = isolated.environmentKeys;
  assert.equal(isolatedEnvironmentKeys.includes("NODE_OPTIONS"), false);
  assert.equal(isolated.environmentKeys.some((key) => /ADOBE|OPENAI|SUPABASE|PROXY/i.test(key)), false);
  assert.equal(getActiveDocumentIntelligenceChildCount(), 0);

  await runCompiledChild(searchable);

  const watchdog = await superviseChildProcess({
    modulePath: fileURLToPath(
      new URL("./document-intelligence-hang-child.ts", import.meta.url),
    ),
    execArgv: ["--import", "tsx"],
    environment: { TEMP: process.env.TEMP, TMP: process.env.TMP },
    watchdogMs: 50,
    cancellationGraceMs: 50,
  });
  assert.equal(watchdog.cancellationReason, "timeout");
  assert.equal(watchdog.forced, true);
  console.log("Document Intelligence child tests passed.");
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Document Intelligence child tests failed.");
  process.exitCode = 1;
});
