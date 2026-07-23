import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  CheckCircle2,
  Download,
  FileSearch,
  FileText,
  ScanText,
  XCircle,
} from "lucide-react";

import {
  UploadZone,
} from "@/components/draflio/UploadZone";

import {
  useAbortableTask,
} from "@/hooks/useAbortableTask";

import {
  getApiErrorMessage,
} from "@/lib/apiError";

import {
  downloadFile,
  downloadPdf,
} from "@/lib/downloadFile";

import OcrPdfOptions from "./OcrPdfOptions";

import {
  ocrPdfService,
  type OcrPdfOptions as OcrOptions,
  type OcrPdfResult,
  type OcrProgressStage,
  type OcrProgressUpdate,
} from "./OcrPdfService";
import {
  DEFAULT_OCR_LANGUAGE_CODE,
  getOcrLanguage,
} from "../../../shared/ocrLanguages";

const defaultOptions: OcrOptions = {
  language: DEFAULT_OCR_LANGUAGE_CODE,

  createWordDocument: false,
};

const stageLabels: Record<
  OcrProgressStage,
  string
> = {
  uploading:
    "Uploading PDF",

  queued:
    "Waiting in queue",

  validating:
    "Validating PDF",

  processing:
    "Recognizing text",

  preparing:
    "Preparing PDF",

  downloading:
    "Downloading result",

  verifying:
    "Verifying PDF",

  "creating-word":
    "Creating Word document",

  completed:
    "Completed",

  failed:
    "Failed",

  cancelled:
    "Cancelled",
};

function formatBytes(
  bytes: number
) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (
    bytes <
    1024 * 1024
  ) {
    return `${(
      bytes / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    bytes /
    1024 /
    1024
  ).toFixed(2)} MB`;
}

function isAbortError(
  error: unknown
) {
  return (
    (
      error instanceof
        DOMException ||
      error instanceof Error
    ) &&
    error.name ===
      "AbortError"
  );
}

function clampProgress(
  value: number
) {
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        value
      )
    )
  );
}

