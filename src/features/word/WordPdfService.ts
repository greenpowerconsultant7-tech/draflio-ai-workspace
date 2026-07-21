import { API_BASE_URL } from "@/config/api";

import { createApiError } from "@/lib/apiError";

import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

import { PDFDocument } from "pdf-lib";

export type WordPdfMode = "word-to-pdf" | "pdf-to-word";

export type WordPageSize = "a4" | "letter";

export type WordPageOrientation = "portrait" | "landscape";

export type WordToPdfOptions = {
  pageSize: WordPageSize;
  orientation: WordPageOrientation;
  margin: number;
  quality: number;
};

export type PdfToWordOptions = {
  preservePageBreaks: boolean;
  includePageNumbers: boolean;
};

export type WordProgressMode =
  | {
      mode: "determinate";
      value: number;
    }
  | {
      mode: "indeterminate";
    };

export type WordProgressStage =
  | "uploading"
  | "queued"
  | "validating"
  | "authenticating"
  | "creating-asset"
  | "submitting"
  | "processing"
  | "downloading"
  | "preparing"
  | "completed"
  | "failed"
  | "cancelled";

export type WordProgressUpdate = {
  stage: WordProgressStage;
  message: string;
  progress: WordProgressMode;
};

export type WordToPdfRunOptions = {
  signal?: AbortSignal;
  onProgress?: (update: WordProgressUpdate) => void;
  pollIntervalMs?: number;
};

export type WordToPdfResult = {
  bytes: Uint8Array;
  pageCount: number;
  messages: string[];
  outputFilename: string;
};

export type PdfToWordResult = {
  blob: Blob;
  pageCount: number;
  paragraphCount: number;
  characterCount: number;
};

type ConversionJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

type ConversionJobStage =
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

type ConversionJob = {
  id: string;
  operation: "word-to-pdf";
  status: ConversionJobStatus;
  stage: ConversionJobStage;
  message: string;
  progress: WordProgressMode;
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

type ConversionJobResponse = {
  job: ConversionJob;
};

const MAXIMUM_DOCX_SIZE = 100 * 1024 * 1024;

const DEFAULT_POLL_INTERVAL_MS = 1_000;

function createAbortError(message = "Word-to-PDF conversion was cancelled.") {
  const error = new Error(message);

  error.name = "AbortError";

  return error;
}

function isAbortError(error: unknown) {
  return (error instanceof DOMException || error instanceof Error) && error.name === "AbortError";
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function emitProgress(
  callback: ((update: WordProgressUpdate) => void) | undefined,
  update: WordProgressUpdate,
) {
  callback?.(update);
}

function validateDocxFile(file: File) {
  const filename = file.name.toLowerCase();

  if (!filename.endsWith(".docx")) {
    throw new Error("Please upload a DOCX file.");
  }

  if (file.size <= 0) {
    throw new Error("The selected DOCX file is empty.");
  }

  if (file.size > MAXIMUM_DOCX_SIZE) {
    throw new Error("The selected DOCX file exceeds the 100 MB limit.");
  }
}

function validateJobResponse(value: unknown): ConversionJob {
  if (!value || typeof value !== "object") {
    throw new Error("The conversion server returned an invalid job response.");
  }

  const response = value as Partial<ConversionJobResponse>;

  if (
    !response.job ||
    typeof response.job.id !== "string" ||
    !response.job.id ||
    response.job.operation !== "word-to-pdf"
  ) {
    throw new Error("The conversion server did not return a valid Word-to-PDF job.");
  }

  return response.job;
}

function waitForNextPoll(milliseconds: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", handleAbort);
      reject(createAbortError());
    };

    const timeout = window.setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, milliseconds);

    signal?.addEventListener("abort", handleAbort, {
      once: true,
    });
  });
}

async function createWordToPdfJob(file: File, signal?: AbortSignal): Promise<ConversionJob> {
  const formData = new FormData();

  formData.append("file", file);

  const response = await fetchWithTimeout(`${API_BASE_URL}/api/conversion-jobs/word-to-pdf`, {
    method: "POST",
    body: formData,
    timeoutMs: 180_000,
    signal,
  });

  if (!response.ok) {
    throw await createApiError(response, "The Word-to-PDF job could not be created.");
  }

  return validateJobResponse(await response.json());
}

async function getConversionJob(jobId: string, signal?: AbortSignal): Promise<ConversionJob> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/conversion-jobs/${encodeURIComponent(jobId)}`,
    {
      method: "GET",
      timeoutMs: 30_000,
      signal,
    },
  );

  if (!response.ok) {
    throw await createApiError(response, "The conversion job status could not be retrieved.");
  }

  return validateJobResponse(await response.json());
}

async function cancelConversionJob(jobId: string): Promise<ConversionJobStatus | null> {
  try {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/conversion-jobs/${encodeURIComponent(jobId)}`,
      {
        method: "DELETE",
        timeoutMs: 10_000,
      },
    );

    if (!response.ok) {
      return null;
    }

    const job = validateJobResponse(await response.json());

    return job.status;
  } catch (error) {
    console.warn("Could not confirm backend Word-to-PDF cancellation:", error);

    return null;
  }
}

