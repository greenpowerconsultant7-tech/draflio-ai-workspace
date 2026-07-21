export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "UNPROCESSABLE_CONTENT"
  | "RATE_LIMITED"
  | "INTERNAL_SERVER_ERROR"
  | "SERVICE_UNAVAILABLE";

export type ApiErrorDetails =
  | Record<string, unknown>
  | unknown[]
  | string
  | number
  | boolean
  | null;

type ApiErrorOptions = {
  statusCode: number;
  code: ApiErrorCode;
  message: string;
  details?: ApiErrorDetails;
  expose?: boolean;
  cause?: unknown;
};

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details?: ApiErrorDetails;
  readonly expose: boolean;

  constructor({
    statusCode,
    code,
    message,
    details,
    expose = statusCode < 500,
    cause,
  }: ApiErrorOptions) {
    super(message, {
      cause,
    });

    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.expose = expose;

    Object.setPrototypeOf(
      this,
      new.target.prototype
    );
  }
}

export function isApiError(
  error: unknown
): error is ApiError {
  return error instanceof ApiError;
}

export function badRequest(
  message: string,
  details?: ApiErrorDetails
) {
  return new ApiError({
    statusCode: 400,
    code: "BAD_REQUEST",
    message,
    details,
  });
}

export function unauthorized(
  message =
    "Authentication is required."
) {
  return new ApiError({
    statusCode: 401,
    code: "UNAUTHORIZED",
    message,
  });
}

export function forbidden(
  message =
    "You do not have permission to perform this action."
) {
  return new ApiError({
    statusCode: 403,
    code: "FORBIDDEN",
    message,
  });
}

export function notFound(
  message =
    "The requested resource was not found."
) {
  return new ApiError({
    statusCode: 404,
    code: "NOT_FOUND",
    message,
  });
}

export function conflict(
  message: string,
  details?: ApiErrorDetails
) {
  return new ApiError({
    statusCode: 409,
    code: "CONFLICT",
    message,
    details,
  });
}

export function payloadTooLarge(
  message =
    "The uploaded content is too large."
) {
  return new ApiError({
    statusCode: 413,
    code: "PAYLOAD_TOO_LARGE",
    message,
  });
}

export function unsupportedMediaType(
  message =
    "The uploaded file type is not supported."
) {
  return new ApiError({
    statusCode: 415,
    code: "UNSUPPORTED_MEDIA_TYPE",
    message,
  });
}

export function unprocessableContent(
  message: string,
  details?: ApiErrorDetails
) {
  return new ApiError({
    statusCode: 422,
    code: "UNPROCESSABLE_CONTENT",
    message,
    details,
  });
}

export function rateLimited(
  message =
    "Too many requests. Please try again later."
) {
  return new ApiError({
    statusCode: 429,
    code: "RATE_LIMITED",
    message,
  });
}

export function internalServerError(
  message =
    "An unexpected server error occurred.",
  cause?: unknown
) {
  return new ApiError({
    statusCode: 500,
    code: "INTERNAL_SERVER_ERROR",
    message,
    expose: false,
    cause,
  });
}

export function serviceUnavailable(
  message =
    "The service is temporarily unavailable.",
  cause?: unknown
) {
  return new ApiError({
    statusCode: 503,
    code: "SERVICE_UNAVAILABLE",
    message,
    expose: true,
    cause,
  });
}