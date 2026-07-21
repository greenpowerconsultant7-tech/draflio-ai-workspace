import {
  performance,
} from "node:perf_hooks";

import type {
  RequestHandler,
} from "express";

function getSlowRequestThreshold():
  number {
  const configuredValue =
    Number(
      process.env
        .DRAFLIO_SLOW_REQUEST_MS
    );

  if (
    Number.isFinite(
      configuredValue
    ) &&
    configuredValue > 0
  ) {
    return configuredValue;
  }

  return 2_000;
}

function formatDuration(
  durationMs: number
): string {
  if (durationMs < 1_000) {
    return `${durationMs.toFixed(
      1
    )} ms`;
  }

  return `${(
    durationMs / 1_000
  ).toFixed(2)} s`;
}

export const requestTimingMiddleware:
  RequestHandler = (
    request,
    response,
    next
  ) => {
    const startedAt =
      performance.now();

    let logged = false;

    const logRequest =
      (
        event:
          | "finished"
          | "closed"
      ) => {
        if (logged) {
          return;
        }

        logged = true;

        const durationMs =
          performance.now() -
          startedAt;

        const requestId =
          response.locals
            .requestId ??
          response.getHeader(
            "x-request-id"
          ) ??
          "unknown";

        const statusCode =
          response.statusCode;

        const duration =
          formatDuration(
            durationMs
          );

        const message =
          `[Server] ${request.method} ${request.originalUrl} ` +
          `${statusCode} in ${duration}. ` +
          `Request ID: ${requestId}`;

        const slowThreshold =
          getSlowRequestThreshold();

        if (
          durationMs >=
          slowThreshold
        ) {
          console.warn(
            `${message} [SLOW REQUEST]`
          );

          return;
        }

        if (
          event === "closed" &&
          !response.writableEnded
        ) {
          console.warn(
            `${message} [CONNECTION CLOSED]`
          );

          return;
        }

        console.log(message);
      };

    response.once(
      "finish",
      () => {
        logRequest(
          "finished"
        );
      }
    );

    response.once(
      "close",
      () => {
        logRequest(
          "closed"
        );
      }
    );

    next();
  };