async function waitForCompletion(initialJob: ConversionJob, runOptions: WordToPdfRunOptions) {
  let job = initialJob;

  const pollIntervalMs = Math.max(500, runOptions.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);

  emitProgress(runOptions.onProgress, {
    stage: job.stage,
    message: job.message,
    progress: job.progress,
  });

  while (job.status === "queued" || job.status === "running") {
    await waitForNextPoll(pollIntervalMs, runOptions.signal);

    job = await getConversionJob(job.id, runOptions.signal);

    emitProgress(runOptions.onProgress, {
      stage: job.stage,
      message: job.message,
      progress: job.progress,
    });
  }

  if (job.status === "cancelled") {
    throw createAbortError();
  }

  if (job.status === "failed") {
    throw new Error(job.error?.message || "The Word-to-PDF job failed.");
  }

  if (job.status !== "completed" || !job.resultReady) {
    throw new Error("The Word-to-PDF result is not ready.");
  }

  return job;
}

async function downloadJobResult(
  job: ConversionJob,
  runOptions: WordToPdfRunOptions,
): Promise<Uint8Array> {
  emitProgress(runOptions.onProgress, {
    stage: "downloading",
    message: "Downloading the converted PDF.",
    progress: {
      mode: "indeterminate",
    },
  });

  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/conversion-jobs/${encodeURIComponent(job.id)}/result`,
    {
      method: "GET",
      timeoutMs: 180_000,
      signal: runOptions.signal,
    },
  );

  if (!response.ok) {
    throw await createApiError(response, "The converted PDF could not be downloaded.");
  }

  const contentLength = Number(response.headers.get("Content-Length"));

  if (!response.body || !Number.isFinite(contentLength) || contentLength <= 0) {
    const bytes = new Uint8Array(await response.arrayBuffer());

    if (bytes.byteLength === 0) {
      throw new Error("The conversion server returned an empty PDF.");
    }

    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  let streamCompleted = false;

  try {
    while (true) {
      throwIfAborted(runOptions.signal);

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

      emitProgress(runOptions.onProgress, {
        stage: "downloading",
        message: `Downloading the converted PDF: ${receivedBytes.toLocaleString()} of ${contentLength.toLocaleString()} bytes.`,
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
    throw new Error("The conversion server returned an empty PDF.");
  }

  const combinedBytes = new Uint8Array(receivedBytes);
  let offset = 0;

  for (const chunk of chunks) {
    combinedBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return combinedBytes;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      error?: string;
    };

    return data.error ?? "The conversion failed.";
  } catch {
    return "The conversion failed.";
  }
}

class WordPdfService {
  async wordToPdf(file: File, runOptions: WordToPdfRunOptions = {}): Promise<WordToPdfResult> {
    validateDocxFile(file);
    throwIfAborted(runOptions.signal);

    let jobId: string | undefined;

    try {
      emitProgress(runOptions.onProgress, {
        stage: "uploading",
        message: "Uploading the Word document. Upload progress is not available.",
        progress: {
          mode: "indeterminate",
        },
      });

      const createdJob = await createWordToPdfJob(file, runOptions.signal);

      jobId = createdJob.id;

      const completedJob = await waitForCompletion(createdJob, runOptions);

      const bytes = await downloadJobResult(completedJob, runOptions);

      emitProgress(runOptions.onProgress, {
        stage: "preparing",
        message: "Verifying the converted PDF.",
        progress: {
          mode: "indeterminate",
        },
      });

      const pdf = await PDFDocument.load(bytes);

      emitProgress(runOptions.onProgress, {
        stage: "completed",
        message: "The converted PDF is ready.",
        progress: {
          mode: "determinate",
          value: 100,
        },
      });

      return {
        bytes,
        pageCount: pdf.getPageCount(),
        messages: [],
        outputFilename: completedJob.outputFilename,
      };
    } catch (error) {
      if (isAbortError(error) || runOptions.signal?.aborted) {
        let cancellationMessage: string;

        if (jobId) {
          const backendStatus = await cancelConversionJob(jobId);

          if (backendStatus === "cancelled") {
            cancellationMessage = "Word-to-PDF conversion was cancelled.";
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

        emitProgress(runOptions.onProgress, {
          stage: "cancelled",
          message: cancellationMessage,
          progress: {
            mode: "determinate",
            value: 0,
          },
        });

        throw createAbortError(cancellationMessage);
      }

      throw error;
    }
  }

  async pdfToWord(file: File, _options: PdfToWordOptions): Promise<PdfToWordResult> {
    const originalPdf = await PDFDocument.load(await file.arrayBuffer());

    const pageCount = originalPdf.getPageCount();

    const formData = new FormData();

    formData.append("file", file);

    const response = await fetch(`${API_BASE_URL}/api/pdf-to-word`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    const blob = await response.blob();

    return {
      blob,
      pageCount,
      paragraphCount: 0,
      characterCount: 0,
    };
  }
}

export const wordPdfService = new WordPdfService();
