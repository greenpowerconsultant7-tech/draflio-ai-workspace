import { API_BASE_URL } from "@/config/api";

import { createApiError } from "@/lib/apiError";

import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

export type ConversionJobOperation = "word-to-pdf" | "pdf-to-word";

export type ConversionJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type ConversionJobStage =
  | "queued"
  | "validating"
  | "authenticating"
  | "creating-asset"
  | "uploading"
  | "submitting"
  | "processing"
  | "downloading"
  | "preparing"
  | "completed"
  | "failed"
  | "cancelled";

export type ConversionProgress =
  | {
      mode: "determinate";
      value: number;
    }
  | {
      mode: "indeterminate";
    };

export type ConversionProgressUpdate = {
  stage: ConversionJobStage;
  message: string;
  progress: ConversionProgress;
};

export type ConversionJob = {
  id: string;
  operation: ConversionJobOperation;
  status: ConversionJobStatus;
  stage: ConversionJobStage;
  message: string;
  progress: ConversionProgress;
  originalFilename: string;
  outputFilename: string;
  inputMediaType: string;
  outputMediaType: string;
  createdAt: string;
  updatedAt: string;
  resultReady: boolean;
  error?: {
    message: string;
    code?: string;
  };
};

export type ConversionJobRunOptions = {
  operation: ConversionJobOperation;
  expectedOutputMediaType: string;
  file: File;
  signal?: AbortSignal;
  onProgress?: (update: ConversionProgressUpdate) => void;
  pollIntervalMs?: number;
  conversionLabel: string;
};

export type ConversionJobResult = {
  job: ConversionJob;
  bytes: Uint8Array;
};

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const CREATION_TIMEOUT_MS = 180_000;
const STATUS_TIMEOUT_MS = 30_000;
const RESULT_TIMEOUT_MS = 180_000;
const CANCELLATION_TIMEOUT_MS = 10_000;

export function createConversionAbortError(message = "Conversion was cancelled.") {
  const error = new Error(message);

  error.name = "AbortError";

  return error;
}

export function isConversionAbortError(error: unknown) {
  return (error instanceof DOMException || error instanceof Error) && error.name === "AbortError";
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createConversionAbortError();
  }
}

function emitProgress(
  callback: ((update: ConversionProgressUpdate) => void) | undefined,
  update: ConversionProgressUpdate,
) {
  callback?.(update);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isConversionJobOperation(value: unknown): value is ConversionJobOperation {
  return value === "word-to-pdf" || value === "pdf-to-word";
}

function isConversionJobStatus(value: unknown): value is ConversionJobStatus {
  return (
    value === "queued" ||
    value === "running" ||
    value === "completed" ||
    value === "failed" ||
    value === "cancelled"
  );
}

function isConversionJobStage(value: unknown): value is ConversionJobStage {
  return (
    value === "queued" ||
    value === "validating" ||
    value === "authenticating" ||
    value === "creating-asset" ||
    value === "uploading" ||
    value === "submitting" ||
    value === "processing" ||
    value === "downloading" ||
    value === "preparing" ||
    value === "completed" ||
    value === "failed" ||
    value === "cancelled"
  );
}

function parseProgress(value: unknown): ConversionProgress | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.mode === "indeterminate") {
    return {
      mode: "indeterminate",
    };
  }

  if (
    value.mode === "determinate" &&
    typeof value.value === "number" &&
    Number.isFinite(value.value) &&
    value.value >= 0 &&
    value.value <= 100
  ) {
    return {
      mode: "determinate",
      value: value.value,
    };
  }

  return null;
}

