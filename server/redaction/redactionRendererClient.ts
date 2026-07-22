/// <reference types="node" />
/// <reference lib="esnext.float16" />

import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isRendererChildMessage,
  REDACTION_RENDERER_ENVIRONMENT_KEYS,
  type RendererChildMessage,
  type RendererDocumentExpectation,
  type RendererFailureCode,
  type RendererRequestMessage,
} from "./redactionRendererProtocol.js";
import {
  getActiveSupervisedChildCount,
  REDACTION_RENDERER_CANCELLATION_GRACE_MS,
  REDACTION_RENDERER_WATCHDOG_MS,
  superviseChildProcess,
} from "./redactionRendererSupervisor.js";
import type {
  NormalizedRedactionRectangle,
  RasterRedactionMetrics,
  RedactionProgress,
} from "./redactionTypes.js";

export { REDACTION_RENDERER_CANCELLATION_GRACE_MS, REDACTION_RENDERER_WATCHDOG_MS };

export type RendererTermination = "cooperative" | "forced";

export class RedactionRendererCancellationError extends Error {
  readonly termination: RendererTermination;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;

  constructor(
    termination: RendererTermination,
    exitCode: number | null,
    signal: NodeJS.Signals | null,
  ) {
    super("Redaction renderer cancelled");
    this.name = "RedactionRendererCancellationError";
    this.termination = termination;
    this.exitCode = exitCode;
    this.signal = signal;
  }
}

export class RedactionRendererTimeoutError extends Error {
  readonly forced: boolean;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;

  constructor(forced: boolean, exitCode: number | null, signal: NodeJS.Signals | null) {
    super("Redaction renderer timed out");
    this.name = "RedactionRendererTimeoutError";
    this.forced = forced;
    this.exitCode = exitCode;
    this.signal = signal;
  }
}

export class RedactionRendererFailureError extends Error {
  readonly code: RendererFailureCode | "INVALID_CHILD_MESSAGE" | "UNEXPECTED_CHILD_EXIT";
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;

  constructor(
    code: RendererFailureCode | "INVALID_CHILD_MESSAGE" | "UNEXPECTED_CHILD_EXIT",
    exitCode: number | null = null,
    signal: NodeJS.Signals | null = null,
  ) {
    super("Redaction renderer failed");
    this.name = "RedactionRendererFailureError";
    this.code = code;
    this.exitCode = exitCode;
    this.signal = signal;
  }
}

export interface IsolatedRedactionInput {
  inputBytes: Uint8Array;
  dpi: number;
  rectangles: NormalizedRedactionRectangle[];
  expected: RendererDocumentExpectation;
  signal?: AbortSignal;
  onProgress?: (progress: RedactionProgress) => void;
}

export interface IsolatedRedactionResult {
  bytes: Uint8Array;
  metrics: RasterRedactionMetrics & { environmentKeys: string[] };
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

type PendingOutcome =
  | { kind: "completed"; bytes: Uint8Array; metrics: IsolatedRedactionResult["metrics"] }
  | { kind: "cancelled" }
  | { kind: "failed"; code: RendererFailureCode | "INVALID_CHILD_MESSAGE" };

function createChildEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of REDACTION_RENDERER_ENVIRONMENT_KEYS) {
    const value = process.env[key];
    if (value !== undefined) {
      environment[key] = value;
    }
  }
  return environment;
}

function resolveChildLaunch(): { modulePath: string; execArgv: string[] } {
  const sourceExtension = extname(fileURLToPath(import.meta.url));
  if (sourceExtension === ".ts") {
    return {
      modulePath: fileURLToPath(new URL("./redactionRendererChild.ts", import.meta.url)),
      execArgv: ["--import", "tsx"],
    };
  }
  if (sourceExtension === ".js") {
    return {
      modulePath: fileURLToPath(new URL("./redactionRendererChild.js", import.meta.url)),
      execArgv: [],
    };
  }
  throw new RedactionRendererFailureError("UNEXPECTED_CHILD_EXIT");
}

export function getActiveRedactionRendererCount(): number {
  return getActiveSupervisedChildCount();
}

