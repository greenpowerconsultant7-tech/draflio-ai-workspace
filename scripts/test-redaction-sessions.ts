/// <reference types="node" />
/// <reference lib="esnext.float16" />

import { createHash } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express, { type RequestHandler } from "express";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { apiErrorHandler, requestIdMiddleware } from "../server/errors/apiErrorMiddleware.js";
import { isApiError } from "../server/errors/apiError.js";
import { createRedactionRouter } from "../server/redaction/redactionRoutes.js";
import {
  getActiveRedactionRendererCount,
  runIsolatedRedaction,
  type IsolatedRedactionInput,
  type IsolatedRedactionResult,
} from "../server/redaction/redactionRendererClient.js";
import { RedactionSessionService } from "../server/redaction/redactionSessionService.js";
import { RedactionSessionStore } from "../server/redaction/redactionSessionStore.js";
import {
  REDACTION_SESSION_MAX_LIVE,
  REDACTION_SESSION_MAX_RETAINED_INPUT_BYTES,
  type PublicRedactionSession,
} from "../server/redaction/redactionSessionTypes.js";
import {
  inspectRedactionPdf,
  validateFinalizeRequest,
  validatePixelBudget,
} from "../server/redaction/redactionSessionValidator.js";
import { verifyRasterRedactionOutput } from "../server/redaction/redactionVerificationService.js";

const SECRET = "SESSION_SECRET_92741";
const METADATA_SECRET = "SESSION_METADATA_38155";
const FILENAME_SECRET = "private-client-name";
const publicKeys = new Set([
  "id",
  "status",
  "stage",
  "message",
  "progress",
  "revision",
  "originalFilename",
  "outputFilename",
  "inputMediaType",
  "outputMediaType",
  "pageCount",
  "pageDimensions",
  "dpi",
  "createdAt",
  "updatedAt",
  "resultReady",
  "error",
]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function uploadedFile(bytes: Buffer, name = "../../private report.pdf"): Express.Multer.File {
  return {
    fieldname: "file",
    originalname: name,
    encoding: "7bit",
    mimetype: "application/pdf",
    size: bytes.byteLength,
    destination: "",
    filename: "",
    path: "",
    buffer: bytes,
    stream: undefined as unknown as Express.Multer.File["stream"],
  };
}

async function fixture(pageCount = 2): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(METADATA_SECRET);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pageCount; index += 1) {
    const page = pdf.addPage([612, 792]);
    if (index === 1) page.setRotation(degrees(90));
    page.drawText(index === 0 ? SECRET : `Page ${index + 1}`, {
      x: 72,
      y: 650,
      size: 22,
      font,
      color: rgb(0, 0, 0),
    });
  }
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

function finalizeBody(revision = 1, dpi = 144) {
  return {
    confirmation: true,
    revision,
    dpi,
    rectangles: [{ pageIndex: 0, x: 0.1, y: 0.14, width: 0.5, height: 0.08 }],
  };
}

async function waitTerminal(
  service: RedactionSessionService,
  id: string,
): Promise<PublicRedactionSession> {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const session = service.getSession(id);
    if (["completed", "failed", "cancelled"].includes(session.status)) return session;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Session did not become terminal");
}

async function expectApiError(
  action: () => unknown | Promise<unknown>,
  status: number,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    assert(isApiError(error) && error.statusCode === status, `Expected API status ${status}`);
    return;
  }
  throw new Error(`Expected API status ${status}`);
}

function successfulRenderer(
  output: Uint8Array,
): (input: IsolatedRedactionInput) => Promise<IsolatedRedactionResult> {
  return async (input) => ({
    bytes: output.slice(),
    metrics: {
      pageCount: input.expected.pageCount,
      totalPixels: 1,
      outputBytes: output.byteLength,
      processingMilliseconds: 1,
      environmentKeys: [],
    },
    exitCode: 0,
    signal: null,
  });
}