export default function OcrPdfWorkspace() {
    const resultSectionRef =
    useRef<HTMLDivElement | null>(
      null
    );
  const [
    file,
    setFile,
  ] =
    useState<File | null>(
      null
    );

  const [
    options,
    setOptions,
  ] =
    useState<OcrOptions>(
      defaultOptions
    );

  const [
    result,
    setResult,
  ] =
    useState<OcrPdfResult | null>(
      null
    );

  const [
    progressUpdate,
    setProgressUpdate,
  ] =
    useState<OcrProgressUpdate | null>(
      null
    );

  const [
    error,
    setError,
  ] =
    useState("");

  const {
    run,
    cancel,
    isRunning:
      loading,
  } =
    useAbortableTask<OcrPdfResult>();
  useEffect(
    () => {
      if (
        !result
      ) {
        return;
      }

      const timeout =
        window.setTimeout(
          () => {
            resultSectionRef.current
              ?.scrollIntoView({
                behavior:
                  "smooth",

                block:
                  "start",
              });
          },
          150
        );

      return () => {
        window.clearTimeout(
          timeout
        );
      };
    },
    [
      result,
    ]
  );
  const determinateProgress =
    progressUpdate?.progress
      .mode ===
    "determinate"
      ? clampProgress(
          progressUpdate
            .progress.value
        )
      : null;

  const currentStageLabel =
    progressUpdate
      ? stageLabels[
          progressUpdate
            .stage
        ]
      : "Starting OCR";

  const clearResult =
    () => {
      setResult(
        null
      );

      setProgressUpdate(
        null
      );

      setError(
        ""
      );
    };

  const handleFiles =
    (
      selectedFiles:
        File[]
    ) => {
      const selectedFile =
        selectedFiles[0];

      if (!selectedFile) {
        return;
      }

      const filename =
        selectedFile.name.toLowerCase();

      const isPdf =
        selectedFile.type ===
          "application/pdf" ||
        filename.endsWith(
          ".pdf"
        );

      if (!isPdf) {
        setError(
          "Please upload a PDF file."
        );

        return;
      }

      cancel();

      setFile(
        selectedFile
      );

      clearResult();
    };

  const handleConvert =
    async () => {
      if (
        !file ||
        loading
      ) {
        return;
      }

      try {
        setResult(
          null
        );

        setProgressUpdate(
          null
        );

        setError(
          ""
        );

        const ocrResult =
          await run(
            (
              signal
            ) =>
              ocrPdfService.runPdfOcr(
                file,
                options,
                {
                  signal,

                  onProgress:
                    (
                      update
                    ) => {
                      setProgressUpdate(
                        update
                      );
                    },
                }
              )
          );

        if (!ocrResult) {
          return;
        }

        setResult(
          ocrResult
        );
      } catch (
        conversionError
      ) {
        if (
          isAbortError(
            conversionError
          )
        ) {
          return;
        }

        console.error(
          "PDF OCR failed:",
          conversionError
        );

        const errorMessage =
          getApiErrorMessage(
            conversionError,
            "The OCR process could not be completed."
          );

        setProgressUpdate({
          stage:
            "failed",

          message:
            errorMessage,

          progress: {
            mode:
              "determinate",

            value:
              0,
          },
        });

        setError(
          errorMessage
        );
      }
    };

  const handleCancel =
    () => {
      cancel();

      setResult(
        null
      );

      setProgressUpdate({
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
      });

      setError(
        "OCR processing was cancelled."
      );
    };

  const downloadSearchablePdf =
    () => {
      if (
        !result ||
        !file
      ) {
        return;
      }

      const originalName =
        file.name.replace(
          /\.pdf$/i,
          ""
        );

      downloadPdf(
        result.blob,
        `${originalName}_searchable.pdf`
      );
    };

const downloadWordDocument =
  () => {
    if (
      !result?.wordBlob ||
      !file
    ) {
      return;
    }

    const originalName =
      file.name.replace(
        /\.pdf$/i,
        ""
      );

    downloadFile(
      result.wordBlob,
      {
        filename:
          `${originalName}_editable.docx`,

        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }
    );
  };

  const resetWorkspace =
    () => {
      cancel();

      setFile(
        null
      );

      setResult(
        null
      );

      setProgressUpdate(
        null
      );

      setError(
        ""
      );

      setOptions(
        defaultOptions
      );
    };

  return (
    <div className="mx-auto max-w-6xl p-8">
      <div className="mb-8">
        <div className="mb-4 flex items-center gap-3">
          <ScanText className="h-10 w-10 text-cyan-500" />

          <h1 className="text-4xl font-bold">
            Smart OCR
          </h1>
        </div>

        <p className="text-slate-400">
          Turn scanned or image-only PDF
          documents into searchable and
          selectable PDF files.
        </p>
      </div>

      <OcrPdfOptions
        options={
          options
        }
        onOptionsChange={(
          nextOptions
        ) => {
          if (
            loading
          ) {
            cancel();
          }

          setOptions(
            nextOptions
          );

          clearResult();
        }}
        locked={
          loading
        }
      />

      <div className="mt-8">
        <UploadZone
          variant="workspace"
          multiple={
            false
          }
          accept=".pdf,application/pdf"
          maxSizeMB={
            100
          }
          onFiles={
            handleFiles
          }
        />
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-950/40 p-4 text-red-300">
          {error}
        </div>
      )}

      {file && (
        <p className="mt-3 text-sm text-slate-400">
          OCR recognition language:{" "}
          {
            getOcrLanguage(
              options.language
            ).label
          }
        </p>
      )}

      {file && (
        <div className="mt-8 rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <h2 className="text-xl font-bold text-white">
            Uploaded File
          </h2>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <FileText className="h-7 w-7 shrink-0 text-cyan-400" />

              <div className="min-w-0">
                <p className="truncate font-semibold text-white">
                  {
                    file.name
                  }
                </p>

                <p className="mt-1 text-sm text-slate-400">
                  {formatBytes(
                    file.size
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={
                resetWorkspace
              }
              disabled={
                loading
              }
              className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {file && (
        <div className="mt-8">
          <button
            type="button"
            onClick={
              handleConvert
            }
            disabled={
              loading
            }
            className="w-full rounded-2xl bg-cyan-600 px-8 py-4 font-bold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? determinateProgress !==
                null
                ? `${currentStageLabel} — ${determinateProgress}%`
                : `${currentStageLabel}...`
              : "Make PDF Searchable"}
          </button>

          {loading && (
            <>
              <button
                type="button"
                onClick={
                  handleCancel
                }
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/40 px-8 py-3 font-semibold text-red-300 transition hover:bg-red-950/40"
              >
                <XCircle className="h-5 w-5" />

                Cancel OCR
              </button>

              <div className="mt-6 rounded-2xl border border-cyan-500/20 bg-slate-900 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-400">
                      Current stage
                    </p>

                    <p className="mt-1 font-bold text-cyan-300">
                      {
                        currentStageLabel
                      }
                    </p>
                  </div>

                  <div className="rounded-full border border-cyan-500/30 bg-cyan-950/40 px-3 py-1 text-sm font-semibold text-cyan-300">
                    {determinateProgress !==
                    null
                      ? `${determinateProgress}%`
                      : "In progress"}
                  </div>
                </div>

                <div
                  className="mt-4 overflow-hidden rounded-full bg-slate-800"
                  role="progressbar"
                  aria-valuemin={
                    0
                  }
                  aria-valuemax={
                    100
                  }
                  aria-valuenow={
                    determinateProgress ??
                    undefined
                  }
                  aria-valuetext={
                    progressUpdate
                      ?.message
                  }
                >
                  {determinateProgress !==
                  null ? (
                    <div
                      className="h-3 rounded-full bg-cyan-500 transition-all duration-200"
                      style={{
                        width:
                          `${determinateProgress}%`,
                      }}
                    />
                  ) : (
                    <div className="h-3 w-full animate-pulse rounded-full bg-cyan-500/70" />
                  )}
                </div>

                <p className="mt-4 text-sm text-slate-300">
                  {progressUpdate
                    ?.message ||
                    "Starting the OCR process."}
                </p>

                <p className="mt-2 text-xs text-slate-500">
                  {determinateProgress !==
                  null
                    ? "This percentage is based on measurable work."
                    : "This stage does not provide an exact percentage, so Draflio shows activity without inventing one."}
                </p>
              </div>

              <p className="mt-3 text-center text-sm text-slate-400">
                Smart OCR can take several
                minutes for large or
                image-heavy documents.
              </p>
            </>
          )}
        </div>
      )}

      {result &&
  file && (
    <div
      ref={
        resultSectionRef
      }
      className="mt-10 scroll-mt-8 overflow-hidden rounded-3xl border border-green-500/30 bg-gradient-to-br from-green-950 via-slate-900 to-slate-950 shadow-2xl"
    >
            <div className="border-b border-green-500/20 p-8">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-9 w-9 text-green-400" />

                <h2 className="text-3xl font-bold text-green-400">
                  Searchable PDF Created
                </h2>
              </div>

              <p className="mt-3 text-slate-300">
                OCR processing has been
                completed successfully.
              </p>
            </div>

            <div className="grid gap-4 p-8 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-800/60 p-5">
                <p className="text-sm text-slate-400">
                  PDF Pages
                </p>

                <p className="mt-2 text-2xl font-bold text-white">
                  {result.pageCount >
                  0
                    ? result.pageCount
                    : "Ready"}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-800/60 p-5">
                <p className="text-sm text-slate-400">
                  Output Size
                </p>

                <p className="mt-2 text-2xl font-bold text-white">
                  {formatBytes(
                    result.size
                  )}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-800/60 p-5">
                <p className="text-sm text-slate-400">
                  OCR recognition language
                </p>

                <p className="mt-2 text-2xl font-bold text-white">
                  {
                    result
                      .ocrLanguage
                      .label
                  }
                </p>
              </div>
            </div>

            <div className="mx-8 mb-8 flex items-start gap-3 rounded-2xl border border-cyan-500/20 bg-cyan-950/30 p-4 text-cyan-200">
              <FileSearch className="mt-0.5 h-5 w-5 shrink-0" />

              <p>
                Open the downloaded PDF and
                test searching, selecting,
                or copying text from the
                scanned pages.
              </p>
            </div>

            <div className="flex flex-wrap gap-4 border-t border-green-500/20 p-8">
<div className="flex flex-wrap gap-4 border-t border-green-500/20 p-8">
  <button
    type="button"
    onClick={
      downloadSearchablePdf
    }
    className="flex items-center gap-2 rounded-2xl bg-green-600 px-8 py-4 font-bold text-white transition hover:bg-green-500"
  >
    <Download className="h-5 w-5" />

    Download Searchable PDF
  </button>

  {result.wordBlob && (
    <button
      type="button"
      onClick={
        downloadWordDocument
      }
      className="flex items-center gap-2 rounded-2xl bg-blue-600 px-8 py-4 font-bold text-white transition hover:bg-blue-500"
    >
      <Download className="h-5 w-5" />

      Download Editable Word
    </button>
  )}

  <button
    type="button"
    onClick={
      resetWorkspace
    }
    className="rounded-2xl border border-slate-600 px-8 py-4 font-semibold text-white transition hover:bg-slate-800"
  >
    Process Another PDF
  </button>
</div>
            </div>
          </div>
        )}
    </div>
  );
}