function validateJobResponse(
  value: unknown,
  expectedOperation: ConversionJobOperation,
  expectedOutputMediaType: string,
): ConversionJob {
  if (!isRecord(value) || !isRecord(value.job)) {
    throw new Error("The conversion server returned an invalid job response.");
  }

  const job = value.job;
  const progress = parseProgress(job.progress);
  const error = job.error;

  if (
    !isNonEmptyString(job.id) ||
    !isConversionJobOperation(job.operation) ||
    job.operation !== expectedOperation ||
    !isConversionJobStatus(job.status) ||
    !isConversionJobStage(job.stage) ||
    typeof job.message !== "string" ||
    !progress ||
    !isNonEmptyString(job.originalFilename) ||
    !isNonEmptyString(job.outputFilename) ||
    !isNonEmptyString(job.inputMediaType) ||
    !isNonEmptyString(job.outputMediaType) ||
    job.outputMediaType !== expectedOutputMediaType ||
    !isNonEmptyString(job.createdAt) ||
    !isNonEmptyString(job.updatedAt) ||
    typeof job.resultReady !== "boolean" ||
    (error !== undefined &&
      (!isRecord(error) ||
        !isNonEmptyString(error.message) ||
        (error.code !== undefined && typeof error.code !== "string")))
  ) {
    throw new Error(`The conversion server did not return a valid ${expectedOperation} job.`);
  }

  return {
    id: job.id,
    operation: job.operation,
    status: job.status,
    stage: job.stage,
    message: job.message,
    progress,
    originalFilename: job.originalFilename,
    outputFilename: job.outputFilename,
    inputMediaType: job.inputMediaType,
    outputMediaType: job.outputMediaType,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    resultReady: job.resultReady,
    ...(error !== undefined
      ? {
          error: {
            message: error.message,
            ...(error.code !== undefined
              ? {
                  code: error.code,
                }
              : {}),
          },
        }
      : {}),
  };
}

function waitForNextPoll(milliseconds: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", handleAbort);
    };

    const handleAbort = () => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(createConversionAbortError());
    };

    const timeout = window.setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve();
    }, milliseconds);

    signal?.addEventListener("abort", handleAbort, {
      once: true,
    });

    if (signal?.aborted) {
      handleAbort();
    }
  });
}

async function createJob(options: ConversionJobRunOptions) {
  const formData = new FormData();

  formData.append("file", options.file);

  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/conversion-jobs/${options.operation}`,
    {
      method: "POST",
      body: formData,
      timeoutMs: CREATION_TIMEOUT_MS,
      signal: options.signal,
    },
  );

  if (!response.ok) {
    throw await createApiError(
      response,
      `The ${options.conversionLabel} job could not be created.`,
    );
  }

  return validateJobResponse(
    await response.json(),
    options.operation,
    options.expectedOutputMediaType,
  );
}

async function getJob(jobId: string, options: ConversionJobRunOptions) {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/conversion-jobs/${encodeURIComponent(jobId)}`,
    {
      method: "GET",
      timeoutMs: STATUS_TIMEOUT_MS,
      signal: options.signal,
    },
  );

  if (!response.ok) {
    throw await createApiError(response, "The conversion job status could not be retrieved.");
  }

  return validateJobResponse(
    await response.json(),
    options.operation,
    options.expectedOutputMediaType,
  );
}

