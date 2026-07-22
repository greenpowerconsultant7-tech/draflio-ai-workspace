/// <reference types="node" />

import { randomUUID } from "node:crypto";
import { conflict, notFound, serviceUnavailable } from "../errors/apiError.js";
import type { NormalizedRedactionRectangle } from "./redactionTypes.js";
import {
  REDACTION_SESSION_CLEANUP_INTERVAL_MS,
  REDACTION_SESSION_EXPIRATION_MS,
  REDACTION_SESSION_MAX_LIVE,
  REDACTION_SESSION_MAX_RETAINED_INPUT_BYTES,
  type PublicRedactionSession,
  type RedactionPageDimension,
  type RedactionSessionRecord,
} from "./redactionSessionTypes.js";

interface CreateSessionInput {
  inputBuffer: Buffer;
  originalFilename: string;
  outputFilename: string;
  inputMediaType: string;
  pageDimensions: RedactionPageDimension[];
}

type RemovalReason = "expired" | "deleted" | "shutdown";
type RemovalHandler = (sessionId: string, reason: RemovalReason) => void;

function cloneDimensions(values: RedactionPageDimension[]): RedactionPageDimension[] {
  return values.map(({ width, height }) => ({ width, height }));
}

export function toPublicRedactionSession(record: RedactionSessionRecord): PublicRedactionSession {
  return {
    id: record.id,
    status: record.status,
    stage: record.stage,
    message: record.message,
    progress: { ...record.progress },
    revision: record.revision,
    originalFilename: record.originalFilename,
    outputFilename: record.outputFilename,
    inputMediaType: record.inputMediaType,
    outputMediaType: record.outputMediaType,
    pageCount: record.pageCount,
    pageDimensions: cloneDimensions(record.pageDimensions),
    ...(record.dpi === undefined ? {} : { dpi: record.dpi }),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    resultReady: record.resultReady,
    ...(record.error ? { error: { ...record.error } } : {}),
  };
}

export class RedactionSessionStore {
  private readonly sessions = new Map<string, RedactionSessionRecord>();
  private readonly cleanupTimer: NodeJS.Timeout;
  private retainedInputBytes = 0;
  private closed = false;
  private removalHandler?: RemovalHandler;

  constructor(
    private readonly expirationMs = REDACTION_SESSION_EXPIRATION_MS,
    cleanupIntervalMs = REDACTION_SESSION_CLEANUP_INTERVAL_MS,
  ) {
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), cleanupIntervalMs);
    this.cleanupTimer.unref();
  }

  setRemovalHandler(handler: RemovalHandler): void {
    this.removalHandler = handler;
  }

  create(input: CreateSessionInput): RedactionSessionRecord {
    if (this.closed) {
      throw serviceUnavailable("Redaction sessions are shutting down.");
    }
    this.cleanupExpired();
    if (this.sessions.size >= REDACTION_SESSION_MAX_LIVE) {
      throw serviceUnavailable("The redaction session capacity is currently full.");
    }
    if (
      this.retainedInputBytes + input.inputBuffer.byteLength >
      REDACTION_SESSION_MAX_RETAINED_INPUT_BYTES
    ) {
      throw serviceUnavailable("The redaction input capacity is currently full.");
    }
    const ownedInput = Buffer.from(input.inputBuffer);
    const now = new Date();
    const timestamp = now.toISOString();
    const record: RedactionSessionRecord = {
      id: randomUUID(),
      status: "review-ready",
      stage: "review-ready",
      message: "The document is ready for redaction review.",
      progress: { mode: "indeterminate" },
      revision: 1,
      originalFilename: input.originalFilename,
      outputFilename: input.outputFilename,
      inputMediaType: "application/pdf",
      outputMediaType: "application/pdf",
      pageCount: input.pageDimensions.length,
      pageDimensions: cloneDimensions(input.pageDimensions),
      createdAt: timestamp,
      updatedAt: timestamp,
      resultReady: false,
      inputBuffer: ownedInput,
      expiresAt: now.getTime() + this.expirationMs,
    };
    this.sessions.set(record.id, record);
    this.retainedInputBytes += ownedInput.byteLength;
    return record;
  }

  get(sessionId: string): RedactionSessionRecord {
    const record = this.sessions.get(sessionId);
    if (!record || this.expireIfNeeded(record)) {
      throw notFound("The redaction session was not found or has expired.");
    }
    return record;
  }

  getIfPresent(sessionId: string): RedactionSessionRecord | undefined {
    const record = this.sessions.get(sessionId);
    if (!record || this.expireIfNeeded(record)) {
      return undefined;
    }
    return record;
  }

  updateTimestamp(record: RedactionSessionRecord, refreshExpiration = false): void {
    record.updatedAt = new Date().toISOString();
    if (refreshExpiration) {
      record.expiresAt = Date.now() + this.expirationMs;
    }
  }

  releaseInput(record: RedactionSessionRecord): void {
    if (!record.inputBuffer) {
      return;
    }
    this.retainedInputBytes -= record.inputBuffer.byteLength;
    record.inputBuffer.fill(0);
    record.inputBuffer = undefined;
  }

  releaseOutput(record: RedactionSessionRecord): void {
    record.outputBuffer?.fill(0);
    record.outputBuffer = undefined;
    record.resultReady = false;
  }

  clearRectangles(record: RedactionSessionRecord): void {
    if (record.acceptedRectangles) {
      record.acceptedRectangles.splice(0, record.acceptedRectangles.length);
      record.acceptedRectangles = undefined;
    }
  }

  setRectangles(record: RedactionSessionRecord, rectangles: NormalizedRedactionRectangle[]): void {
    record.acceptedRectangles = rectangles.map((rectangle) => ({ ...rectangle }));
  }

  remove(sessionId: string): boolean {
    return this.removeRecord(sessionId, "deleted");
  }

  get size(): number {
    return this.sessions.size;
  }

  get retainedBytes(): number {
    return this.retainedInputBytes;
  }

  cleanupExpired(now = Date.now()): void {
    for (const record of this.sessions.values()) {
      if (record.expiresAt <= now) {
        this.removeRecord(record.id, "expired");
      }
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    clearInterval(this.cleanupTimer);
    for (const sessionId of [...this.sessions.keys()]) {
      this.removeRecord(sessionId, "shutdown");
    }
  }

  private expireIfNeeded(record: RedactionSessionRecord): boolean {
    if (record.expiresAt > Date.now()) {
      return false;
    }
    this.removeRecord(record.id, "expired");
    return true;
  }

  private removeRecord(sessionId: string, reason: RemovalReason): boolean {
    const record = this.sessions.get(sessionId);
    if (!record) {
      return false;
    }
    this.removalHandler?.(sessionId, reason);
    this.releaseInput(record);
    this.releaseOutput(record);
    this.clearRectangles(record);
    this.sessions.delete(sessionId);
    return true;
  }
}

export function requireReviewReady(record: RedactionSessionRecord): void {
  if (record.status !== "review-ready") {
    throw conflict("This redaction session can no longer be finalized.");
  }
}
