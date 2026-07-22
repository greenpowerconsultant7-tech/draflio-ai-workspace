/// <reference types="node" />

import { conflict, serviceUnavailable } from "../errors/apiError.js";
import type { UploadedFile } from "../validation/fileValidation.js";
import {
  RedactionRendererCancellationError,
  runIsolatedRedaction,
  type IsolatedRedactionInput,
  type IsolatedRedactionResult,
} from "./redactionRendererClient.js";
import { RedactionFinalizationQueue } from "./redactionFinalizationQueue.js";
import {
  RedactionSessionStore,
  requireReviewReady,
  toPublicRedactionSession,
} from "./redactionSessionStore.js";
import type { PublicRedactionSession, RedactionSessionRecord } from "./redactionSessionTypes.js";
import {
  assertRedactionSessionId,
  createRedactedOutputFilename,
  inspectRedactionPdf,
  sanitizeRedactionInputFilename,
  validateFinalizeRequest,
  validatePixelBudget,
  validateRedactionUpload,
} from "./redactionSessionValidator.js";
import type { RedactionProgress } from "./redactionTypes.js";

type Renderer = (input: IsolatedRedactionInput) => Promise<IsolatedRedactionResult>;

function isTerminal(record: RedactionSessionRecord): boolean {
  return ["completed", "failed", "cancelled"].includes(record.status);
}

export class RedactionSessionService {
  readonly store: RedactionSessionStore;
  readonly queue: RedactionFinalizationQueue;
  private readonly controllers = new Map<string, AbortController>();
  private readonly activeRendererTasks = new Map<string, Promise<IsolatedRedactionResult>>();
  private closed = false;

  constructor(
    private readonly renderer: Renderer = runIsolatedRedaction,
    store = new RedactionSessionStore(),
  ) {
    this.store = store;
    this.queue = new RedactionFinalizationQueue(
      (sessionId) => this.processFinalization(sessionId),
      (sessionId) => this.cancelQueuedDuringShutdown(sessionId),
    );
    this.store.setRemovalHandler((sessionId) => {
      this.queue.remove(sessionId);
      this.controllers.get(sessionId)?.abort();
    });
  }

  async createSession(fileValue: UploadedFile | undefined): Promise<PublicRedactionSession> {
    if (this.closed) {
      throw serviceUnavailable("Redaction sessions are shutting down.");
    }
    const file = validateRedactionUpload(fileValue);
    const inspection = await inspectRedactionPdf(file.buffer);
    const originalFilename = sanitizeRedactionInputFilename(file.originalname);
    const record = this.store.create({
      inputBuffer: file.buffer,
      originalFilename,
      outputFilename: createRedactedOutputFilename(originalFilename),
      inputMediaType: "application/pdf",
      pageDimensions: inspection.pageDimensions,
    });
    return toPublicRedactionSession(record);
  }

  getSession(sessionId: string): PublicRedactionSession {
    assertRedactionSessionId(sessionId);
    return toPublicRedactionSession(this.store.get(sessionId));
  }

  finalizeSession(sessionId: string, body: unknown): PublicRedactionSession {
    assertRedactionSessionId(sessionId);
    const record = this.store.get(sessionId);
    requireReviewReady(record);
    const request = validateFinalizeRequest(body, record);
    this.queue.assertCanEnqueue(sessionId);
    const pixelBudget = validatePixelBudget(record.pageDimensions, request.dpi);
    this.store.setRectangles(record, request.rectangles);
    record.dpi = request.dpi;
    record.revision += 1;
    record.status = "queued";
    record.stage = "queued";
    record.message = "Redaction finalization is queued.";
    record.progress = { mode: "indeterminate" };
    record.error = undefined;
    this.store.updateTimestamp(record, true);
    const queuedSession = toPublicRedactionSession(record);
    this.queue.enqueue(sessionId);
    void pixelBudget;
    return queuedSession;
  }

  async cancelSession(sessionId: string): Promise<PublicRedactionSession> {
    assertRedactionSessionId(sessionId);
    const record = this.store.get(sessionId);
    if (
      record.status === "cancelled" ||
      record.status === "completed" ||
      record.status === "failed"
    ) {
      return toPublicRedactionSession(record);
    }
    if (record.status === "queued") {
      this.queue.remove(sessionId);
    }
    this.markCancelled(record);
    const controller = this.controllers.get(sessionId);
    controller?.abort();
    const activeTask = this.activeRendererTasks.get(sessionId);
    if (activeTask) {
      await activeTask.catch(() => undefined);
    }
    return toPublicRedactionSession(record);
  }