export function getRedactionRendererEnvironmentAllowlist(): readonly string[] {
  return REDACTION_RENDERER_ENVIRONMENT_KEYS;
}

export async function runIsolatedRedaction(
  input: IsolatedRedactionInput,
): Promise<IsolatedRedactionResult> {
  const requestId = randomUUID();
  const launch = resolveChildLaunch();
  const ipcInputCopy = new Uint8Array(input.inputBytes.byteLength);
  ipcInputCopy.set(input.inputBytes);
  let requestSent = false;
  let cancellationRequested = false;
  let pendingOutcome: PendingOutcome | undefined;
  try {
    const exit = await superviseChildProcess({
      modulePath: launch.modulePath,
      execArgv: launch.execArgv,
      environment: createChildEnvironment(),
      signal: input.signal,
      onCancellationRequested: (_reason, child) => {
        cancellationRequested = true;
        if (child.connected) {
          child.send({ kind: "cancel", requestId });
        }
      },
      onMessage: (value, child, scheduleForcedTermination, markTerminalMessage) => {
        if (!isRendererChildMessage(value)) {
          pendingOutcome = { kind: "failed", code: "INVALID_CHILD_MESSAGE" };
          child.kill();
          return;
        }
        const message: RendererChildMessage = value;
        if (message.kind === "ready") {
          if (requestSent) {
            pendingOutcome = { kind: "failed", code: "INVALID_CHILD_MESSAGE" };
            child.kill();
            return;
          }
          requestSent = true;
          if (cancellationRequested) {
            child.send({ kind: "cancel", requestId });
            return;
          }
          const request: RendererRequestMessage = {
            kind: "render",
            requestId,
            pdfBytes: ipcInputCopy,
            dpi: input.dpi,
            rectangles: input.rectangles,
            expected: input.expected,
          };
          child.send(request, (error) => {
            ipcInputCopy.fill(0);
            if (error) {
              pendingOutcome = { kind: "failed", code: "INVALID_CHILD_MESSAGE" };
              child.kill();
            }
          });
          return;
        }
        if (message.kind !== "failed" && message.requestId !== requestId) {
          pendingOutcome = { kind: "failed", code: "INVALID_CHILD_MESSAGE" };
          child.kill();
          return;
        }
        if (message.kind === "progress") {
          input.onProgress?.(message.progress);
          return;
        }
        if (message.kind === "completed") {
          markTerminalMessage();
          const outputBytes = new Uint8Array(message.outputBytes.byteLength);
          outputBytes.set(message.outputBytes);
          pendingOutcome = {
            kind: "completed",
            bytes: outputBytes,
            metrics: message.metrics,
          };
          message.outputBytes.fill(0);
          scheduleForcedTermination();
          return;
        }
        if (message.kind === "cancelled") {
          markTerminalMessage();
          pendingOutcome = { kind: "cancelled" };
          return;
        }
        markTerminalMessage();
        pendingOutcome = { kind: "failed", code: message.code };
      },
    });

    if (exit.cancellationReason === "timeout") {
      throw new RedactionRendererTimeoutError(exit.forced, exit.exitCode, exit.signal);
    }
    if (exit.cancellationReason === "user") {
      const cooperative = pendingOutcome?.kind === "cancelled" && !exit.forced;
      throw new RedactionRendererCancellationError(
        cooperative ? "cooperative" : "forced",
        exit.exitCode,
        exit.signal,
      );
    }
    if (pendingOutcome?.kind === "completed" && exit.exitCode === 0 && exit.signal === null) {
      return {
        bytes: pendingOutcome.bytes,
        metrics: pendingOutcome.metrics,
        exitCode: exit.exitCode,
        signal: exit.signal,
      };
    }
    if (pendingOutcome?.kind === "failed") {
      throw new RedactionRendererFailureError(pendingOutcome.code, exit.exitCode, exit.signal);
    }
    throw new RedactionRendererFailureError("UNEXPECTED_CHILD_EXIT", exit.exitCode, exit.signal);
  } finally {
    ipcInputCopy.fill(0);
  }
}
