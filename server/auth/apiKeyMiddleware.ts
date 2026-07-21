import {
  createHash,
  timingSafeEqual,
} from "node:crypto";

import type {
  Request,
  RequestHandler,
} from "express";

import {
  forbidden,
  serviceUnavailable,
  unauthorized,
} from "../errors/apiError";

import "../env";

function getConfiguredApiKeys(): string[] {
  return (
    process.env.DRAFLIO_API_KEYS ??
    process.env.DRAFLIO_API_KEY ??
    ""
  )
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
}

function getRequestApiKey(
  request: Request
): string | null {
  const headerKey =
    request.header("x-api-key");

  if (headerKey?.trim()) {
    return headerKey.trim();
  }

  const authorization =
    request.header("authorization");

  if (
    authorization?.startsWith(
      "Bearer "
    )
  ) {
    const bearerKey =
      authorization
        .slice(7)
        .trim();

    return bearerKey || null;
  }

  return null;
}

function hashKey(
  value: string
): Buffer {
  return createHash("sha256")
    .update(value, "utf8")
    .digest();
}

function keysMatch(
  suppliedKey: string,
  configuredKey: string
): boolean {
  return timingSafeEqual(
    hashKey(suppliedKey),
    hashKey(configuredKey)
  );
}

export const requireApiKey:
  RequestHandler = (
    request,
    _response,
    next
  ) => {
    const configuredKeys =
      getConfiguredApiKeys();

    if (
      configuredKeys.length === 0
    ) {
      next(
        serviceUnavailable(
          "API authentication is not configured."
        )
      );

      return;
    }

    const suppliedKey =
      getRequestApiKey(request);

    if (!suppliedKey) {
      next(
        unauthorized(
          "An API key is required. Send it using the x-api-key header."
        )
      );

      return;
    }

    const validKey =
      configuredKeys.some(
        (configuredKey) =>
          keysMatch(
            suppliedKey,
            configuredKey
          )
      );

    if (!validKey) {
      next(
        forbidden(
          "The supplied API key is invalid."
        )
      );

      return;
    }

    next();
  };