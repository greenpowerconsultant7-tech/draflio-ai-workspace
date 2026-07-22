import { conflict, serviceUnavailable } from "../errors/apiError.js";
import {
  REDACTION_FINALIZATION_MAX_ACTIVE,
  REDACTION_FINALIZATION_MAX_QUEUED,
} from "./redactionSessionTypes.js";

type QueueRunner = (sessionId: string) => Promise<void>;
type QueueCancellation = (sessionId: string) => void;

export class RedactionFinalizationQueue {
  private readonly waiting: string[] = [];
  private readonly queuedIds = new Set<string>();
  private activeCount = 0;
  private closed = false;

  constructor(
    private readonly runner: QueueRunner,
    private readonly onQueuedCancellation: QueueCancellation,
  ) {}

  get waitingCount(): number {
    return this.waiting.length;
  }

  get runningCount(): number {
    return this.activeCount;
  }

  assertCanEnqueue(sessionId: string): void {
    if (this.closed) {
      throw serviceUnavailable("Redaction finalization is shutting down.");
    }
    if (this.queuedIds.has(sessionId)) {
      throw conflict("This redaction session is already queued.");
    }
    if (this.waiting.length >= REDACTION_FINALIZATION_MAX_QUEUED) {
      throw serviceUnavailable("The redaction finalization queue is full.");
    }
  }

  enqueue(sessionId: string): void {
    this.assertCanEnqueue(sessionId);
    this.waiting.push(sessionId);
    this.queuedIds.add(sessionId);
    this.drain();
  }

  remove(sessionId: string): boolean {
    const index = this.waiting.indexOf(sessionId);
    if (index < 0) {
      return false;
    }
    this.waiting.splice(index, 1);
    this.queuedIds.delete(sessionId);
    return true;
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    const pending = this.waiting.splice(0);
    this.queuedIds.clear();
    for (const sessionId of pending) {
      this.onQueuedCancellation(sessionId);
    }
  }

  private drain(): void {
    while (
      !this.closed &&
      this.activeCount < REDACTION_FINALIZATION_MAX_ACTIVE &&
      this.waiting.length > 0
    ) {
      const sessionId = this.waiting.shift();
      if (!sessionId) {
        return;
      }
      this.queuedIds.delete(sessionId);
      this.activeCount += 1;
      void this.runner(sessionId)
        .catch(() => undefined)
        .finally(() => {
          this.activeCount -= 1;
          this.drain();
        });
    }
  }
}
