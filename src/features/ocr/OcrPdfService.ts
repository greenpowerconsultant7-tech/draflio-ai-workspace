import {
  API_BASE_URL,
} from "@/config/api";

import {
  createApiError,
} from "@/lib/apiError";

import {
  fetchWithTimeout,
  RequestTimeoutError,
} from "@/lib/fetchWithTimeout";

import {
  PDFDocument,
} from "pdf-lib";

export type OcrLanguage =
  | "en-US"
  | "en-GB"
  | "fr-FR"
  | "de-DE"
  | "es-ES"
  | "it-IT"
  | "pt-BR"
  | "nl-NL";

export type OcrPdfOptions = {
  language: OcrLanguage;

  createWordDocument: boolean;
};

export type OcrProgressMode =
  | {
      mode: "determinate";
      value: number;
    }
  | {
      mode: "indeterminate";
    };

export type OcrProgressStage =
  | "uploading"
  | "queued"
  | "validating"
  | "processing"
  | "preparing"
  | "downloading"
  | "verifying"
  | "creating-word"
  | "completed"
  | "failed"
  | "cancelled";

export type OcrProgressUpdate = {
  stage: OcrProgressStage;

  message: string;

  progress: OcrProgressMode;
};

export type OcrPdfRunOptions = {
  signal?: AbortSignal;

  onProgress?: (
    update: OcrProgressUpdate
  ) => void;

  pollIntervalMs?: number;
};

export type OcrPdfResult = {
  blob: Blob;

  pageCount: number;

  size: number;

  wordBlob?: Blob;

  wordSize?: number;
};

type OcrServerJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

type OcrServerJobStage =
  | "queued"
  | "validating"
  | "processing"
  | "preparing"
  | "completed"
  | "failed"
  | "cancelled";

type OcrServerJob = {
  id: string;

  status: OcrServerJobStatus;

  stage: OcrServerJobStage;

  message: string;

  progress: OcrProgressMode;

  originalFilename: string;

  outputFilename: string;

  language: string;

  createdAt: string;

  updatedAt: string;

  resultReady: boolean;

  error?: {
    message: string;
    code?: string;
  };
};

type OcrJobResponse = {
  job: OcrServerJob;
};

const MAXIMUM_PDF_SIZE =
  100 * 1024 * 1024;

const DEFAULT_POLL_INTERVAL_MS =
  1_000;

function isAbortError(
  error: unknown
): boolean {
  return (
    (
      error instanceof DOMException ||
      error instanceof Error
    ) &&
    error.name === "AbortError"
  );
}

function createAbortError() {
  return new DOMException(
    "OCR processing was cancelled.",
    "AbortError"
  );
}

function throwIfAborted(
  signal?: AbortSignal
) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function validatePdfFile(
  file: File
) {
  const filename =
    file.name.toLowerCase();

  const isPdf =
    file.type ===
      "application/pdf" ||
    filename.endsWith(
      ".pdf"
    );

  if (!isPdf) {
    throw new Error(
      "Please select a PDF file."
    );
  }

  if (file.size === 0) {
    throw new Error(
      "The selected PDF is empty."
    );
  }

  if (
    file.size >
    MAXIMUM_PDF_SIZE
  ) {
    throw new Error(
      "The selected PDF exceeds the 100 MB size limit."
    );
  }
}

function emitProgress(
  callback:
    | ((
        update: OcrProgressUpdate
      ) => void)
    | undefined,
  update: OcrProgressUpdate
) {
  callback?.(
    update
  );
}

function emitJobProgress(
  callback:
    | ((
        update: OcrProgressUpdate
      ) => void)
    | undefined,
  job: OcrServerJob
) {
  emitProgress(
    callback,
    {
      stage:
        job.stage,

      message:
        job.message,

      progress:
        job.progress,
    }
  );
}

function validateJobResponse(
  value: unknown
): OcrServerJob {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    throw new Error(
      "The OCR server returned an invalid response."
    );
  }

  const response =
    value as Partial<OcrJobResponse>;

  if (
    !response.job ||
    typeof response.job.id !==
      "string" ||
    !response.job.id
  ) {
    throw new Error(
      "The OCR server did not return a valid job ID."
    );
  }

  return response.job;
}

function waitForNextPoll(
  milliseconds: number,
  signal?: AbortSignal
): Promise<void> {
  throwIfAborted(
    signal
  );

  return new Promise(
    (
      resolve,
      reject
    ) => {
      const handleAbort =
        () => {
          window.clearTimeout(
            timeout
          );

          signal?.removeEventListener(
            "abort",
            handleAbort
          );

          reject(
            createAbortError()
          );
        };

      const timeout =
        window.setTimeout(
          () => {
            signal?.removeEventListener(
              "abort",
              handleAbort
            );

            resolve();
          },
          milliseconds
        );

      signal?.addEventListener(
        "abort",
        handleAbort,
        {
          once:
            true,
        }
      );
    }
  );
}