  getResult(sessionId: string): { data: Buffer; filename: string } {
    assertRedactionSessionId(sessionId);
    const record = this.store.get(sessionId);
    if (record.status !== "completed") {
      const message =
        record.status === "failed"
          ? (record.error?.message ?? "Redaction finalization failed.")
          : record.status === "cancelled"
            ? "Redaction finalization was cancelled."
            : "The redacted result is not ready.";
      throw conflict(message);
    }
    if (!record.resultReady || !record.outputBuffer || record.outputBuffer.byteLength === 0) {
      throw conflict("The verified redacted result is unavailable.");
    }
    return { data: record.outputBuffer, filename: record.outputFilename };
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.queue.close();
    for (const controller of this.controllers.values()) {
      controller.abort();
    }
    await Promise.allSettled(this.activeRendererTasks.values());
    this.store.close();
    this.controllers.clear();
    this.activeRendererTasks.clear();
  }

  private async processFinalization(sessionId: string): Promise<void> {
    const record = this.store.getIfPresent(sessionId);
    if (!record || record.status !== "queued") {
      return;
    }
    if (!record.inputBuffer || !record.acceptedRectangles || record.dpi === undefined) {
      this.markFailed(record);
      return;
    }
    record.status = "running";
    record.stage = "validating";
    record.message = "Validating the redaction request.";
    record.progress = { mode: "indeterminate" };
    this.store.updateTimestamp(record);

    const controller = new AbortController();
    this.controllers.set(sessionId, controller);
    const inputCopy = Buffer.from(record.inputBuffer);
    const rendererTask = this.renderer({
      inputBytes: inputCopy,
      dpi: record.dpi,
      rectangles: record.acceptedRectangles.map((rectangle) => ({ ...rectangle })),
      expected: { pageCount: record.pageCount, pageDimensions: record.pageDimensions },
      signal: controller.signal,
      onProgress: (progress) => this.applyProgress(sessionId, progress),
    });
    this.activeRendererTasks.set(sessionId, rendererTask);
    try {
      const result = await rendererTask;
      const current = this.store.getIfPresent(sessionId);
      if (!current || current.status !== "running") {
        result.bytes.fill(0);
        return;
      }
      const output = Buffer.from(result.bytes);
      result.bytes.fill(0);
      current.outputBuffer = output;
      current.status = "completed";
      current.stage = "completed";
      current.message = "The redacted PDF is ready.";
      current.progress = {
        mode: "determinate",
        unit: "pages",
        completed: current.pageCount,
        total: current.pageCount,
      };
      current.resultReady = true;
      current.error = undefined;
      this.store.releaseInput(current);
      this.store.clearRectangles(current);
      this.store.updateTimestamp(current, true);
    } catch (error) {
      const current = this.store.getIfPresent(sessionId);
      if (!current || current.status === "cancelled") {
        return;
      }
      if (error instanceof RedactionRendererCancellationError || controller.signal.aborted) {
        this.markCancelled(current);
      } else {
        this.markFailed(current);
      }
    } finally {
      inputCopy.fill(0);
      this.controllers.delete(sessionId);
      this.activeRendererTasks.delete(sessionId);
    }
  }

  private applyProgress(sessionId: string, progress: RedactionProgress): void {
    const record = this.store.getIfPresent(sessionId);
    if (
      !record ||
      record.status !== "running" ||
      isTerminal(record) ||
      progress.stage === "completed"
    ) {
      return;
    }
    record.stage = progress.stage;
    record.message = "Redaction finalization is in progress.";
    record.progress =
      progress.completedPages !== undefined && progress.totalPages !== undefined
        ? {
            mode: "determinate",
            unit: "pages",
            completed: progress.completedPages,
            total: progress.totalPages,
          }
        : { mode: "indeterminate" };
    this.store.updateTimestamp(record);
  }

  private markCancelled(record: RedactionSessionRecord): void {
    if (isTerminal(record)) {
      return;
    }
    record.status = "cancelled";
    record.stage = "cancelled";
    record.message = "Redaction finalization was cancelled.";
    record.progress = { mode: "indeterminate" };
    record.error = undefined;
    this.store.releaseInput(record);
    this.store.releaseOutput(record);
    this.store.clearRectangles(record);
    this.store.updateTimestamp(record);
  }

  private markFailed(record: RedactionSessionRecord): void {
    if (isTerminal(record)) {
      return;
    }
    record.status = "failed";
    record.stage = "failed";
    record.message = "Redaction finalization failed.";
    record.progress = { mode: "indeterminate" };
    record.error = { code: "REDACTION_FAILED", message: "Redaction finalization failed." };
    this.store.releaseInput(record);
    this.store.releaseOutput(record);
    this.store.clearRectangles(record);
    this.store.updateTimestamp(record);
  }

  private cancelQueuedDuringShutdown(sessionId: string): void {
    const record = this.store.getIfPresent(sessionId);
    if (record?.status === "queued") {
      this.markCancelled(record);
    }
  }
}

export const redactionSessionService = new RedactionSessionService();

export async function closeRedactionSessionService(): Promise<void> {
  await redactionSessionService.close();
}
