import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  cancelPublicDocumentIntelligenceSession,
  createDocumentIntelligence,
  getPublicDocumentIntelligenceSession,
} from "../server/documentIntelligence/documentIntelligenceService";
import {
  closeDocumentIntelligenceQueue,
  getDocumentIntelligenceQueueMetrics,
} from "../server/documentIntelligence/documentIntelligenceQueue";
import {
  closeDocumentIntelligenceStore,
  DOCUMENT_INTELLIGENCE_LIMITS,
  getDocumentIntelligenceContext,
  getDocumentIntelligenceStoreMetrics,
} from "../server/documentIntelligence/documentIntelligenceSessionStore";
import {
  sanitizeDocumentIntelligenceFilename,
  validateDocumentIntelligenceSessionId,
  validateDocumentIntelligenceUpload,
} from "../server/documentIntelligence/documentIntelligenceValidator";

async function fixture(pageCount = 2) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = document.addPage([420, 595]);
    for (let line = 0; line < 30; line += 1) {
      page.drawText(
        `Private fixture marker page ${pageIndex + 1} line ${line + 1}. Deterministic searchable paragraph.`,
        { x: 25, y: 560 - line * 15, font, size: 9 },
      );
    }
    page.drawRectangle({ x: 20, y: 20, width: 100, height: 20, borderWidth: 1 });
  }
  return document.save({ useObjectStreams: false });
}

function upload(bytes: Uint8Array, overrides: Partial<{
  size: number;
  mimetype: string;
  originalname: string;
}> = {}) {
  return {
    size: overrides.size ?? bytes.byteLength,
    buffer: Buffer.from(bytes),
    mimetype: overrides.mimetype ?? "application/pdf",
    originalname: overrides.originalname ?? "controlled.pdf",
  };
}

async function waitForTerminal(id: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const session = getPublicDocumentIntelligenceSession(id);
    if (["ready", "failed", "cancelled"].includes(session.status)) return session;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Session did not reach a terminal state.");
}

async function run() {
  assert.equal(DOCUMENT_INTELLIGENCE_LIMITS.maximumInputBytes, 20 * 1024 * 1024);
  assert.equal(DOCUMENT_INTELLIGENCE_LIMITS.maximumPages, 50);
  assert.equal(DOCUMENT_INTELLIGENCE_LIMITS.maximumLiveSessions, 25);
  assert.equal(DOCUMENT_INTELLIGENCE_LIMITS.maximumQueuedExtractions, 10);
  assert.equal(DOCUMENT_INTELLIGENCE_LIMITS.maximumActiveExtractions, 1);
  assert.equal(DOCUMENT_INTELLIGENCE_LIMITS.maximumRetainedInputBytes, 200 * 1024 * 1024);
  assert.equal(DOCUMENT_INTELLIGENCE_LIMITS.maximumRetainedTextBytes, 50 * 1024 * 1024);
  assert.equal(DOCUMENT_INTELLIGENCE_LIMITS.expirationMs, 25 * 60 * 1000);

  const bytes = await fixture();
  assert.throws(() => validateDocumentIntelligenceUpload(undefined));
  assert.throws(() => validateDocumentIntelligenceUpload(upload(new Uint8Array())));
  assert.throws(() =>
    validateDocumentIntelligenceUpload(upload(bytes, { originalname: "bad.txt" })),
  );
  assert.throws(() =>
    validateDocumentIntelligenceUpload(upload(bytes, { mimetype: "text/plain" })),
  );
  validateDocumentIntelligenceUpload(upload(bytes, { mimetype: "application/octet-stream" }));
  assert.throws(() =>
    validateDocumentIntelligenceUpload(upload(new TextEncoder().encode("not pdf"))),
  );
  assert.throws(() =>
    validateDocumentIntelligenceUpload(
      upload(bytes, { size: DOCUMENT_INTELLIGENCE_LIMITS.maximumInputBytes + 1 }),
    ),
  );
  assert.equal(sanitizeDocumentIntelligenceFilename("../../safe\u0000name.pdf"), "safename.pdf");
  assert.throws(() => validateDocumentIntelligenceSessionId("malformed"));

  const original = Uint8Array.from(bytes);
  const created = createDocumentIntelligence("controlled.pdf", original);
  assert.match(
    created.id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  assert.equal(created.status, "queued");
  assert.equal(created.revision >= 1, true);
  const terminal = await waitForTerminal(created.id);
  assert.equal(terminal.status, "ready");
  assert.equal(terminal.ready, true);
  assert.equal(terminal.pageCount, 2);
  assert.equal(terminal.searchableTextAvailable, true);
  assert.equal(terminal.ocrRequired, false);
  assert.ok(terminal.pageDimensions?.every((dimension) => dimension.width > 0));
  const polledAgain = getPublicDocumentIntelligenceSession(created.id);
  assert.equal(polledAgain.revision, terminal.revision);
  assert.equal(polledAgain.updatedAt, terminal.updatedAt);

  const publicKeys = Object.keys(terminal).sort();
  for (const forbidden of [
    "inputBytes",
    "context",
    "pages",
    "text",
    "items",
    "chunks",
    "abortController",
    "expiresAt",
    "queue",
    "parser",
  ]) {
    assert.equal(publicKeys.includes(forbidden), false);
  }
  assert.doesNotMatch(JSON.stringify(terminal), /Private fixture marker/);

  const contextOne = getDocumentIntelligenceContext(created.id);
  assert.match(contextOne.pages[0].text, /Private fixture marker/);
  const authoritativeText = contextOne.pages[0].text;
  contextOne.pages[0].text = "mutated";
  contextOne.chunks[0].text = "mutated";
  const contextTwo = getDocumentIntelligenceContext(created.id);
  assert.equal(contextTwo.pages[0].text, authoritativeText);
  assert.notEqual(contextTwo.chunks[0].text, "mutated");

  const deleted = cancelPublicDocumentIntelligenceSession(created.id);
  assert.equal(deleted.status, "cancelled");
  assert.throws(() => getPublicDocumentIntelligenceSession(created.id));
  assert.throws(() => getDocumentIntelligenceContext(created.id));

  const cancellation = createDocumentIntelligence("cancel.pdf", await fixture(20));
  const cancelled = cancelPublicDocumentIntelligenceSession(cancellation.id);
  assert.equal(cancelled.status, "cancelled");
  const repeated = cancelPublicDocumentIntelligenceSession(cancellation.id);
  assert.equal(repeated.status, "cancelled");
  assert.equal(repeated.revision, cancelled.revision);
  assert.throws(() => getDocumentIntelligenceContext(cancellation.id));

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(getDocumentIntelligenceQueueMetrics().active <= 1, true);
  assert.equal(getDocumentIntelligenceStoreMetrics().retainedInputBytes, 0);

  await closeDocumentIntelligenceQueue();
  closeDocumentIntelligenceStore();
  assert.deepEqual(getDocumentIntelligenceStoreMetrics(), {
    sessions: 0,
    retainedInputBytes: 0,
    retainedTextBytes: 0,
  });
  console.log("Document Intelligence session tests passed.");
}

run().catch(async (error: unknown) => {
  await closeDocumentIntelligenceQueue();
  closeDocumentIntelligenceStore();
  console.error(error instanceof Error ? error.message : "Document Intelligence tests failed.");
  process.exitCode = 1;
});