async function cancelOcrJob(
  jobId: string
) {
  try {
    await fetchWithTimeout(
      `${API_BASE_URL}/api/ocr-jobs/${encodeURIComponent(
        jobId
      )}`,
      {
        method:
          "DELETE",

        timeoutMs:
          10_000,
      }
    );
  } catch (error) {
    console.warn(
      "Could not cancel the OCR job on the server:",
      error
    );
  }
}

async function createOcrJob(
  file: File,
  options: OcrPdfOptions,
  signal?: AbortSignal
): Promise<OcrServerJob> {
  const formData =
    new FormData();

  formData.append(
    "file",
    file
  );

  formData.append(
    "language",
    options.language
  );

  const response =
    await fetchWithTimeout(
      `${API_BASE_URL}/api/ocr-jobs`,
      {
        method:
          "POST",

        body:
          formData,

        timeoutMs:
          180_000,

        signal,
      }
    );

  if (!response.ok) {
    throw await createApiError(
      response,
      "The OCR job could not be created."
    );
  }

  const responseData =
    await response.json();

  return validateJobResponse(
    responseData
  );
}

async function getOcrJob(
  jobId: string,
  signal?: AbortSignal
): Promise<OcrServerJob> {
  const response =
    await fetchWithTimeout(
      `${API_BASE_URL}/api/ocr-jobs/${encodeURIComponent(
        jobId
      )}`,
      {
        method:
          "GET",

        timeoutMs:
          30_000,

        signal,
      }
    );

  if (!response.ok) {
    throw await createApiError(
      response,
      "The OCR job status could not be retrieved."
    );
  }

  const responseData =
    await response.json();

  return validateJobResponse(
    responseData
  );
}

async function waitForOcrCompletion(
  initialJob: OcrServerJob,
  runOptions: OcrPdfRunOptions
): Promise<OcrServerJob> {
  let job =
    initialJob;

  const pollIntervalMs =
    Math.max(
      500,
      runOptions.pollIntervalMs ??
        DEFAULT_POLL_INTERVAL_MS
    );

  emitJobProgress(
    runOptions.onProgress,
    job
  );

  while (
    job.status ===
      "queued" ||
    job.status ===
      "running"
  ) {
    await waitForNextPoll(
      pollIntervalMs,
      runOptions.signal
    );

    job =
      await getOcrJob(
        job.id,
        runOptions.signal
      );

    emitJobProgress(
      runOptions.onProgress,
      job
    );
  }

  if (
    job.status ===
    "cancelled"
  ) {
    throw createAbortError();
  }

  if (
    job.status ===
    "failed"
  ) {
    throw new Error(
      job.error?.message ||
        "The OCR job failed."
    );
  }

  if (
    job.status !==
      "completed" ||
    !job.resultReady
  ) {
    throw new Error(
      "The OCR result is not ready."
    );
  }

  return job;
}

async function downloadOcrResult(
  job: OcrServerJob,
  runOptions: OcrPdfRunOptions
): Promise<Blob> {
  emitProgress(
    runOptions.onProgress,
    {
      stage:
        "downloading",

      message:
        "Downloading the searchable PDF.",

      progress: {
        mode:
          "indeterminate",
      },
    }
  );

  const response =
    await fetchWithTimeout(
      `${API_BASE_URL}/api/ocr-jobs/${encodeURIComponent(
        job.id
      )}/result`,
      {
        method:
          "GET",

        timeoutMs:
          600_000,

        signal:
          runOptions.signal,
      }
    );

  if (!response.ok) {
    throw await createApiError(
      response,
      "The searchable PDF could not be downloaded."
    );
  }

  const contentLength =
    Number(
      response.headers.get(
        "Content-Length"
      )
    );

  if (
    !response.body ||
    !Number.isFinite(
      contentLength
    ) ||
    contentLength <= 0
  ) {
    const blob =
      await response.blob();

    if (
      blob.size ===
      0
    ) {
      throw new Error(
        "The OCR server returned an empty PDF."
      );
    }

    return blob;
  }

  const reader =
    response.body.getReader();

  const chunks:
    Uint8Array[] = [];

  let receivedBytes =
    0;

  while (true) {
    throwIfAborted(
      runOptions.signal
    );

    const {
      done,
      value,
    } =
      await reader.read();

    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    chunks.push(
      value
    );

    receivedBytes +=
      value.byteLength;

    emitProgress(
      runOptions.onProgress,
      {
        stage:
          "downloading",

        message:
          `Downloading the searchable PDF: ${receivedBytes.toLocaleString()} of ${contentLength.toLocaleString()} bytes.`,

        progress: {
          mode:
            "determinate",

          value:
            Math.min(
              100,
              Math.round(
                (
                  receivedBytes /
                  contentLength
                ) *
                  100
              )
            ),
        },
      }
    );
  }

  if (
    receivedBytes ===
    0
  ) {
    throw new Error(
      "The OCR server returned an empty PDF."
    );
  }

  const combinedBytes =
    new Uint8Array(
      receivedBytes
    );

  let offset =
    0;

  for (
    const chunk of chunks
  ) {
    combinedBytes.set(
      chunk,
      offset
    );

    offset +=
      chunk.byteLength;
  }

  const arrayBuffer =
    new ArrayBuffer(
      combinedBytes.byteLength
    );

  new Uint8Array(
    arrayBuffer
  ).set(
    combinedBytes
  );

  return new Blob(
    [
      arrayBuffer,
    ],
    {
      type:
        response.headers.get(
          "Content-Type"
        ) ||
        "application/pdf",
    }
  );
}

