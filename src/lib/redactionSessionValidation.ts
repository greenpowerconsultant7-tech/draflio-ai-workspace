export type RedactionSessionStatus =
  "preparing" | "review-ready" | "queued" | "running" | "completed" | "failed" | "cancelled";

export type RedactionSessionStage =
  | "uploaded"
  | "review-ready"
  | "queued"
  | "validating"
  | "rasterizing"
  | "applying-redactions"
  | "rebuilding"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export type RedactionSessionProgress =
  | { mode: "indeterminate" }
  | { mode: "determinate"; unit: "pages"; completed: number; total: number };

export interface RedactionRectanglePayload {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RedactionSession {
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
  pageDimensions: Array<{ width: number; height: number }>;
  dpi?: number;
  createdAt: string;
  updatedAt: string;
  resultReady: boolean;
  error?: { code: string; message: string };
}

const statuses = new Set<RedactionSessionStatus>([
  "preparing",
  "review-ready",
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

const stages = new Set<RedactionSessionStage>([
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
]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function parseProgress(value: unknown): RedactionSessionProgress {
  if (!record(value) || (value.mode !== "indeterminate" && value.mode !== "determinate")) {
    throw new Error("The redaction server returned invalid progress data.");
  }
  if (value.mode === "indeterminate") return { mode: "indeterminate" };
  if (
    value.unit !== "pages" ||
    !Number.isInteger(value.completed) ||
    typeof value.completed !== "number" ||
    value.completed < 0 ||
    !Number.isInteger(value.total) ||
    typeof value.total !== "number" ||
    value.total <= 0 ||
    value.completed > value.total
  ) {
    throw new Error("The redaction server returned invalid page progress.");
  }
  return { mode: "determinate", unit: "pages", completed: value.completed, total: value.total };
}

export function validateRedactionSessionResponse(value: unknown): RedactionSession {
  if (!record(value) || !record(value.session)) {
    throw new Error("The redaction server returned an invalid session response.");
  }
  const session = value.session;
  if (
    !nonEmptyString(session.id) ||
    typeof session.status !== "string" ||
    !statuses.has(session.status as RedactionSessionStatus) ||
    typeof session.stage !== "string" ||
    !stages.has(session.stage as RedactionSessionStage) ||
    typeof session.message !== "string" ||
    !Number.isInteger(session.revision) ||
    typeof session.revision !== "number" ||
    session.revision <= 0 ||
    !nonEmptyString(session.originalFilename) ||
    !nonEmptyString(session.outputFilename) ||
    !nonEmptyString(session.inputMediaType) ||
    session.inputMediaType !== "application/pdf" ||
    !nonEmptyString(session.outputMediaType) ||
    session.outputMediaType !== "application/pdf" ||
    !Number.isInteger(session.pageCount) ||
    typeof session.pageCount !== "number" ||
    session.pageCount <= 0 ||
    !Array.isArray(session.pageDimensions) ||
    session.pageDimensions.length !== session.pageCount ||
    !nonEmptyString(session.createdAt) ||
    !nonEmptyString(session.updatedAt) ||
    typeof session.resultReady !== "boolean"
  ) {
    throw new Error("The redaction server returned malformed session data.");
  }
  const pageDimensions = session.pageDimensions.map((dimension) => {
    if (
      !record(dimension) ||
      !finitePositive(dimension.width) ||
      !finitePositive(dimension.height)
    ) {
      throw new Error("The redaction server returned invalid page dimensions.");
    }
    return { width: dimension.width, height: dimension.height };
  });
  const dpi = session.dpi;
  if (dpi !== undefined && (typeof dpi !== "number" || ![96, 144, 200].includes(dpi))) {
    throw new Error("The redaction server returned an invalid DPI value.");
  }
  let publicError: RedactionSession["error"];
  if (session.error !== undefined) {
    if (
      !record(session.error) ||
      !nonEmptyString(session.error.code) ||
      !nonEmptyString(session.error.message)
    ) {
      throw new Error("The redaction server returned invalid error data.");
    }
    publicError = { code: session.error.code, message: session.error.message };
  }
  return {
    id: session.id,
    status: session.status as RedactionSessionStatus,
    stage: session.stage as RedactionSessionStage,
    message: session.message,
    progress: parseProgress(session.progress),
    revision: session.revision,
    originalFilename: session.originalFilename,
    outputFilename: session.outputFilename,
    inputMediaType: session.inputMediaType,
    outputMediaType: session.outputMediaType,
    pageCount: session.pageCount,
    pageDimensions,
    ...(dpi === undefined ? {} : { dpi }),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    resultReady: session.resultReady,
    ...(publicError ? { error: publicError } : {}),
  };
}

export function isTerminalRedactionSession(session: RedactionSession): boolean {
  return (
    session.status === "completed" || session.status === "failed" || session.status === "cancelled"
  );
}