async function main(): Promise<void> {
  const original = await fixture();
  const sourceDimensions = await inspectRedactionPdf(original);
  assert(sourceDimensions.pageDimensions[1].width === 792, "Rotated width was not preserved");
  assert(sourceDimensions.pageDimensions[1].height === 612, "Rotated height was not preserved");

  const service = new RedactionSessionService(runIsolatedRedaction);
  const created = await service.createSession(uploadedFile(Buffer.from(original)));
  assert(created.status === "review-ready" && created.revision === 1, "Creation state is invalid");
  assert(created.outputFilename === "private-report-redacted.pdf", "Filename was not sanitized");
  assert(
    Object.keys(created).every((key) => publicKeys.has(key)),
    "Public session has unknown keys",
  );
  const serialized = JSON.stringify(created);
  for (const forbidden of [
    "inputBuffer",
    "outputBuffer",
    "expiresAt",
    "acceptedRectangles",
    "AbortController",
  ]) {
    assert(!serialized.includes(forbidden), `Public session exposed ${forbidden}`);
  }

  await expectApiError(() => service.getSession("not-a-uuid"), 400);
  await expectApiError(() => service.getResult(created.id), 409);
  await expectApiError(
    () => service.finalizeSession(created.id, { ...finalizeBody(), confirmation: false }),
    400,
  );
  await expectApiError(() => service.finalizeSession(created.id, finalizeBody(2)), 409);
  for (const rectangle of [
    { pageIndex: -1, x: 0, y: 0, width: 0.1, height: 0.1 },
    { pageIndex: 2, x: 0, y: 0, width: 0.1, height: 0.1 },
    { pageIndex: 0, x: -0.1, y: 0, width: 0.1, height: 0.1 },
    { pageIndex: 0, x: 0, y: 0, width: 0, height: 0.1 },
    { pageIndex: 0, x: 0.9, y: 0, width: 0.2, height: 0.1 },
    { pageIndex: 0, x: Number.NaN, y: 0, width: 0.1, height: 0.1 },
    { pageIndex: 0, x: Number.POSITIVE_INFINITY, y: 0, width: 0.1, height: 0.1 },
  ]) {
    await expectApiError(
      () =>
        validateFinalizeRequest(
          { confirmation: true, revision: 1, dpi: 144, rectangles: [rectangle] },
          service.store.get(created.id),
        ),
      400,
    );
  }
  await expectApiError(() => service.finalizeSession(created.id, finalizeBody(1, 95)), 400);
  await expectApiError(() => service.finalizeSession(created.id, finalizeBody(1, 201)), 400);
  await expectApiError(() => validatePixelBudget([{ width: 5_000, height: 100 }], 200), 422);
  await expectApiError(() => validatePixelBudget([{ width: 3_000, height: 3_000 }], 200), 422);
  await expectApiError(
    () =>
      validatePixelBudget(
        Array.from({ length: 10 }, () => ({ width: 1_100, height: 1_100 })),
        144,
      ),
    422,
  );

  const queued = service.finalizeSession(created.id, finalizeBody());
  assert(queued.status === "queued", "Finalization did not return the queued state");
  await expectApiError(() => service.finalizeSession(created.id, finalizeBody(2)), 409);
  const completed = await waitTerminal(service, created.id);
  assert(
    completed.status === "completed" && completed.resultReady,
    "Finalization did not complete",
  );
  const firstResult = service.getResult(created.id).data;
  const secondResult = service.getResult(created.id).data;
  const firstHash = createHash("sha256").update(firstResult).digest("hex");
  const secondHash = createHash("sha256").update(secondResult).digest("hex");
  assert(
    firstHash === secondHash && firstResult.byteLength === secondResult.byteLength,
    "Stored result changed",
  );
  const verificationInput = new Uint8Array(original.byteLength);
  verificationInput.set(original);
  const verificationOutput = new Uint8Array(firstResult.byteLength);
  verificationOutput.set(firstResult);
  const verification = await verifyRasterRedactionOutput({
    inputBytes: verificationInput,
    outputBytes: verificationOutput,
    expectedPageDimensions: sourceDimensions.pageDimensions,
  });
  verificationInput.fill(0);
  verificationOutput.fill(0);
  assert(verification.pageCount === 2, "Verified output page count changed");
  const completedTimestamp = completed.updatedAt;
  const completedDelete = await service.cancelSession(created.id);
  assert(
    completedDelete.status === "completed" && completedDelete.updatedAt === completedTimestamp,
    "DELETE changed completion",
  );

  const blockingTasks: Array<{ input: IsolatedRedactionInput; reject: (error: Error) => void }> =
    [];
  let concurrent = 0;
  let maximumConcurrent = 0;
  const blockingRenderer = (input: IsolatedRedactionInput) =>
    new Promise<IsolatedRedactionResult>((_resolve, reject) => {
      concurrent += 1;
      maximumConcurrent = Math.max(maximumConcurrent, concurrent);
      const abort = () => {
        concurrent -= 1;
        const error = new Error("cancelled");
        error.name = "AbortError";
        reject(error);
      };
      input.signal?.addEventListener("abort", abort, { once: true });
      blockingTasks.push({ input, reject });
    });
  const queueService = new RedactionSessionService(blockingRenderer);
  const queueSessions: PublicRedactionSession[] = [];
  for (let index = 0; index < 12; index += 1) {
    queueSessions.push(
      await queueService.createSession(uploadedFile(Buffer.from(original), `queue-${index}.pdf`)),
    );
  }
  for (let index = 0; index < 11; index += 1)
    queueService.finalizeSession(queueSessions[index].id, finalizeBody());
  await expectApiError(
    () => queueService.finalizeSession(queueSessions[11].id, finalizeBody()),
    503,
  );
  assert(maximumConcurrent === 1, "Queue exceeded one active finalization");
  const queuedCancellation = await queueService.cancelSession(queueSessions[1].id);
  assert(queuedCancellation.status === "cancelled", "Queued cancellation failed");
  const activeCancellation = await queueService.cancelSession(queueSessions[0].id);
  assert(activeCancellation.status === "cancelled", "Active cancellation failed");
  const cancelledTimestamp = activeCancellation.updatedAt;
  const repeatedCancellation = await queueService.cancelSession(queueSessions[0].id);
  assert(
    repeatedCancellation.updatedAt === cancelledTimestamp,
    "Repeated DELETE changed timestamp",
  );
  await queueService.close();

  const failedService = new RedactionSessionService(async () => {
    throw new Error("private parser detail");
  });
  const failedCreated = await failedService.createSession(uploadedFile(Buffer.from(original)));
  failedService.finalizeSession(failedCreated.id, finalizeBody());
  const failed = await waitTerminal(failedService, failedCreated.id);
  assert(
    failed.status === "failed" && !JSON.stringify(failed).includes("private parser detail"),
    "Failure leaked details",
  );
  const failedTimestamp = failed.updatedAt;
  const failedDelete = await failedService.cancelSession(failed.id);
  assert(
    failedDelete.status === "failed" && failedDelete.updatedAt === failedTimestamp,
    "DELETE changed failure",
  );
  await failedService.close();

  const expirationStore = new RedactionSessionStore(20, 1_000);
  const expirationInput = Buffer.from(original);
  const expiring = expirationStore.create({
    inputBuffer: expirationInput,
    originalFilename: "document.pdf",
    outputFilename: "document-redacted.pdf",
    inputMediaType: "application/pdf",
    pageDimensions: sourceDimensions.pageDimensions,
  });
  const retainedReference = expiring.inputBuffer;
  assert(retainedReference, "Store did not retain input");
  expirationStore.get(expiring.id);
  await new Promise((resolve) => setTimeout(resolve, 30));
  expirationStore.cleanupExpired();
  assert(
    retainedReference.every((value) => value === 0),
    "Expiration did not zero retained input",
  );
  expirationStore.close();

  const limitStore = new RedactionSessionStore();
  const tiny = Buffer.from("%PDF-test");
  for (let index = 0; index < REDACTION_SESSION_MAX_LIVE; index += 1) {
    limitStore.create({
      inputBuffer: tiny,
      originalFilename: "document.pdf",
      outputFilename: "document-redacted.pdf",
      inputMediaType: "application/pdf",
      pageDimensions: [{ width: 1, height: 1 }],
    });
  }
  await expectApiError(
    () =>
      limitStore.create({
        inputBuffer: tiny,
        originalFilename: "document.pdf",
        outputFilename: "document-redacted.pdf",
        inputMediaType: "application/pdf",
        pageDimensions: [{ width: 1, height: 1 }],
      }),
    503,
  );
  limitStore.close();

  const byteStore = new RedactionSessionStore();
  const chunk = Buffer.alloc(9 * 1024 * 1024, 1);
  for (let index = 0; index < 22; index += 1) {
    byteStore.create({
      inputBuffer: chunk,
      originalFilename: "document.pdf",
      outputFilename: "document-redacted.pdf",
      inputMediaType: "application/pdf",
      pageDimensions: [{ width: 1, height: 1 }],
    });
  }
  assert(
    byteStore.retainedBytes < REDACTION_SESSION_MAX_RETAINED_INPUT_BYTES,
    "Byte setup exceeded budget",
  );
  await expectApiError(
    () =>
      byteStore.create({
        inputBuffer: Buffer.alloc(3 * 1024 * 1024),
        originalFilename: "document.pdf",
        outputFilename: "document-redacted.pdf",
        inputMediaType: "application/pdf",
        pageDimensions: [{ width: 1, height: 1 }],
      }),
    503,
  );
  byteStore.close();
  chunk.fill(0);

  const overPages = await fixture(11);
  await expectApiError(() => service.createSession(uploadedFile(overPages)), 422);
  overPages.fill(0);
  await expectApiError(() => service.createSession(undefined), 400);
  await expectApiError(() => service.createSession(uploadedFile(Buffer.alloc(0))), 422);
  const capturedLogs: string[] = [];
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = (...values: unknown[]) => capturedLogs.push(values.map(String).join(" "));
  console.error = (...values: unknown[]) => capturedLogs.push(values.map(String).join(" "));
  const malformed = Buffer.from("%PDF-malformed");
  await expectApiError(() => service.createSession(uploadedFile(malformed)), 422);
  const oversized = Buffer.alloc(20 * 1024 * 1024 + 1);
  oversized.write("%PDF-");
  await expectApiError(() => service.createSession(uploadedFile(oversized)), 413);
  oversized.fill(0);

  const httpService = new RedactionSessionService(successfulRenderer(firstResult));
  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(
    "/api/redaction-sessions",
    createRedactionRouter(((_request, _response, next) => next()) as RequestHandler, httpService),
  );
  app.use(apiErrorHandler);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const form = new FormData();
  const uploadBytes = new Uint8Array(original.byteLength);
  uploadBytes.set(original);
  form.append(
    "file",
    new Blob([uploadBytes.buffer], { type: "application/pdf" }),
    `../${FILENAME_SECRET}.pdf`,
  );
  const createResponse = await fetch(`http://127.0.0.1:${address.port}/api/redaction-sessions`, {
    method: "POST",
    body: form,
  });
  assert(createResponse.status === 201, "HTTP creation did not return 201");
  const createJson: unknown = await createResponse.json();
  assert(
    typeof createJson === "object" && createJson !== null && "session" in createJson,
    "HTTP creation body invalid",
  );
  const httpSession = (createJson as { session: PublicRedactionSession }).session;
  const malformedIdResponse = await fetch(
    `http://127.0.0.1:${address.port}/api/redaction-sessions/nope`,
  );
  assert(malformedIdResponse.status === 400, "Malformed UUID did not return 400");
  const prematureResult = await fetch(
    `http://127.0.0.1:${address.port}/api/redaction-sessions/${httpSession.id}/result`,
  );
  assert(prematureResult.status === 409, "Premature result did not return 409");
  server.close();
  await once(server, "close");
  await httpService.close();
  console.warn = originalWarn;
  console.error = originalError;
  const capturedText = capturedLogs.join(" ");
  for (const sensitiveValue of [SECRET, METADATA_SECRET, FILENAME_SECRET, "0.14"]) {
    assert(!capturedText.includes(sensitiveValue), "Captured logs exposed fixture content");
  }

  await service.close();
  original.fill(0);
  malformed.fill(0);
  assert(getActiveRedactionRendererCount() === 0, "Renderer child remains active");
  console.log(
    JSON.stringify(
      {
        creation: { pageCount: created.pageCount, dimensions: created.pageDimensions },
        success: { status: completed.status, bytes: firstResult.byteLength, sha256: firstHash },
        cancellation: { queued: queuedCancellation.status, active: activeCancellation.status },
        queue: { maximumConcurrent, maximumWaiting: 10 },
        expiration: { inputZeroed: true, getDidNotRefresh: true },
        limits: {
          liveSessions: REDACTION_SESSION_MAX_LIVE,
          retainedInputBytes: REDACTION_SESSION_MAX_RETAINED_INPUT_BYTES,
        },
        activeRendererChildren: getActiveRedactionRendererCount(),
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Redaction session test failed");
  process.exitCode = 1;
});
