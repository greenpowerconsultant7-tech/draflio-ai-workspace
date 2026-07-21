import { randomUUID } from "node:crypto";

import type {
  ConversionJobPublicData,
  ConversionJobRecord,
  CreateConversionJobInput,
  UpdateConversionJobInput,
} from "./conversionJobTypes";

const CONVERSION_JOB_TTL_MS = 30 * 60 * 1000;

const cleanupIntervalMs = 5 * 60 * 1000;

const jobs = new Map<string, ConversionJobRecord>();

let isStoreClosed = false;

function createExpiryDate() {
  return new Date(Date.now() + CONVERSION_JOB_TTL_MS);
}

function toPublicData(job: ConversionJobRecord): ConversionJobPublicData {
  return {
    id: job.id,
    operation: job.operation,
    status: job.status,
    stage: job.stage,
    message: job.message,
    progress: job.progress,
    originalFilename: job.originalFilename,
    outputFilename: job.outputFilename,
    inputMediaType: job.inputMediaType,
    outputMediaType: job.outputMediaType,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    resultReady: Boolean(job.outputBuffer),
    ...(job.error
      ? {
          error: job.error,
        }
      : {}),
  };
}

export function createConversionJob(input: CreateConversionJobInput): ConversionJobRecord {
  if (isStoreClosed) {
    throw new Error("The conversion job store is closed.");
  }

  const now = new Date();

  const job: ConversionJobRecord = {
    id: randomUUID(),
    operation: input.operation,
    status: "queued",
    stage: "queued",
    message: "Conversion job is queued.",
    progress: {
      mode: "indeterminate",
    },
    originalFilename: input.originalFilename,
    outputFilename: input.outputFilename,
    inputMediaType: input.inputMediaType,
    outputMediaType: input.outputMediaType,
    createdAt: now,
    updatedAt: now,
    expiresAt: createExpiryDate(),
    inputBuffer: Buffer.from(input.inputBuffer),
    abortController: new AbortController(),
  };

  jobs.set(job.id, job);

  return job;
}

export function getConversionJob(jobId: string): ConversionJobRecord | undefined {
  const job = jobs.get(jobId);

  if (!job) {
    return undefined;
  }

  if (job.expiresAt.getTime() <= Date.now()) {
    deleteConversionJob(jobId);

    return undefined;
  }

  return job;
}

export function getConversionJobPublicData(jobId: string): ConversionJobPublicData | undefined {
  const job = getConversionJob(jobId);

  return job ? toPublicData(job) : undefined;
}

export function updateConversionJob(
  jobId: string,
  input: UpdateConversionJobInput,
): ConversionJobRecord | undefined {
  const job = getConversionJob(jobId);

  if (!job) {
    return undefined;
  }

  if (input.status !== undefined) {
    job.status = input.status;
  }

  if (input.stage !== undefined) {
    job.stage = input.stage;
  }

  if (input.message !== undefined) {
    job.message = input.message;
  }

  if (input.progress !== undefined) {
    job.progress = input.progress;
  }

  if (input.outputBuffer !== undefined) {
    job.outputBuffer = Buffer.from(input.outputBuffer);
  }

  if (input.error !== undefined) {
    job.error = input.error;
  }

  job.updatedAt = new Date();
  job.expiresAt = createExpiryDate();

  return job;
}

export function cancelConversionJob(jobId: string): ConversionJobRecord | undefined {
  const job = getConversionJob(jobId);

  if (!job) {
    return undefined;
  }

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return job;
  }

  job.abortController.abort();
  job.status = "cancelled";
  job.stage = "cancelled";
  job.message = "Conversion was cancelled.";
  job.progress = {
    mode: "determinate",
    value: 0,
  };
  job.updatedAt = new Date();
  job.expiresAt = createExpiryDate();

  return job;
}

export function deleteConversionJob(jobId: string): boolean {
  const job = jobs.get(jobId);

  if (!job) {
    return false;
  }

  job.abortController.abort();
  job.inputBuffer = Buffer.alloc(0);

  if (job.outputBuffer) {
    job.outputBuffer = Buffer.alloc(0);
  }

  return jobs.delete(jobId);
}

export function cleanupExpiredConversionJobs() {
  const now = Date.now();

  for (const [jobId, job] of jobs) {
    if (job.expiresAt.getTime() <= now) {
      deleteConversionJob(jobId);
    }
  }
}

export function getConversionJobResult(jobId: string):
  | {
      buffer: Buffer;
      filename: string;
      mediaType: string;
    }
  | undefined {
  const job = getConversionJob(jobId);

  if (!job || job.status !== "completed" || !job.outputBuffer) {
    return undefined;
  }

  return {
    buffer: Buffer.from(job.outputBuffer),
    filename: job.outputFilename,
    mediaType: job.outputMediaType,
  };
}

const cleanupTimer = setInterval(cleanupExpiredConversionJobs, cleanupIntervalMs);

cleanupTimer.unref();

export function closeConversionJobStore() {
  if (isStoreClosed) {
    return;
  }

  isStoreClosed = true;
  clearInterval(cleanupTimer);

  for (const jobId of jobs.keys()) {
    deleteConversionJob(jobId);
  }
}
