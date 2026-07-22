import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  XCircle,
} from "lucide-react";

import {
  UploadZone,
} from "@/components/draflio/UploadZone";

import {
  ProgressService,
} from "@/core/services/ProgressService";

import {
  useAbortableTask,
} from "@/hooks/useAbortableTask";

import {
  getApiErrorMessage,
} from "@/lib/apiError";

import {
  downloadFile,
  downloadPdf as downloadPdfFile,
} from "@/lib/downloadFile";

import ExcelPdfOptions from "./ExcelPdfOptions";

import {
  excelPdfService,
  type ExcelPdfMode,
  type ExcelProgressUpdate,
  type ExcelToPdfResult,
  type PdfToExcelResult,
} from "./ExcelPdfService";

const excelStageLabels: Record<
  ExcelProgressUpdate["stage"],
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

export default function ExcelPdfWorkspace() {
  const resultSectionRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const mountedRef =
    useRef(true);

  const conversionContextRef =
    useRef(0);

  const [mode, setMode] =
    useState<ExcelPdfMode>(
      "excel-to-pdf"
    );

  const [file, setFile] =
    useState<File | null>(
      null
    );

  const [
    excelToPdfResult,
    setExcelToPdfResult,
  ] =
    useState<ExcelToPdfResult | null>(
      null
    );

  const [
    pdfToExcelResult,
    setPdfToExcelResult,
  ] =
    useState<PdfToExcelResult | null>(
      null
    );

  const [progress, setProgress] =
    useState(0);

  const [
    conversionProgressUpdate,
    setConversionProgressUpdate,
  ] =
    useState<ExcelProgressUpdate | null>(
      null
    );

  const [error, setError] =
    useState("");

  const progressService =
    useRef(
      new ProgressService()
    );

  const {
    run: runConversion,
    cancel: cancelConversion,
    isRunning: loading,
  } = useAbortableTask<
    | ExcelToPdfResult
    | PdfToExcelResult
  >();

  useEffect(
    () => {
      mountedRef.current = true;

      return () => {
        mountedRef.current = false;
        conversionContextRef.current += 1;
        progressService.current.stop();
      };
    }, []
  );

  const clearResults = () => {
    setExcelToPdfResult(
      null
    );

    setPdfToExcelResult(
      null
    );

    setProgress(0);
    setConversionProgressUpdate(
      null
    );
    setError("");
  };

  useEffect(
    () => {
      if (!excelToPdfResult) {
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
        window.clearTimeout(
          timeout
        );
      };
    }, [excelToPdfResult]
  );

  const handleModeChange = (
    nextMode: ExcelPdfMode
  ) => {
    conversionContextRef.current += 1;
    progressService.current.stop();
    cancelConversion();

    setMode(nextMode);
    setFile(null);

    setExcelToPdfResult(
      null
    );

    setPdfToExcelResult(
      null
    );

    setProgress(0);
    setConversionProgressUpdate(
      null
    );
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

    if (
      mode ===
      "excel-to-pdf"
    ) {
      const mimeType =
        selectedFile.type
          .trim()
          .toLowerCase();

      const isXlsx =
        filename.endsWith(
          ".xlsx"
        ) &&
        (
          !mimeType ||
          mimeType ===
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
          mimeType ===
            "application/octet-stream"
        );

      if (!isXlsx) {
        setError(
          "Please upload an XLSX file."
        );

        return;
      }
    } else {
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
    }

    conversionContextRef.current += 1;
    progressService.current.stop();
    cancelConversion();

    setFile(
      selectedFile
    );

    clearResults();
  };

  const handleConvert =
    async () => {
      if (!file || loading) {
        return;
      }

      const runToken =
        conversionContextRef.current + 1;

      conversionContextRef.current =
        runToken;

      const publishProgress = (
        update: ExcelProgressUpdate
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

      try {
        setError("");

        setExcelToPdfResult(
          null
        );

        setPdfToExcelResult(
          null
        );

        setConversionProgressUpdate(
          null
        );

        const result =
          await runConversion(
            async (signal) => {
              if (
                mode ===
                "excel-to-pdf"
              ) {
                return excelPdfService.excelToPdf(
                  file,
                  {
                    signal,
                    onProgress:
                      publishProgress,
                  }
                );
              }

              progressService.current.start(
                (value) => {
                  if (
                    mountedRef.current &&
                    conversionContextRef.current ===
                      runToken
                  ) {
                    setProgress(value);
                  }
                }
              );

              const pdfToExcelResult =
                await excelPdfService.pdfToExcel(
                  file,
                  {
                    signal,
                  }
                );

              progressService.current.finish(
                (value) => {
                  if (
                    mountedRef.current &&
                    conversionContextRef.current ===
                      runToken
                  ) {
                    setProgress(value);
                  }
                }
              );

              return pdfToExcelResult;
            }
          );

        if (
          !result ||
          !mountedRef.current ||
          conversionContextRef.current !==
            runToken
        ) {
          return;
        }

        if (
          "outputFilename" in
          result
        ) {
          setExcelToPdfResult(
            result
          );
        } else {
          setPdfToExcelResult(
            result
          );
        }
      } catch (
        conversionError
      ) {
        if (
          conversionError instanceof
            Error &&
          conversionError.name ===
            "AbortError"
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
          "Excel/PDF conversion failed:",
          conversionError
        );

        const errorMessage =
          getApiErrorMessage(
            conversionError,
            "The conversion could not be completed."
          );

        if (
          mode ===
          "excel-to-pdf"
        ) {
          setConversionProgressUpdate({
            stage: "failed",
            message: errorMessage,
            progress: {
              mode: "determinate",
              value: 0,
            },
          });
        }

        setError(errorMessage);
      } finally {
        progressService.current.stop();
      }
    };

  const downloadPdf = () => {
    if (
      !excelToPdfResult ||
      !file
    ) {
      return;
    }

    downloadPdfFile(
      excelToPdfResult.blob,
      excelToPdfResult.outputFilename
    );
  };

  const downloadExcel =
    () => {
      if (
        !pdfToExcelResult ||
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
      pdfToExcelResult.blob,
      {
        filename:
          `${originalName}.xlsx`,

        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }
    );
    };

  const resetWorkspace =
    () => {
      conversionContextRef.current += 1;
      progressService.current.stop();
      cancelConversion();

      setFile(null);

      setExcelToPdfResult(
        null
      );

      setPdfToExcelResult(
        null
      );

      setProgress(0);
      setConversionProgressUpdate(
        null
      );
      setError("");
    };

  const handleCancelConversion =
    () => {
      progressService.current.stop();
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
          <FileSpreadsheet className="h-10 w-10 text-green-500" />

          <h1 className="text-4xl font-bold">
            Excel ↔ PDF
          </h1>
        </div>

        <p className="text-slate-400">
          Convert XLSX workbooks into
          PDF documents or transform PDF
          tables into editable Excel
          spreadsheets.
        </p>
      </div>

      <ExcelPdfOptions
        mode={mode}
        onModeChange={
          handleModeChange
        }
      />

      <div className="mt-8">
        <UploadZone
          variant="workspace"
          multiple={false}
          accept={
            mode ===
            "excel-to-pdf"
              ? ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              : ".pdf,application/pdf"
          }
          maxSizeMB={100}
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
        <div className="mt-8 rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <h2 className="text-xl font-bold text-white">
            Uploaded File
          </h2>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              {mode ===
              "excel-to-pdf" ? (
                <FileSpreadsheet className="h-7 w-7 shrink-0 text-green-400" />
              ) : (
                <FileText className="h-7 w-7 shrink-0 text-blue-400" />
              )}

              <div className="min-w-0">
                <p className="truncate font-semibold text-white">
                  {file.name}
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
            className="w-full rounded-2xl bg-green-600 px-8 py-4 font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? mode ===
                  "excel-to-pdf"
                ? conversionProgressUpdate
                  ? `${excelStageLabels[conversionProgressUpdate.stage]}${
                      determinateProgress !==
                      null
                        ? `... ${determinateProgress}%`
                        : "..."
                    }`
                  : "Starting conversion..."
                : `Converting... ${progress}%`
              : mode ===
                  "excel-to-pdf"
                ? "Convert Excel to PDF"
                : "Convert PDF to Excel"}
          </button>

          {loading &&
            mode ===
              "pdf-to-excel" && (
            <div className="mt-4 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-3 rounded-full bg-green-600 transition-all duration-200"
                style={{
                  width: `${progress}%`,
                }}
              />
            </div>
          )}

          {conversionProgressUpdate &&
            mode ===
              "excel-to-pdf" &&
            (
              loading ||
              conversionProgressUpdate.stage ===
                "cancelled"
            ) && (
            <div className="mt-4 rounded-2xl border border-green-500/20 bg-slate-900 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-400">
                    Current stage
                  </p>

                  <p className="mt-1 font-bold text-green-300">
                    {
                      excelStageLabels[
                        conversionProgressUpdate.stage
                      ]
                    }
                  </p>
                </div>

                <div className="rounded-full border border-green-500/30 bg-green-950/40 px-3 py-1 text-sm font-semibold text-green-300">
                  {determinateProgress !==
                  null
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
                {determinateProgress !==
                null ? (
                  <div
                    className="h-3 rounded-full bg-green-500 transition-all duration-200"
                    style={{
                      width:
                        `${determinateProgress}%`,
                    }}
                  />
                ) : (
                  <div className="h-3 w-full animate-pulse rounded-full bg-green-500/70" />
                )}
              </div>

              <p className="mt-4 text-sm text-slate-300">
                {
                  conversionProgressUpdate.message
                }
              </p>

              <p className="mt-2 text-xs text-slate-500">
                {determinateProgress !==
                null
                  ? "This percentage is based on measurable result-download bytes."
                  : "This stage does not provide an exact percentage, so Draflio shows activity without inventing one."}
              </p>

              {loading && (
                <button
                  type="button"
                  onClick={
                    handleCancelConversion
                  }
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

      {excelToPdfResult &&
        file && (
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
                Your Excel workbook was
                converted into a PDF
                document.
              </p>
            </div>

            <div className="grid gap-4 p-8 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-800/60 p-5">
                <p className="text-sm text-slate-400">
                  PDF Pages
                </p>

                <p className="mt-2 text-2xl font-bold text-white">
                  {excelToPdfResult.pageCount >
                  0
                    ? excelToPdfResult.pageCount
                    : "Ready"}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-800/60 p-5">
                <p className="text-sm text-slate-400">
                  PDF Size
                </p>

                <p className="mt-2 text-2xl font-bold text-white">
                  {formatBytes(
                    excelToPdfResult.size
                  )}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-800/60 p-5">
                <p className="text-sm text-slate-400">
                  Source Size
                </p>

                <p className="mt-2 text-2xl font-bold text-white">
                  {formatBytes(
                    file.size
                  )}
                </p>
              </div>
            </div>

            <div className="mx-8 mb-8 rounded-2xl border border-green-500/20 bg-green-950/30 p-4 text-green-200">
              The workbook has been
              converted using its existing
              worksheet layout and print
              settings.
            </div>

            <div className="flex flex-wrap gap-4 border-t border-green-500/20 p-8">
              <button
                type="button"
                onClick={
                  downloadPdf
                }
                className="flex items-center gap-2 rounded-2xl bg-green-600 px-8 py-4 font-bold text-white transition hover:bg-green-500"
              >
                <Download className="h-5 w-5" />

                Download PDF
              </button>

              <button
                type="button"
                onClick={
                  resetWorkspace
                }
                className="rounded-2xl border border-slate-600 px-8 py-4 font-semibold text-white transition hover:bg-slate-800"
              >
                Convert Another File
              </button>
            </div>
          </div>
        )}

      {pdfToExcelResult &&
        file && (
          <div className="mt-10 overflow-hidden rounded-3xl border border-green-500/30 bg-gradient-to-br from-green-950 via-slate-900 to-slate-950 shadow-2xl">
            <div className="border-b border-green-500/20 p-8">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-9 w-9 text-green-400" />

                <h2 className="text-3xl font-bold text-green-400">
                  Excel Workbook Created
                </h2>
              </div>

              <p className="mt-3 text-slate-300">
                Your PDF was converted
                into an editable XLSX
                workbook.
              </p>
            </div>

            <div className="grid gap-4 p-8 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-800/60 p-5">
                <p className="text-sm text-slate-400">
                  Output Format
                </p>

                <p className="mt-2 text-2xl font-bold text-white">
                  XLSX
                </p>
              </div>

              <div className="rounded-2xl bg-slate-800/60 p-5">
                <p className="text-sm text-slate-400">
                  Excel Size
                </p>

                <p className="mt-2 text-2xl font-bold text-white">
                  {formatBytes(
                    pdfToExcelResult.size
                  )}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-800/60 p-5">
                <p className="text-sm text-slate-400">
                  Source PDF
                </p>

                <p className="mt-2 text-2xl font-bold text-white">
                  {formatBytes(
                    file.size
                  )}
                </p>
              </div>
            </div>

            <div className="mx-8 mb-8 rounded-2xl border border-blue-500/20 bg-blue-950/30 p-4 text-blue-200">
              PDFs with clearly defined
              tables and selectable text
              generally produce the best
              spreadsheet results.
            </div>

            <div className="flex flex-wrap gap-4 border-t border-green-500/20 p-8">
              <button
                type="button"
                onClick={
                  downloadExcel
                }
                className="flex items-center gap-2 rounded-2xl bg-green-600 px-8 py-4 font-bold text-white transition hover:bg-green-500"
              >
                <Download className="h-5 w-5" />

                Download Excel Workbook
              </button>

              <button
                type="button"
                onClick={
                  resetWorkspace
                }
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
