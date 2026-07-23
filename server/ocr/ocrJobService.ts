import {
  convertPdfWithOcr,
} from "../adobePdfService";
import {
  getSdkOcrLocale,
} from "./ocrLanguageMapping";

import {
  getOcrJob,
  updateOcrJob,
} from "./ocrJobStore";

import type {
  OcrJobRecord,
} from "./ocrJobTypes";

function isJobCancelled(
  job: OcrJobRecord
): boolean {
  return (
    job.status ===
      "cancelled" ||
    job.abortController
      .signal.aborted
  );
}

function ensureJobIsActive(
  job: OcrJobRecord
) {
  if (
    isJobCancelled(job)
  ) {
    const error =
      new Error(
        "OCR processing was cancelled."
      );

    error.name =
      "AbortError";

    throw error;
  }
}

async function processOcrJob(
  jobId: string
) {
  const job =
    getOcrJob(jobId);

  if (!job) {
    return;
  }

  try {
    updateOcrJob(
      jobId,
      {
        status:
          "running",

        stage:
          "validating",

        message:
          "Validating the uploaded PDF.",

        progress: {
          mode:
            "indeterminate",
        },
      }
    );

    ensureJobIsActive(job);

    if (
      job.inputBuffer.byteLength ===
      0
    ) {
      throw new Error(
        "The uploaded PDF is empty."
      );
    }

    updateOcrJob(
      jobId,
      {
        status:
          "running",

        stage:
          "processing",

        message:
          "The OCR service is recognizing text in the document.",

        progress: {
          mode:
            "indeterminate",
        },
      }
    );

    ensureJobIsActive(job);

    const searchablePdf =
      await convertPdfWithOcr(
        job.inputBuffer,
        {
          language:
            getSdkOcrLocale(
              job.ocrLanguage.code
            ),
        }
      );

    ensureJobIsActive(job);

    updateOcrJob(
      jobId,
      {
        status:
          "running",

        stage:
          "preparing",

        message:
          "Preparing the searchable PDF for download.",

        progress: {
          mode:
            "indeterminate",
        },
      }
    );

    const outputBuffer =
      Buffer.from(
        searchablePdf
      );

    if (
      outputBuffer.byteLength ===
      0
    ) {
      throw new Error(
        "The OCR service returned an empty PDF."
      );
    }

    ensureJobIsActive(job);

    updateOcrJob(
      jobId,
      {
        status:
          "completed",

        stage:
          "completed",

        message:
          "The searchable PDF is ready.",

        progress: {
          mode:
            "determinate",

          value:
            100,
        },

        outputBuffer,
      }
    );

    job.inputBuffer =
      Buffer.alloc(0);
  } catch (error) {
    if (
      isJobCancelled(job) ||
      (
        error instanceof Error &&
        error.name ===
          "AbortError"
      )
    ) {
      updateOcrJob(
        jobId,
        {
          status:
            "cancelled",

          stage:
            "cancelled",

          message:
            "OCR processing was cancelled.",

          progress: {
            mode:
              "determinate",

            value:
              0,
          },
        }
      );

      job.inputBuffer =
        Buffer.alloc(0);

      return;
    }

    updateOcrJob(
      jobId,
      {
        status:
          "failed",

        stage:
          "failed",

        message:
          "OCR processing failed.",

        progress: {
          mode:
            "determinate",

          value:
            0,
        },

        error: {
          message:
            "The OCR job could not be completed.",

          code:
            "OCR_PROCESSING_FAILED",
        },
      }
    );

    job.inputBuffer =
      Buffer.alloc(0);

    console.error(
      `[Server] OCR job ${jobId} failed with OCR_PROCESSING_FAILED.`
    );
  }
}

export function startOcrJob(
  jobId: string
) {
  const job =
    getOcrJob(jobId);

  if (!job) {
    throw new Error(
      "The OCR job was not found."
    );
  }

  queueMicrotask(
    () => {
      void processOcrJob(
        jobId
      );
    }
  );
}