async function createWordDocument(
  searchablePdf: Blob,
  originalFilename: string,
  runOptions: OcrPdfRunOptions
): Promise<Blob> {
  emitProgress(
    runOptions.onProgress,
    {
      stage:
        "creating-word",

      message:
        "Creating an editable Word document.",

      progress: {
        mode:
          "indeterminate",
      },
    }
  );

  const originalName =
    originalFilename.replace(
      /\.pdf$/i,
      ""
    );

  const formData =
    new FormData();

  formData.append(
    "file",
    searchablePdf,
    `${originalName}_searchable.pdf`
  );

  const response =
    await fetchWithTimeout(
      `${API_BASE_URL}/api/pdf-to-word`,
      {
        method:
          "POST",

        body:
          formData,

        timeoutMs:
          600_000,

        signal:
          runOptions.signal,
      }
    );

  if (!response.ok) {
    throw await createApiError(
      response,
      "The editable Word document could not be created."
    );
  }

  const wordBlob =
    await response.blob();

  if (
    wordBlob.size ===
    0
  ) {
    throw new Error(
      "The conversion server returned an empty Word document."
    );
  }

  return wordBlob;
}

export async function runPdfOcr(
  file: File,
  options: OcrPdfOptions,
  runOptions:
    OcrPdfRunOptions = {}
): Promise<OcrPdfResult> {
  validatePdfFile(
    file
  );

  throwIfAborted(
    runOptions.signal
  );

  let jobId:
    | string
    | undefined;

  try {
    emitProgress(
      runOptions.onProgress,
      {
        stage:
          "uploading",

        message:
          "Uploading the PDF to the OCR server.",

        progress: {
          mode:
            "indeterminate",
        },
      }
    );

    const createdJob =
      await createOcrJob(
        file,
        options,
        runOptions.signal
      );

    jobId =
      createdJob.id;

    const completedJob =
      await waitForOcrCompletion(
        createdJob,
        runOptions
      );

    const responseBlob =
      await downloadOcrResult(
        completedJob,
        runOptions
      );

    emitProgress(
      runOptions.onProgress,
      {
        stage:
          "verifying",

        message:
          "Verifying the searchable PDF.",

        progress: {
          mode:
            "indeterminate",
        },
      }
    );

    const responseBytes =
      new Uint8Array(
        await responseBlob.arrayBuffer()
      );

    if (
      responseBytes.byteLength ===
      0
    ) {
      throw new Error(
        "The OCR server returned an empty PDF."
      );
    }

    let pageCount =
      0;

    try {
      const pdfDocument =
        await PDFDocument.load(
          responseBytes
        );

      pageCount =
        pdfDocument.getPageCount();
    } catch (error) {
      console.warn(
        "Could not read the searchable PDF page count:",
        error
      );
    }

    const safeBuffer =
      new ArrayBuffer(
        responseBytes.byteLength
      );

    new Uint8Array(
      safeBuffer
    ).set(
      responseBytes
    );

    const safeBlob =
      new Blob(
        [
          safeBuffer,
        ],
        {
          type:
            responseBlob.type ||
            "application/pdf",
        }
      );

    let wordBlob:
      | Blob
      | undefined;

    if (
      options.createWordDocument
    ) {
      wordBlob =
        await createWordDocument(
          safeBlob,
          file.name,
          runOptions
        );
    }

    emitProgress(
      runOptions.onProgress,
      {
        stage:
          "completed",

        message:
          options.createWordDocument
            ? "The searchable PDF and editable Word document are ready."
            : "The searchable PDF is ready.",

        progress: {
          mode:
            "determinate",

          value:
            100,
        },
      }
    );

    return {
      blob:
        safeBlob,

      pageCount,

      size:
        safeBlob.size,

      ...(wordBlob
        ? {
            wordBlob,

            wordSize:
              wordBlob.size,
          }
        : {}),
    };
  } catch (error) {
    if (
      jobId &&
      (
        isAbortError(
          error
        ) ||
        runOptions.signal
          ?.aborted
      )
    ) {
      await cancelOcrJob(
        jobId
      );
    }

    if (
      isAbortError(
        error
      ) ||
      runOptions.signal
        ?.aborted
    ) {
      emitProgress(
        runOptions.onProgress,
        {
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

      throw createAbortError();
    }

    if (
      error instanceof
      RequestTimeoutError
    ) {
      throw error;
    }

    console.error(
      "OCR request failed:",
      error
    );

    throw error;
  }
}

export const ocrPdfService = {
  runPdfOcr,
};