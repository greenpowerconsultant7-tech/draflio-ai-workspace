/// <reference types="node" />

import { fork, type ChildProcess } from "node:child_process";

export const REDACTION_RENDERER_WATCHDOG_MS = 120_000;
export const REDACTION_RENDERER_CANCELLATION_GRACE_MS = 4_000;

const activeChildren = new Set<ChildProcess>();

export type SupervisionCancellationReason = "user" | "timeout";

export interface SupervisedChildExit {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  cancellationReason?: SupervisionCancellationReason;
  forced: boolean;
}

interface SupervisedChildOptions {
  modulePath: string;
  execArgv: string[];
  environment: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  watchdogMs?: number;
  cancellationGraceMs?: number;
  onMessage?: (
    value: unknown,
    child: ChildProcess,
    scheduleForcedTermination: () => void,
    markTerminalMessage: () => void,
  ) => void;
  onCancellationRequested?: (reason: SupervisionCancellationReason, child: ChildProcess) => void;
}

export function getActiveSupervisedChildCount(): number {
  return activeChildren.size;
}

export function superviseChildProcess(
  options: SupervisedChildOptions,
): Promise<SupervisedChildExit> {
  return new Promise((resolve, reject) => {
    const child = fork(options.modulePath, [], {
      execPath: process.execPath,
      execArgv: options.execArgv,
      env: options.environment,
      serialization: "advanced",
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    activeChildren.add(child);

    let settled = false;
    let terminalMessageReceived = false;
    let forced = false;
    let cancellationReason: SupervisionCancellationReason | undefined;
    let cancellationTimer: NodeJS.Timeout | undefined;
    let completionTimer: NodeJS.Timeout | undefined;

    const forceTermination = () => {
      if (settled || child.exitCode !== null || child.killed) {
        return;
      }
      forced = true;
      child.kill();
    };

    const scheduleForcedTermination = () => {
      if (settled || completionTimer) {
        return;
      }
      completionTimer = setTimeout(
        forceTermination,
        options.cancellationGraceMs ?? REDACTION_RENDERER_CANCELLATION_GRACE_MS,
      );
      completionTimer.unref();
    };

    const requestCancellation = (reason: SupervisionCancellationReason) => {
      if (settled || terminalMessageReceived || cancellationReason) {
        return;
      }
      cancellationReason = reason;
      options.onCancellationRequested?.(reason, child);
      cancellationTimer = setTimeout(
        forceTermination,
        options.cancellationGraceMs ?? REDACTION_RENDERER_CANCELLATION_GRACE_MS,
      );
      cancellationTimer.unref();
    };

    const handleAbort = () => requestCancellation("user");
    const watchdogTimer = setTimeout(
      () => requestCancellation("timeout"),
      options.watchdogMs ?? REDACTION_RENDERER_WATCHDOG_MS,
    );
    watchdogTimer.unref();

    const markTerminalMessage = () => {
      if (terminalMessageReceived || cancellationReason) {
        return;
      }
      terminalMessageReceived = true;
      clearTimeout(watchdogTimer);
      options.signal?.removeEventListener("abort", handleAbort);
    };

    const cleanup = () => {
      clearTimeout(watchdogTimer);
      if (cancellationTimer) {
        clearTimeout(cancellationTimer);
      }
      if (completionTimer) {
        clearTimeout(completionTimer);
      }
      options.signal?.removeEventListener("abort", handleAbort);
      child.removeAllListeners();
      activeChildren.delete(child);
    };

    const settle = (exitCode: number | null, signal: NodeJS.Signals | null, error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (error) {
        reject(error);
        return;
      }
      resolve({ exitCode, signal, cancellationReason, forced });
    };

    child.on("message", (value: unknown) => {
      options.onMessage?.(value, child, scheduleForcedTermination, markTerminalMessage);
    });
    child.once("error", (error) => settle(null, null, error));
    child.once("exit", (exitCode, signal) => settle(exitCode, signal));

    options.signal?.addEventListener("abort", handleAbort, { once: true });
    if (options.signal?.aborted) {
      requestCancellation("user");
    }
  });
}
