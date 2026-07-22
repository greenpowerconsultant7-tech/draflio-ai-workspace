/// <reference types="node" />

import type { NormalizedRedactionRectangle } from "./redactionTypes.js";

export const REDACTION_SESSION_MAX_LIVE = 25;
export const REDACTION_SESSION_MAX_RETAINED_INPUT_BYTES = 200 * 1024 * 1024;
export const REDACTION_SESSION_EXPIRATION_MS = 25 * 60 * 1000;
export const REDACTION_SESSION_CLEANUP_INTERVAL_MS = 60 * 1000;
export const REDACTION_FINALIZATION_MAX_ACTIVE = 1;
export const REDACTION_FINALIZATION_MAX_QUEUED = 10;

export const redactionSessionStatuses = [
  "preparing",
  "review-ready",
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

export type RedactionSessionStatus = (typeof redactionSessionStatuses)[number];

export const redactionSessionStages = [
  "uploaded",
  "review-ready",
  "queued",
  "validating",
  "rasterizing",
  "applying-redactions",
  "rebuilding",
  "verifying",
  "completed",
  "failed",
  "cancelled",
] as const;

export type RedactionSessionStage = (typeof redactionSessionStages)[number];

export type RedactionSessionProgress =
  | { mode: "indeterminate" }
  | { mode: "determinate"; unit: "pages"; completed: number; total: number };

export interface RedactionSessionPublicError {
  code: string;
  message: string;
}

export interface RedactionPageDimension {
  width: number;
  height: number;
}

export interface PublicRedactionSession {
  id: string;
  status: RedactionSessionStatus;
  stage: RedactionSessionStage;
  message: string;
  progress: RedactionSessionProgress;
  revision: number;
  originalFilename: string;
  outputFilename: string;
  inputMediaType: string;
  outputMediaType: string;
  pageCount: number;
  pageDimensions: RedactionPageDimension[];
  dpi?: number;
  createdAt: string;
  updatedAt: string;
  resultReady: boolean;
  error?: RedactionSessionPublicError;
}

export interface RedactionSessionRecord extends PublicRedactionSession {
  inputBuffer?: Buffer;
  outputBuffer?: Buffer;
  acceptedRectangles?: NormalizedRedactionRectangle[];
  expiresAt: number;
}

export interface RedactionFinalizeRequest {
  confirmation: true;
  revision: number;
  dpi: number;
  rectangles: NormalizedRedactionRectangle[];
}
