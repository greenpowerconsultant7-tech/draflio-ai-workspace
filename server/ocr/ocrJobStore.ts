import {
  randomUUID,
} from "node:crypto";

import type {
  CreateOcrJobInput,
  OcrJobPublicData,
  OcrJobRecord,
  UpdateOcrJobInput,
} from "./ocrJobTypes";
import {
  toOcrLanguageInfo,
} from "./ocrLanguageMapping";

const OCR_JOB_TTL_MS =
  30 * 60 * 1000;

const cleanupIntervalMs =
  5 * 60 * 1000;

const jobs =
  new Map<
    string,
    OcrJobRecord
  >();

function createExpiryDate() {
  return new Date(
    Date.now() +
      OCR_JOB_TTL_MS
  );
}

function createJobId() {
  return randomUUID();
}

function toPublicData(
  job: OcrJobRecord
): OcrJobPublicData {
  return {
    id:
      job.id,

    status:
      job.status,

    stage:
      job.stage,

    message:
      job.message,

    progress:
      job.progress,

    originalFilename:
      job.originalFilename,

    outputFilename:
      job.outputFilename,

    ocrLanguage:
      job.ocrLanguage,

    createdAt:
      job.createdAt.toISOString(),

    updatedAt:
      job.updatedAt.toISOString(),

    resultReady:
      Boolean(
        job.outputBuffer
      ),

    ...(job.error
      ? {
          error:
            job.error,
        }
      : {}),
  };
}

export function createOcrJob(
  input: CreateOcrJobInput
): OcrJobRecord {
  const now =
    new Date();

  const job: OcrJobRecord = {
    id:
      createJobId(),

    status:
      "queued",

    stage:
      "queued",

    message:
      "OCR job is queued.",

    progress: {
      mode:
        "indeterminate",
    },

    originalFilename:
      input.originalFilename,

    outputFilename:
      input.outputFilename,

    ocrLanguage:
      toOcrLanguageInfo(
        input.ocrLanguage
      ),

    createdAt:
      now,

    updatedAt:
      now,

    expiresAt:
      createExpiryDate(),

    inputBuffer:
      Buffer.from(
        input.inputBuffer
      ),

    abortController:
      new AbortController(),
  };

  jobs.set(
    job.id,
    job
  );

  return job;
}

export function getOcrJob(
  jobId: string
): OcrJobRecord | undefined {
  const job =
    jobs.get(jobId);

  if (!job) {
    return undefined;
  }

  if (
    job.expiresAt.getTime() <=
    Date.now()
  ) {
    deleteOcrJob(
      jobId
    );

    return undefined;
  }

  return job;
}

export function getOcrJobPublicData(
  jobId: string
): OcrJobPublicData | undefined {
  const job =
    getOcrJob(jobId);

  return job
    ? toPublicData(job)
    : undefined;
}

export function updateOcrJob(
  jobId: string,
  input: UpdateOcrJobInput
): OcrJobRecord | undefined {
  const job =
    getOcrJob(jobId);

  if (!job) {
    return undefined;
  }

  if (
    input.status !==
    undefined
  ) {
    job.status =
      input.status;
  }

  if (
    input.stage !==
    undefined
  ) {
    job.stage =
      input.stage;
  }

  if (
    input.message !==
    undefined
  ) {
    job.message =
      input.message;
  }

  if (
    input.progress !==
    undefined
  ) {
    job.progress =
      input.progress;
  }

  if (
    input.outputBuffer !==
    undefined
  ) {
    job.outputBuffer =
      Buffer.from(
        input.outputBuffer
      );
  }

  if (
    input.error !==
    undefined
  ) {
    job.error =
      input.error;
  }

  job.updatedAt =
    new Date();

  job.expiresAt =
    createExpiryDate();

  return job;
}

export function cancelOcrJob(
  jobId: string
): OcrJobRecord | undefined {
  const job =
    getOcrJob(jobId);

  if (!job) {
    return undefined;
  }

  if (
    job.status ===
      "completed" ||
    job.status ===
      "failed" ||
    job.status ===
      "cancelled"
  ) {
    return job;
  }

  job.abortController.abort();

  job.status =
    "cancelled";

  job.stage =
    "cancelled";

  job.message =
    "OCR processing was cancelled.";

  job.progress = {
    mode:
      "determinate",

    value:
      0,
  };

  job.updatedAt =
    new Date();

  job.expiresAt =
    createExpiryDate();

  return job;
}

export function deleteOcrJob(
  jobId: string
): boolean {
  const job =
    jobs.get(jobId);

  if (!job) {
    return false;
  }

  job.abortController.abort();

  job.inputBuffer =
    Buffer.alloc(0);

  if (
    job.outputBuffer
  ) {
    job.outputBuffer =
      Buffer.alloc(0);
  }

  return jobs.delete(
    jobId
  );
}

export function cleanupExpiredOcrJobs() {
  const now =
    Date.now();

  for (
    const [
      jobId,
      job,
    ] of jobs
  ) {
    if (
      job.expiresAt.getTime() <=
      now
    ) {
      deleteOcrJob(
        jobId
      );
    }
  }
}

export function getOcrJobResult(
  jobId: string
): {
  buffer: Buffer;
  filename: string;
} | undefined {
  const job =
    getOcrJob(jobId);

  if (
    !job ||
    job.status !==
      "completed" ||
    !job.outputBuffer
  ) {
    return undefined;
  }

  return {
    buffer:
      Buffer.from(
        job.outputBuffer
      ),

    filename:
      job.outputFilename,
  };
}

const cleanupTimer =
  setInterval(
    cleanupExpiredOcrJobs,
    cleanupIntervalMs
  );

cleanupTimer.unref();

export function closeOcrJobStore() {
  clearInterval(
    cleanupTimer
  );

  for (
    const jobId of
    jobs.keys()
  ) {
    deleteOcrJob(
      jobId
    );
  }
}
