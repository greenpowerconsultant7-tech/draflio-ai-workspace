export type ApiErrorResponse = {
  error?: string;
  code?: string;
  requestId?: string;
  details?: unknown;
};

type DraflioApiErrorOptions = {
  message: string;
  statusCode?: number;
  code?: string;
  requestId?: string;
  details?: unknown;
  cause?: unknown;
};

export class DraflioApiError extends Error {
  readonly statusCode?: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor({
    message,
    statusCode,
    code,
    requestId,
    details,
    cause,
  }: DraflioApiErrorOptions) {
    super(message, {
      cause,
    });

    this.name = "DraflioApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.requestId = requestId;
    this.details = details;

    Object.setPrototypeOf(
      this,
      new.target.prototype
    );
  }
}

function isObject(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function parseApiErrorResponse(
  value: unknown
): ApiErrorResponse {
  if (!isObject(value)) {
    return {};
  }

  return {
    error:
      typeof value.error === "string"
        ? value.error
        : undefined,

    code:
      typeof value.code === "string"
        ? value.code
        : undefined,

    requestId:
      typeof value.requestId === "string"
        ? value.requestId
        : undefined,

    details:
      value.details,
  };
}

async function readResponseBody(
  response: Response
): Promise<ApiErrorResponse> {
  const contentType =
    response.headers.get(
      "content-type"
    ) ?? "";

  if (
    contentType.includes(
      "application/json"
    )
  ) {
    try {
      const json =
        await response.json();

      return parseApiErrorResponse(
        json
      );
    } catch {
      return {};
    }
  }

  try {
    const text =
      await response.text();

    return text.trim()
      ? {
          error: text.trim(),
        }
      : {};
  } catch {
    return {};
  }
}

function defaultStatusMessage(
  statusCode: number
): string {
  switch (statusCode) {
    case 400:
      return "The request is invalid.";

    case 401:
      return "Authentication is required.";

    case 403:
      return "You do not have permission to perform this action.";

    case 404:
      return "The requested service was not found.";

    case 413:
      return "The uploaded content is too large.";

    case 415:
      return "The uploaded file type is not supported.";

    case 422:
      return "The document could not be processed.";

    case 429:
      return "Too many requests. Please try again later.";

    case 503:
      return "The service is temporarily unavailable.";

    default:
      return statusCode >= 500
        ? "An unexpected server error occurred."
        : "The request could not be completed.";
  }
}

export async function createApiError(
  response: Response,
  fallbackMessage?: string
): Promise<DraflioApiError> {
  const body =
    await readResponseBody(
      response
    );

  const message =
    body.error?.trim() ||
    fallbackMessage?.trim() ||
    defaultStatusMessage(
      response.status
    );

  return new DraflioApiError({
    message,
    statusCode:
      response.status,
    code:
      body.code,
    requestId:
      body.requestId,
    details:
      body.details,
  });
}

export function normalizeApiError(
  error: unknown,
  fallbackMessage =
    "The request could not be completed."
): DraflioApiError {
  if (
    error instanceof
    DraflioApiError
  ) {
    return error;
  }

  if (
    error instanceof Error
  ) {
    return new DraflioApiError({
      message:
        error.message ||
        fallbackMessage,
      cause:
        error,
    });
  }

  return new DraflioApiError({
    message:
      fallbackMessage,
    cause:
      error,
  });
}

export function getApiErrorMessage(
  error: unknown,
  fallbackMessage =
    "The request could not be completed."
): string {
  const normalizedError =
    normalizeApiError(
      error,
      fallbackMessage
    );

  if (
    normalizedError.requestId
  ) {
    return `${normalizedError.message} Request ID: ${normalizedError.requestId}`;
  }

  return normalizedError.message;
}