import {
  convertDocxToPdf,
  convertPdfToDocx,
  convertPdfToPptx,
  convertPdfToXlsx,
  convertPptxToPdf,
  convertXlsxToPdf,
} from "../adobePdfService";

import { getConversionJob, updateConversionJob } from "./conversionJobStore";

import type { AdobeConversionRunOptions, AdobeConversionStage } from "../adobePdfService";

import type {
  ConversionJobRecord,
  ConversionJobStage,
  ConversionOperation,
} from "./conversionJobTypes";

type ConversionRunner = (
  inputBuffer: Buffer,
  runOptions?: AdobeConversionRunOptions,
) => Promise<Buffer>;

const conversionRunners: Record<ConversionOperation, ConversionRunner> = {
  "word-to-pdf": convertDocxToPdf,
  "pdf-to-word": convertPdfToDocx,
  "excel-to-pdf": convertXlsxToPdf,
  "pdf-to-excel": convertPdfToXlsx,
  "powerpoint-to-pdf": convertPptxToPdf,
  "pdf-to-powerpoint": convertPdfToPptx,
};

const stageMessages: Record<AdobeConversionStage, string> = {
  authenticating: "Authenticating with the conversion service.",
  "creating-asset": "Creating a secure upload asset.",
  uploading: "Uploading the document for conversion.",
  submitting: "Submitting the conversion job.",
  processing: "The conversion service is processing the document.",
  downloading: "Downloading the converted document.",
};

function isJobCancelled(job: ConversionJobRecord) {
  return job.status === "cancelled" || job.abortController.signal.aborted;
}

function ensureJobIsActive(job: ConversionJobRecord) {
  if (isJobCancelled(job)) {
    const error = new Error("Conversion was cancelled.");

    error.name = "AbortError";
    throw error;
  }
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "The conversion job could not be completed.";
}

function updateRunningStage(job: ConversionJobRecord, stage: AdobeConversionStage) {
  ensureJobIsActive(job);

  updateConversionJob(job.id, {
    status: "running",
    stage: stage as ConversionJobStage,
    message: stageMessages[stage],
    progress: {
      mode: "indeterminate",
    },
  });
}

async function processConversionJob(jobId: string) {
  const job = getConversionJob(jobId);

  if (!job) {
    return;
  }

  try {
    updateConversionJob(jobId, {
      status: "running",
      stage: "validating",
      message: "Validating the uploaded document.",
      progress: {
        mode: "indeterminate",
      },
    });

    ensureJobIsActive(job);

    if (job.inputBuffer.byteLength === 0) {
      throw new Error("The uploaded document is empty.");
    }

    const runner = conversionRunners[job.operation];

    const output = await runner(job.inputBuffer, {
      signal: job.abortController.signal,
      onProgress: (stage) => {
        updateRunningStage(job, stage);
      },
    });

    ensureJobIsActive(job);

    updateConversionJob(jobId, {
      status: "running",
      stage: "preparing",
      message: "Preparing the converted document for download.",
      progress: {
        mode: "indeterminate",
      },
    });

    const outputBuffer = Buffer.from(output);

    if (outputBuffer.byteLength === 0) {
      throw new Error("The conversion service returned an empty document.");
    }

    ensureJobIsActive(job);

    updateConversionJob(jobId, {
      status: "completed",
      stage: "completed",
      message: "The converted document is ready.",
      progress: {
        mode: "determinate",
        value: 100,
      },
      outputBuffer,
    });

    job.inputBuffer = Buffer.alloc(0);
  } catch (error) {
    if (isJobCancelled(job) || isAbortError(error)) {
      updateConversionJob(jobId, {
        status: "cancelled",
        stage: "cancelled",
        message: "Conversion was cancelled.",
        progress: {
          mode: "determinate",
          value: 0,
        },
      });

      job.inputBuffer = Buffer.alloc(0);

      return;
    }

    updateConversionJob(jobId, {
      status: "failed",
      stage: "failed",
      message: "Conversion failed.",
      progress: {
        mode: "determinate",
        value: 0,
      },
      error: {
        message: getErrorMessage(error),
        code: "CONVERSION_PROCESSING_FAILED",
      },
    });

    job.inputBuffer = Buffer.alloc(0);

    console.error(`[Server] Conversion job ${jobId} failed:`, error);
  }
}

export function startConversionJob(jobId: string) {
  const job = getConversionJob(jobId);

  if (!job) {
    throw new Error("The conversion job was not found.");
  }

  queueMicrotask(() => {
    void processConversionJob(jobId);
  });
}