async function cancelJob(
  jobId: string,
  operation: ConversionJobOperation,
  expectedOutputMediaType: string,
): Promise<ConversionJobStatus | null> {
  try {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/conversion-jobs/${encodeURIComponent(jobId)}`,
      {
        method: "DELETE",
        timeoutMs: CANCELLATION_TIMEOUT_MS,
      },
    );

    if (!response.ok) {
      return null;
    }

    return validateJobResponse(await response.json(), operation, expectedOutputMediaType).status;
  } catch (error) {
    console.warn(`Could not confirm backend ${operation} cancellation:`, error);

    return null;
  }
}

async function waitForCompletion(initialJob: ConversionJob, options: ConversionJobRunOptions) {
  let job = initialJob;
  const pollIntervalMs = Math.max(500, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);

  if (job.status === "queued" || job.status === "running") {
    emitProgress(options.onProgress, {
      stage: job.stage,
      message: job.message,
      progress: job.progress,
    });
  }

  while (job.status === "queued" || job.status === "running") {
    await waitForNextPoll(pollIntervalMs, options.signal);

    job = await getJob(job.id, options);

    if (job.status === "queued" || job.status === "running") {
      emitProgress(options.onProgress, {
        stage: job.stage,
        message: job.message,
        progress: job.progress,
      });
    }
  }

  if (job.status === "cancelled") {
    emitProgress(options.onProgress, {
      stage: job.stage,
      message: job.message,
      progress: job.progress,
    });

    throw createConversionAbortError();
  }

  if (job.status === "failed") {
    emitProgress(options.onProgress, {
      stage: job.stage,
      message: job.message,
      progress: job.progress,
    });

    throw new Error(job.error?.message || `The ${options.conversionLabel} job failed.`);
  }

  if (job.status !== "completed" || !job.resultReady) {
    throw new Error(`The ${options.conversionLabel} result is not ready.`);
  }

  return job;
}

async function readResult(job: ConversionJob, options: ConversionJobRunOptions) {
  emitProgress(options.onProgress, {
    stage: "downloading",
    message: `Downloading the converted ${options.operation === "word-to-pdf" ? "PDF" : "Word document"}.`,
    progress: {
      mode: "indeterminate",
    },
  });

  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/conversion-jobs/${encodeURIComponent(job.id)}/result`,
    {
      method: "GET",
      timeoutMs: RESULT_TIMEOUT_MS,
      signal: options.signal,
    },
  );

  if (!response.ok) {
    throw await createApiError(response, "The converted document could not be downloaded.");
  }

  const responseMediaType = response.headers.get("Content-Type")?.split(";", 1)[0]?.trim();

  if (responseMediaType !== options.expectedOutputMediaType) {
    throw new Error("The conversion server returned an unexpected result media type.");
  }

  const contentLength = Number(response.headers.get("Content-Length"));

  if (!response.body || !Number.isFinite(contentLength) || contentLength <= 0) {
    const bytes = new Uint8Array(await response.arrayBuffer());

    if (bytes.byteLength === 0) {
      throw new Error("The conversion server returned an empty document.");
    }

    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  let streamCompleted = false;

  try {
    while (true) {
      throwIfAborted(options.signal);

      const { done, value } = await reader.read();

      if (done) {
        streamCompleted = true;
        break;
      }

      if (!value) {
        continue;
      }

      chunks.push(value);
      receivedBytes += value.byteLength;

      emitProgress(options.onProgress, {
        stage: "downloading",
        message: `Downloading the converted document: ${receivedBytes.toLocaleString()} of ${contentLength.toLocaleString()} bytes.`,
        progress: {
          mode: "determinate",
          value: Math.min(100, Math.round((receivedBytes / contentLength) * 100)),
        },
      });
    }
  } finally {
    if (!streamCompleted) {
      try {
        await reader.cancel();
      } catch {
        // Preserve the original read, cancellation, abort, or timeout error.
      }
    }

    try {
      reader.releaseLock();
    } catch {
      // The stream may already have released or invalidated its reader lock.
    }
  }

  if (receivedBytes === 0) {
    throw new Error("The conversion server returned an empty document.");
  }

  const combinedBytes = new Uint8Array(receivedBytes);
  let offset = 0;

  for (const chunk of chunks) {
    combinedBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return combinedBytes;
}

export async function runConversionJob(
  options: ConversionJobRunOptions,
): Promise<ConversionJobResult> {
  throwIfAborted(options.signal);

  let jobId: string | undefined;

  try {
    emitProgress(options.onProgress, {
      stage: "uploading",
      message: "Uploading the document. Upload progress is not available.",
      progress: {
        mode: "indeterminate",
      },
    });

    const createdJob = await createJob(options);

    jobId = createdJob.id;

    const completedJob = await waitForCompletion(createdJob, options);
    const bytes = await readResult(completedJob, options);

    return {
      job: completedJob,
      bytes,
    };
  } catch (error) {
    if (!isConversionAbortError(error) && !options.signal?.aborted) {
      throw error;
    }

    let cancellationMessage: string;

    if (jobId) {
      const backendStatus = await cancelJob(
        jobId,
        options.operation,
        options.expectedOutputMediaType,
      );

      if (backendStatus === "cancelled") {
        cancellationMessage = `${options.conversionLabel} conversion was cancelled.`;
      } else if (backendStatus === "completed") {
        cancellationMessage =
          "The browser request was cancelled after the backend conversion had already completed.";
      } else if (backendStatus === "failed") {
        cancellationMessage =
          "The browser request was cancelled after the backend conversion had already failed.";
      } else {
        cancellationMessage =
          "The browser request was cancelled, but backend cancellation could not be confirmed.";
      }
    } else {
      cancellationMessage =
        "The upload request was cancelled before a job ID was received. Backend cancellation could not be confirmed.";
    }

    emitProgress(options.onProgress, {
      stage: "cancelled",
      message: cancellationMessage,
      progress: {
        mode: "determinate",
        value: 0,
      },
    });

    throw createConversionAbortError(cancellationMessage);
  }
}
