/// <reference types="node" />

import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { superviseChildProcess } from "../redaction/redactionRendererSupervisor.js";
import {
  DOCUMENT_INTELLIGENCE_ENVIRONMENT_KEYS,
  isExtractionChildMessage,
  type ExtractionChildMessage,
} from "./documentIntelligenceProtocol.js";
import type { DocumentIntelligenceContext } from "./documentIntelligenceTypes.js";

export const DOCUMENT_INTELLIGENCE_WATCHDOG_MS = 120_000;
export const DOCUMENT_INTELLIGENCE_CANCELLATION_GRACE_MS = 4_000;
let activeChildren = 0;

function environment() {
  const result: NodeJS.ProcessEnv = {};
  for (const key of DOCUMENT_INTELLIGENCE_ENVIRONMENT_KEYS) {
    const value = process.env[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function childLaunch() {
  const extension = extname(fileURLToPath(import.meta.url));
  if (extension === ".ts") {
    return {
      path: fileURLToPath(new URL("./documentIntelligenceExtractorChild.ts", import.meta.url)),
      execArgv: ["--import", "tsx"],
    };
  }
  if (extension === ".js") {
    return {
      path: fileURLToPath(new URL("./documentIntelligenceExtractorChild.js", import.meta.url)),
      execArgv: [],
    };
  }
  throw new Error("DOCUMENT_INTELLIGENCE_EXTRACTION_FAILED");
}

export function getActiveDocumentIntelligenceChildCount() {
  return activeChildren;
}

export async function runIsolatedDocumentExtraction(input: {
  bytes: Uint8Array;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}) {
  const requestId = randomUUID();
  const launch = childLaunch();
  const ipcBytes = Uint8Array.from(input.bytes);
  let requestSent = false;
  let outcome:
    | { kind: "completed"; context: DocumentIntelligenceContext; environmentKeys: string[] }
    | { kind: "failed"; code: string }
    | { kind: "cancelled" }
    | undefined;
  activeChildren += 1;
  try {
    const exit = await superviseChildProcess({
      modulePath: launch.path,
      execArgv: launch.execArgv,
      environment: environment(),
      signal: input.signal,
      watchdogMs: DOCUMENT_INTELLIGENCE_WATCHDOG_MS,
      cancellationGraceMs: DOCUMENT_INTELLIGENCE_CANCELLATION_GRACE_MS,
      onCancellationRequested: (_reason, child) => {
        if (child.connected) child.send({ kind: "cancel", requestId });
      },
      onMessage: (value, child, scheduleForcedTermination, markTerminalMessage) => {
        if (!isExtractionChildMessage(value)) {
          outcome = { kind: "failed", code: "INVALID_IPC_MESSAGE" };
          child.kill();
          return;
        }
        const message: ExtractionChildMessage = value;
        if (message.kind === "ready") {
          if (requestSent) {
            outcome = { kind: "failed", code: "INVALID_IPC_MESSAGE" };
            child.kill();
            return;
          }
          requestSent = true;
          child.send({ kind: "extract", requestId, pdfBytes: ipcBytes }, () => ipcBytes.fill(0));
          return;
        }
        if (message.kind !== "failed" && message.requestId !== requestId) {
          outcome = { kind: "failed", code: "INVALID_IPC_MESSAGE" };
          child.kill();
          return;
        }
        if (message.kind === "progress") {
          input.onProgress?.(message.completed, message.total);
          return;
        }
        markTerminalMessage();
        if (message.kind === "completed") {
          outcome = {
            kind: "completed",
            context: message.context,
            environmentKeys: message.environmentKeys,
          };
          scheduleForcedTermination();
        } else if (message.kind === "cancelled") {
          outcome = { kind: "cancelled" };
        } else {
          outcome = { kind: "failed", code: message.code };
        }
      },
    });
    if (exit.cancellationReason === "user" || outcome?.kind === "cancelled") {
      throw new DOMException("Cancelled", "AbortError");
    }
    if (
      outcome?.kind === "completed" &&
      exit.exitCode === 0 &&
      exit.signal === null
    ) {
      return outcome;
    }
    throw new Error(outcome?.kind === "failed" ? outcome.code : "DOCUMENT_INTELLIGENCE_EXTRACTION_FAILED");
  } finally {
    ipcBytes.fill(0);
    activeChildren -= 1;
  }
}
