import {
  useRef,
  useState,
} from "react";

import {
  CheckCircle2,
  Download,
  FileText,
  Presentation,
} from "lucide-react";

import {
  UploadZone,
} from "@/components/draflio/UploadZone";

import {
  ProgressService,
} from "@/core/services/ProgressService";

import PowerPointPdfOptions from "./PowerPointPdfOptions";

import {
  powerPointPdfService,
  type PdfToPowerPointResult,
  type PowerPointPdfMode,
  type PowerPointToPdfResult,
} from "./PowerPointPdfService";

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

function downloadBlob(
  blob: Blob,
  filename: string
) {
  const url =
    URL.createObjectURL(
      blob
    );

  const link =
    document.createElement(
      "a"
    );

  link.href = url;
  link.download = filename;

  document.body.appendChild(
    link
  );

  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(
      url
    );
  }, 1000);
}

export default function PowerPointPdfWorkspace() {
  const [mode, setMode] =
    useState<PowerPointPdfMode>(
      "powerpoint-to-pdf"
    );

  const [file, setFile] =
    useState<File | null>(
      null
    );

  const [
    powerPointToPdfResult,
    setPowerPointToPdfResult,
  ] =
    useState<PowerPointToPdfResult | null>(
      null
    );

  const [
    pdfToPowerPointResult,
    setPdfToPowerPointResult,
  ] =
    useState<PdfToPowerPointResult | null>(
      null
    );

  const [loading, setLoading] =
    useState(false);

  const [progress, setProgress] =
    useState(0);

  const [error, setError] =
    useState("");

  const progressService =
    useRef(
      new ProgressService()
    );

  const clearResults = () => {
    setPowerPointToPdfResult(
      null
    );

    setPdfToPowerPointResult(
      null
    );

    setProgress(0);
    setError("");
  };

  const handleModeChange = (
    nextMode: PowerPointPdfMode
  ) => {
    progressService.current.stop();

    setMode(nextMode);
    setFile(null);

    setPowerPointToPdfResult(
      null
    );

    setPdfToPowerPointResult(
      null
    );

    setProgress(0);
    setError("");
    setLoading(false);
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
      "powerpoint-to-pdf"
    ) {
      const isPptx =
        selectedFile.type ===
          "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
        filename.endsWith(
          ".pptx"
        );

      if (!isPptx) {
        setError(
          "Please upload a PPTX file."
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

      try {
        setLoading(true);
        setError("");

        setPowerPointToPdfResult(
          null
        );

        setPdfToPowerPointResult(
          null
        );

        progressService.current.start(
          setProgress
        );

        if (
          mode ===
          "powerpoint-to-pdf"
        ) {
          const result =
            await powerPointPdfService.powerPointToPdf(
              file
            );

          setPowerPointToPdfResult(
            result
          );
        } else {
          const result =
            await powerPointPdfService.pdfToPowerPoint(
              file
            );

          setPdfToPowerPointResult(
            result
          );
        }

        progressService.current.finish(
          setProgress
        );
      } catch (
        conversionError
      ) {
        console.error(
          "PowerPoint/PDF conversion failed:",
          conversionError
        );

        setError(
          conversionError instanceof
            Error
            ? conversionError.message
            : "The conversion could not be completed."
        );
      } finally {
        progressService.current.stop();
        setLoading(false);
      }
    };

  const downloadPdf = () => {
    if (
      !powerPointToPdfResult ||
      !file
    ) {
      return;
    }

    const originalName =
      file.name.replace(
        /\.pptx$/i,
        ""
      );

    downloadBlob(
      powerPointToPdfResult.blob,
      `${originalName}.pdf`
    );
  };

  const downloadPowerPoint =
    () => {
      if (
        !pdfToPowerPointResult ||
        !file
      ) {
        return;
      }

      const originalName =
        file.name.replace(
          /\.pdf$/i,
          ""
        );

      downloadBlob(
        pdfToPowerPointResult.blob,
        `${originalName}.pptx`
      );
    };

  const resetWorkspace =
    () => {
      progressService.current.stop();

      setFile(null);

      setPowerPointToPdfResult(
        null
      );

      setPdfToPowerPointResult(
        null
      );

      setProgress(0);
      setError("");
      setLoading(false);
    };

  return (
    <div className="mx-auto max-w-6xl p-8">
      <div className="mb-8">
        <div className="mb-4 flex items-center gap-3">
          <Presentation className="h-10 w-10 text-orange-500" />

          <h1 className="text-4xl font-bold">
            PowerPoint ↔ PDF
          </h1>
        </div>

        <p className="text-slate-400">
          Convert PPTX presentations into
          PDF documents or transform PDF
          pages into editable PowerPoint
          slides.
        </p>
      </div>

      <PowerPointPdfOptions
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
            "powerpoint-to-pdf"
              ? ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
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
              "powerpoint-to-pdf" ? (
                <Presentation className="h-7 w-7 shrink-0 text-orange-400" />
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
            className="w-full rounded-2xl bg-orange-600 px-8 py-4 font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? `Converting... ${progress}%`
              : mode ===
                  "powerpoint-to-pdf"
                ? "Convert PowerPoint to PDF"
                : "Convert PDF to PowerPoint"}
          </button>

          {loading && (
            <div className="mt-4 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-3 rounded-full bg-orange-600 transition-all duration-200"
                style={{
                  width: `${progress}%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      {powerPointToPdfResult &&
        file && (
          <div className="mt-10 overflow-hidden rounded-3xl border border-green-500/30 bg-gradient-to-br from-green-950 via-slate-900 to-slate-950 shadow-2xl">
            <div className="border-b border-green-500/20 p-8">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-9 w-9 text-green-400" />

                <h2 className="text-3xl font-bold text-green-400">
                  PDF Created
                </h2>
              </div>

              <p className="mt-3 text-slate-300">
                Your PowerPoint
                presentation was converted
                into a PDF document.
              </p>
            </div>

            <div className="grid gap-4 p-8 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-800/60 p-5">
                <p className="text-sm text-slate-400">
                  PDF Pages
                </p>

                <p className="mt-2 text-2xl font-bold text-white">
                  {powerPointToPdfResult.pageCount >
                  0
                    ? powerPointToPdfResult.pageCount
                    : "Ready"}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-800/60 p-5">
                <p className="text-sm text-slate-400">
                  PDF Size
                </p>

                <p className="mt-2 text-2xl font-bold text-white">
                  {formatBytes(
                    powerPointToPdfResult.size
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

            <div className="mx-8 mb-8 rounded-2xl border border-orange-500/20 bg-orange-950/30 p-4 text-orange-200">
              Each PowerPoint slide has
              been converted into a PDF
              page.
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

      {pdfToPowerPointResult &&
        file && (
          <div className="mt-10 overflow-hidden rounded-3xl border border-green-500/30 bg-gradient-to-br from-green-950 via-slate-900 to-slate-950 shadow-2xl">
            <div className="border-b border-green-500/20 p-8">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-9 w-9 text-green-400" />

                <h2 className="text-3xl font-bold text-green-400">
                  PowerPoint Created
                </h2>
              </div>

              <p className="mt-3 text-slate-300">
                Your PDF was converted
                into an editable PPTX
                presentation.
              </p>
            </div>

            <div className="grid gap-4 p-8 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-800/60 p-5">
                <p className="text-sm text-slate-400">
                  Output Format
                </p>

                <p className="mt-2 text-2xl font-bold text-white">
                  PPTX
                </p>
              </div>

              <div className="rounded-2xl bg-slate-800/60 p-5">
                <p className="text-sm text-slate-400">
                  Presentation Size
                </p>

                <p className="mt-2 text-2xl font-bold text-white">
                  {formatBytes(
                    pdfToPowerPointResult.size
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
              Complex PDF layouts,
              embedded fonts, and scanned
              pages may require manual
              adjustments after conversion.
            </div>

            <div className="flex flex-wrap gap-4 border-t border-green-500/20 p-8">
              <button
                type="button"
                onClick={
                  downloadPowerPoint
                }
                className="flex items-center gap-2 rounded-2xl bg-green-600 px-8 py-4 font-bold text-white transition hover:bg-green-500"
              >
                <Download className="h-5 w-5" />

                Download PowerPoint
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