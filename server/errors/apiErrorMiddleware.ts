import {
  randomUUID,
} from "node:crypto";

import type {
  ErrorRequestHandler,
  Request,
  RequestHandler,
} from "express";

import {
  MulterError,
} from "multer";

import {
  badRequest,
  internalServerError,
  isApiError,
  notFound,
  payloadTooLarge,
  type ApiError,
} from "./apiError";

type InvalidJsonError =
  SyntaxError & {
    status?: number;
    body?: unknown;
  };

function getRequestId(
  request: Request
): string {
  const suppliedRequestId =
    request.header(
      "x-request-id"
    );

  if (
    suppliedRequestId &&
    /^[a-zA-Z0-9._-]{1,100}$/.test(
      suppliedRequestId
    )
  ) {
    return suppliedRequestId;
  }

  return randomUUID();
}

function normalizeMulterError(
  error: MulterError
): ApiError {
  if (
    error.code ===
    "LIMIT_FILE_SIZE"
  ) {
    return payloadTooLarge(
      "The uploaded file exceeds the maximum allowed size."
    );
  }

  if (
    error.code ===
    "LIMIT_FILE_COUNT"
  ) {
    return badRequest(
      "Too many files were uploaded."
    );
  }

  if (
    error.code ===
    "LIMIT_UNEXPECTED_FILE"
  ) {
    return badRequest(
      "An unexpected file field was uploaded."
    );
  }

  return badRequest(
    error.message
  );
}

function isInvalidJsonError(
  error: unknown
): error is InvalidJsonError {
  return (
    error instanceof SyntaxError &&
    "body" in error
  );
}

function normalizeError(
  error: unknown
): ApiError {
  if (isApiError(error)) {
    return error;
  }

  if (
    error instanceof MulterError
  ) {
    return normalizeMulterError(
      error
    );
  }

  if (
    isInvalidJsonError(error)
  ) {
    return badRequest(
      "The request body contains invalid JSON."
    );
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 413
  ) {
    return payloadTooLarge(
      "The request body exceeds the maximum allowed size."
    );
  }

  return internalServerError(
    "An unexpected server error occurred.",
    error
  );
}

export const requestIdMiddleware:
  RequestHandler = (
    request,
    response,
    next
  ) => {
    const requestId =
      getRequestId(request);

    response.locals.requestId =
      requestId;

    response.setHeader(
      "x-request-id",
      requestId
    );

    next();
  };

export const unknownApiRoute:
  RequestHandler = (
    request,
    _response,
    next
  ) => {
    next(
      notFound(
        `API route ${request.method} ${request.originalUrl} was not found.`
      )
    );
  };

export const apiErrorHandler:
  ErrorRequestHandler = (
    error,
    request,
    response,
    _next
  ) => {
    const normalizedError =
      normalizeError(error);

    const requestId =
      response.locals.requestId ??
      randomUUID();

    if (
      normalizedError.statusCode >=
      500
    ) {
      console.error(
        `[Server] ${request.method} ${request.originalUrl} failed. Request ID: ${requestId}`,
        normalizedError.cause ??
          error
      );
    } else {
      console.warn(
        `[Server] ${request.method} ${request.originalUrl} returned ${normalizedError.statusCode}. Request ID: ${requestId}`
      );
    }

    const message =
      normalizedError.expose
        ? normalizedError.message
        : "An unexpected server error occurred.";

    response
      .status(
        normalizedError.statusCode
      )
      .json({
        error: message,
        code:
          normalizedError.code,
        requestId,

        ...(normalizedError.details !==
        undefined
          ? {
              details:
                normalizedError.details,
            }
          : {}),
      });
  };