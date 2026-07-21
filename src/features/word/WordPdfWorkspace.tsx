import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  CheckCircle2,
  Download,
  FileText,
  FileType2,
  XCircle,
} from "lucide-react";

import { UploadZone } from "@/components/draflio/UploadZone";

import { useAbortableTask } from "@/hooks/useAbortableTask";

import { getApiErrorMessage } from "@/lib/apiError";

import {
  downloadDocx,
  downloadPdf as downloadPdfFile,
} from "@/lib/downloadFile";

import WordPdfOptions from "./WordPdfOptions";

import {
  wordPdfService,
  type PdfToWordOptions,
  type PdfToWordResult,
  type WordPdfMode,
  type WordProgressStage,
  type WordProgressUpdate,
  type WordToPdfOptions,
  type WordToPdfResult,
} from "./WordPdfService";

const wordStageLabels: Record<
  WordProgressStage,
  string
> = {
  uploading: "Uploading",
  queued: "Queued",
  validating: "Validating",
  authenticating: "Authenticating",
  "creating-asset": "Creating upload asset",
  submitting: "Submitting",
  processing: "Processing",
  downloading: "Downloading",
  preparing: "Preparing result",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const defaultWordToPdfOptions: WordToPdfOptions = {
  pageSize: "a4",
  orientation: "portrait",
  margin: 36,
  quality: 0.9,
};

const defaultPdfToWordOptions: PdfToWordOptions = {
  preservePageBreaks: true,
  includePageNumbers: false,
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(
    bytes /
    1024 /
    1024
  ).toFixed(2)} MB`;
}

export default function WordPdfWorkspace() {
  const resultSectionRef =
    useRef<HTMLDivElement | null>(
      null
    );
  const mountedRef =
    useRef(true);
  const conversionContextRef =
    useRef(0);
  const [mode, setMode] =
    useState<WordPdfMode>(
      "word-to-pdf"
    );

  const [file, setFile] =
    useState<File | null>(null);

  const [
    wordToPdfOptions,
    setWordToPdfOptions,
  ] = useState<WordToPdfOptions>(
    defaultWordToPdfOptions
  );

  const [
    pdfToWordOptions,
    setPdfToWordOptions,
  ] = useState<PdfToWordOptions>(
    defaultPdfToWordOptions
  );

  const [
    wordToPdfResult,
    setWordToPdfResult,
  ] = useState<WordToPdfResult | null>(
    null
  );

  const [
    pdfToWordResult,
    setPdfToWordResult,
  ] = useState<PdfToWordResult | null>(
    null
  );

  const [error, setError] =
    useState("");

  const [
    conversionProgressUpdate,
    setConversionProgressUpdate,
  ] = useState<WordProgressUpdate | null>(
    null
  );

  const {
    run: runConversion,
    cancel: cancelConversion,
    isRunning: loading,
  } = useAbortableTask<
    WordToPdfResult |
    PdfToWordResult
  >();

  useEffect(
    () => {
      mountedRef.current = true;

      return () => {
        mountedRef.current = false;
        conversionContextRef.current += 1;
      };
    },
    []
  );

  const clearResults = () => {
    setWordToPdfResult(null);
    setPdfToWordResult(null);
    setConversionProgressUpdate(null);
    setError("");
  };

  useEffect(
    () => {
      if (
        !wordToPdfResult &&
        !pdfToWordResult
      ) {
        return;
      }

      const timeout =
        window.setTimeout(
          () => {
            resultSectionRef.current
              ?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
          },
          150
        );

      return () => {
        window.clearTimeout(timeout);
      };
    },
    [wordToPdfResult, pdfToWordResult]
  );

  const handleModeChange = (
    nextMode: WordPdfMode
  ) => {
    conversionContextRef.current += 1;
    cancelConversion();

    setMode(nextMode);
    setFile(null);
    setWordToPdfResult(null);
    setPdfToWordResult(null);
    setConversionProgressUpdate(null);
    setError("");
  };

  const handleFiles = (
    selectedFiles: File[]
  ) => {
    const selectedFile =
      selectedFiles[0];

    if (!selectedFile) {
      return;
    }

    const filename =
      selectedFile.name.toLowerCase();

    if (mode === "word-to-pdf") {
      const isDocx =
        selectedFile.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        filename.endsWith(".docx");

      if (!isDocx) {
        setError(
          "Please upload a DOCX file."
        );

        return;
      }
    } else {
      const isPdf =
        selectedFile.type ===
          "application/pdf" ||
        filename.endsWith(".pdf");

      if (!isPdf) {
        setError(
          "Please upload a PDF file."
        );

        return;
      }
    }

    setFile(selectedFile);
    clearResults();
  };

  const handleConvert = async () => {
    if (!file || loading) {
      return;
    }

    const runToken =
      conversionContextRef.current + 1;

    conversionContextRef.current =
      runToken;

    const publishProgress = (
      update: WordProgressUpdate
    ) => {
      if (
        mountedRef.current &&
        conversionContextRef.current ===
          runToken
      ) {
        setConversionProgressUpdate(
          update
        );
      }
    };

    setWordToPdfResult(null);
    setPdfToWordResult(null);
    setConversionProgressUpdate(null);
    setError("");

    try {
      const result =
        await runConversion(
          (signal) =>
            mode === "word-to-pdf"
              ?
              wordPdfService.wordToPdf(
                file,
                {
                  signal,
                  onProgress: (
                    update
                  ) => {
                    publishProgress(update);
                  },
                }
              )
              :
              wordPdfService.pdfToWord(
                file,
                {
                  signal,
                  onProgress: (
                    update
                  ) => {
                    publishProgress(update);
                  },
                }
              )
        );

      if (
        result &&
        mountedRef.current &&
        conversionContextRef.current ===
          runToken
      ) {
        if ("bytes" in result) {
          setWordToPdfResult(result);
        } else {
          setPdfToWordResult(result);
        }
      }
    } catch (conversionError) {
      if (
        conversionError instanceof Error &&
        conversionError.name === "AbortError"
      ) {
        return;
      }

      if (
        !mountedRef.current ||
        conversionContextRef.current !==
          runToken
      ) {
        return;
      }

      console.error(
        "Word/PDF conversion failed:",
        conversionError
      );

      const errorMessage =
        getApiErrorMessage(
          conversionError,
          "The conversion could not be completed."
        );

      setConversionProgressUpdate({
        stage: "failed",
        message: errorMessage,
        progress: {
          mode: "determinate",
          value: 0,
        },
      });

      setError(errorMessage);
    }
  };

  const handleDownloadPdf = () => {
    if (
      !wordToPdfResult ||
      !file
    ) {
      return;
    }

    downloadPdfFile(
      wordToPdfResult.bytes,
      wordToPdfResult.outputFilename
    );
  };

  const downloadWord = () => {
    if (
      !pdfToWordResult ||
      !file
    ) {
      return;
    }

    downloadDocx(
      pdfToWordResult.blob,
      pdfToWordResult.outputFilename
    );
  };

  const resetWorkspace = () => {
    conversionContextRef.current += 1;
    cancelConversion();

    setFile(null);
    setWordToPdfResult(null);
    setPdfToWordResult(null);
    setConversionProgressUpdate(null);
    setError("");
  };

  const handleCancelConversion = () => {
    cancelConversion();
  };

  const determinateProgress =
    conversionProgressUpdate?.progress.mode ===
    "determinate"
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              conversionProgressUpdate.progress.value
            )
          )
        )
      : null;

  return (
    <div className="mx-auto max-w-6xl p-8">
      <div className="mb-8">
        <div className="mb-4 flex items-center gap-3">
          <FileType2 className="h-10 w-10 text-blue-500" />

          <h1 className="text-4xl font-bold">
            Word ↔ PDF
          </h1>
        </div>

        <p className="text-slate-400">
          Convert DOCX documents into PDF
          files or extract PDF text into an
          editable Word document.
        </p>
      </div>

      <WordPdfOptions
        mode={mode}
        wordToPdfOptions={
          wordToPdfOptions
        }
        pdfToWordOptions={
          pdfToWordOptions
        }
        onModeChange={
          handleModeChange
        }
        onWordToPdfOptionsChange={(
          options
        ) => {
          setWordToPdfOptions(
            options
          );

          clearResults();
        }}
        onPdfToWordOptionsChange={(
          options
        ) => {
          setPdfToWordOptions(
            options
          );

          clearResults();
        }}
      />

      <div className="mt-8">
        <UploadZone
          variant="workspace"
          multiple={false}
          accept={
            mode === "word-to-pdf"
              ? ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              : ".pdf,application/pdf"
          }
          maxSizeMB={100}
          onFiles={handleFiles}
        />
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-950/40 p-4 text-red-300">
          {error}
        </div>
      )}

      {file && (
        <div className="mt-8 rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <h2 className="text-xl font-bold text-white">
            Uploaded File
          </h2>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <FileText className="h-7 w-7 shrink-0 text-blue-400" />

              <div className="min-w-0">
                <p className="truncate font-semibold text-white">
                  {file.name}
                </p>

                <p className="mt-1 text-sm text-slate-400">
                  {formatBytes(file.size)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={resetWorkspace}
              disabled={loading}
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
            onClick={handleConvert}
            disabled={loading}
            className="w-full rounded-2xl bg-blue-600 px-8 py-4 font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? conversionProgressUpdate
                ? `${wordStageLabels[conversionProgressUpdate.stage]}${
                    determinateProgress !== null
                      ? `... ${determinateProgress}%`
                      : "..."
                  }`
                : "Starting conversion..."
              : mode === "word-to-pdf"
                ? "Convert Word to PDF"
                : "Convert PDF to Word"}
          </button>

          {conversionProgressUpdate &&
            (
              loading ||
              conversionProgressUpdate.stage ===
                "cancelled"
            ) && (
            <div className="mt-4 rounded-2xl border border-blue-500/20 bg-slate-900 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-400">
                    Current stage
                  </p>

                  <p className="mt-1 font-bold text-blue-300">
                    {
                      wordStageLabels[
                        conversionProgressUpdate.stage
                      ]
                    }
                  </p>
                </div>

                <div className="rounded-full border border-blue-500/30 bg-blue-950/40 px-3 py-1 text-sm font-semibold text-blue-300">
                  {determinateProgress !== null
                    ? `${determinateProgress}%`
                    : "In progress"}
                </div>
              </div>

              <div
                className="mt-4 overflow-hidden rounded-full bg-slate-800"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={
                  determinateProgress ??
                  undefined
                }
                aria-valuetext={
                  conversionProgressUpdate.message
                }
              >
                {determinateProgress !== null ? (
                  <div
                    className="h-3 rounded-full bg-blue-500 transition-all duration-200"
                    style={{
                      width:
                        `${determinateProgress}%`,
                    }}
                  />
                ) : (
                  <div className="h-3 w-full animate-pulse rounded-full bg-blue-500/70" />
                )}
              </div>

              <p className="mt-4 text-sm text-slate-300">
                {conversionProgressUpdate.message}
              </p>

              <p className="mt-2 text-xs text-slate-500">
                {determinateProgress !== null
                  ? "This percentage is based on measurable result-download bytes."
                  : "This stage does not provide an exact percentage, so Draflio shows activity without inventing one."}
              </p>

              {loading && (
                <button
                  type="button"
                  onClick={handleCancelConversion}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/40 px-4 py-3 font-semibold text-red-300 transition hover:bg-red-950/40"
                >
                  <XCircle className="h-5 w-5" />
                  Cancel conversion
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {wordToPdfResult && file && (
        <div
          ref={resultSectionRef}
          className="mt-10 scroll-mt-8 overflow-hidden rounded-3xl border border-green-500/30 bg-gradient-to-br from-green-950 via-slate-900 to-slate-950 shadow-2xl"
        >
          <div className="border-b border-green-500/20 p-8">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-9 w-9 text-green-400" />

              <h2 className="text-3xl font-bold text-green-400">
                PDF Created
              </h2>
            </div>

            <p className="mt-3 text-slate-300">
              Your Word document was converted
              into a PDF.
            </p>
          </div>

          <div className="grid gap-4 p-8 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-800/60 p-5">
              <p className="text-sm text-slate-400">
                PDF Pages
              </p>

              <p className="mt-2 text-2xl font-bold text-white">
                {
                  wordToPdfResult.pageCount
                }
              </p>
            </div>

            <div className="rounded-2xl bg-slate-800/60 p-5">
              <p className="text-sm text-slate-400">
                PDF Size
              </p>

              <p className="mt-2 text-2xl font-bold text-white">
                {formatBytes(
                  wordToPdfResult.bytes
                    .byteLength
                )}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-800/60 p-5">
              <p className="text-sm text-slate-400">
                Conversion Messages
              </p>

              <p className="mt-2 text-2xl font-bold text-white">
                {
                  wordToPdfResult.messages
                    .length
                }
              </p>
            </div>
          </div>

          {wordToPdfResult.messages.length >
            0 && (
            <div className="mx-8 mb-8 rounded-2xl border border-amber-500/30 bg-amber-950/30 p-5">
              <p className="font-semibold text-amber-200">
                Conversion notices
              </p>

              <div className="mt-3 space-y-2 text-sm text-amber-100">
                {wordToPdfResult.messages
                  .slice(0, 5)
                  .map(
                    (
                      message,
                      index
                    ) => (
                      <p
                        key={`${message}-${index}`}
                      >
                        {message}
                      </p>
                    )
                  )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-4 border-t border-green-500/20 p-8">
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="flex items-center gap-2 rounded-2xl bg-green-600 px-8 py-4 font-bold text-white transition hover:bg-green-500"
            >
              <Download className="h-5 w-5" />
              Download PDF
            </button>

            <button
              type="button"
              onClick={resetWorkspace}
              className="rounded-2xl border border-slate-600 px-8 py-4 font-semibold text-white transition hover:bg-slate-800"
            >
              Convert Another File
            </button>
          </div>
        </div>
      )}

      {pdfToWordResult && file && (
        <div
          ref={resultSectionRef}
          className="mt-10 scroll-mt-8 overflow-hidden rounded-3xl border border-green-500/30 bg-gradient-to-br from-green-950 via-slate-900 to-slate-950 shadow-2xl"
        >
          <div className="border-b border-green-500/20 p-8">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-9 w-9 text-green-400" />

              <h2 className="text-3xl font-bold text-green-400">
                Word Document Created
              </h2>
            </div>

            <p className="mt-3 text-slate-300">
              The PDF text was extracted into
              an editable DOCX file.
            </p>
          </div>

          <div className="grid gap-4 p-8 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-800/60 p-5">
              <p className="text-sm text-slate-400">
                PDF Pages
              </p>

              <p className="mt-2 text-2xl font-bold text-white">
                {
                  pdfToWordResult.pageCount
                }
              </p>
            </div>

            <div className="rounded-2xl bg-slate-800/60 p-5">
              <p className="text-sm text-slate-400">
                Paragraphs
              </p>

              <p className="mt-2 text-2xl font-bold text-white">
                {
                  pdfToWordResult.paragraphCount
                }
              </p>
            </div>

            <div className="rounded-2xl bg-slate-800/60 p-5">
              <p className="text-sm text-slate-400">
                Extracted Characters
              </p>

              <p className="mt-2 text-2xl font-bold text-white">
                {
                  pdfToWordResult.characterCount
                }
              </p>
            </div>
          </div>

          <div className="mx-8 mb-8 rounded-2xl border border-blue-500/20 bg-blue-950/30 p-4 text-blue-200">
            This conversion extracts editable
            text. It may not reproduce the exact
            original PDF layout.
          </div>

          <div className="flex flex-wrap gap-4 border-t border-green-500/20 p-8">
            <button
              type="button"
              onClick={downloadWord}
              className="flex items-center gap-2 rounded-2xl bg-green-600 px-8 py-4 font-bold text-white transition hover:bg-green-500"
            >
              <Download className="h-5 w-5" />
              Download Word Document
            </button>

            <button
              type="button"
              onClick={resetWorkspace}
              className="rounded-2xl border border-slate-600 px-8 py-4 font-semibold text-white transition hover:bg-slate-800"
            >
              Convert Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
