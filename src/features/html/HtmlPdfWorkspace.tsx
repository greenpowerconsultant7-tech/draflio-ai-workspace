import {
  useState,
} from "react";

import {
  CheckCircle2,
  Download,
  FileCode2,
  FileText,
  Loader2,
  RotateCcw,
  XCircle,
} from "lucide-react";

import {
  useAbortableTask,
} from "@/hooks/useAbortableTask";

import {
  getApiErrorMessage,
} from "@/lib/apiError";

import {
  downloadPdf,
} from "@/lib/downloadFile";

import HtmlPdfForm from "./HtmlPdfForm";

import {
  htmlPdfService,
  type HtmlPdfFormData,
  type HtmlPdfResult,
} from "./HtmlPdfService";

function createDefaultData():
  HtmlPdfFormData {
  return {
    filename:
      "draflio-document",

    html: `
<main>
  <h1>Hello Draflio</h1>

  <p>
    Enter your HTML and CSS to create
    a professional PDF.
  </p>
</main>
    `.trim(),

    css: `
body {
  padding: 20px;
  color: #0f172a;
  font-family: Arial, sans-serif;
}

h1 {
  color: #2563eb;
}
    `.trim(),

    format:
      "A4",

    orientation:
      "portrait",

    margin: {
      top: "20mm",
      right: "15mm",
      bottom: "20mm",
      left: "15mm",
    },

    printBackground:
      true,

    displayHeaderFooter:
      false,

    preferCssPageSize:
      false,

    headerHtml:
      "",

    footerHtml:
      `
<div
  style="
    width: 100%;
    text-align: center;
  "
>
  Page
  <span class="pageNumber"></span>
  of
  <span class="totalPages"></span>
</div>
      `.trim(),

    scale:
      1,
  };
}

function formatBytes(
  bytes: number
) {
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
    error instanceof DOMException &&
    error.name === "AbortError"
  );
}

export default function HtmlPdfWorkspace() {
  const [
    formData,
    setFormData,
  ] = useState<HtmlPdfFormData>(
    createDefaultData
  );

  const [
    result,
    setResult,
  ] = useState<HtmlPdfResult | null>(
    null
  );

  const [
    error,
    setError,
  ] = useState("");

  const {
    run,
    cancel,
    isRunning: loading,
  } = useAbortableTask<HtmlPdfResult>();

  const handleFormChange = (
    nextData: HtmlPdfFormData
  ) => {
    setFormData(nextData);
    setResult(null);
    setError("");
  };

  const handleGenerate =
    async () => {
      if (loading) {
        return;
      }

      try {
        setResult(null);
        setError("");

        const generatedResult =
          await run(
            (signal) =>
              htmlPdfService.generate(
                formData,
                {
                  signal,
                }
              )
          );

        if (!generatedResult) {
          return;
        }

        setResult(
          generatedResult
        );
      } catch (generationError) {
        if (
          isAbortError(
            generationError
          )
        ) {
          return;
        }

        console.error(
          "HTML-to-PDF generation failed:",
          generationError
        );

        setError(
          getApiErrorMessage(
            generationError,
            "The HTML could not be converted to PDF."
          )
        );
      }
    };

  const handleCancel =
    () => {
      cancel();

      setError(
        "PDF generation was cancelled."
      );
    };

  const handleDownload =
    () => {
      if (!result) {
        return;
      }

      downloadPdf(
        result.blob,
        result.filename
      );
    };

  const resetWorkspace =
    () => {
      cancel();

      setFormData(
        createDefaultData()
      );

      setResult(null);
      setError("");
    };

  return (
    <div className="mx-auto max-w-7xl p-8">
      <div className="mb-8">
        <div className="mb-4 flex items-center gap-3">
          <FileCode2 className="h-10 w-10 text-blue-500" />

          <h1 className="text-4xl font-bold">
            HTML to PDF
          </h1>
        </div>

        <p className="max-w-3xl text-slate-400">
          Convert raw HTML and CSS into a
          professional PDF with selectable
          text, page breaks, backgrounds,
          headers, and footers.
        </p>
      </div>

      <div className="rounded-2xl border border-blue-500/20 bg-blue-950/30 p-5 text-blue-200">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-6 w-6 shrink-0" />

          <div>
            <p className="font-semibold">
              Chromium-powered PDF rendering
            </p>

            <p className="mt-1 text-sm text-blue-200/80">
              The generated document contains
              real, searchable and selectable
              text instead of page screenshots.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-950/40 p-4 text-red-300">
          {error}
        </div>
      )}

      <HtmlPdfForm
        data={formData}
        onChange={
          handleFormChange
        }
        disabled={loading}
      />

      <div className="mt-8">
        <button
          type="button"
          onClick={
            handleGenerate
          }
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 px-8 py-4 font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />

              Rendering PDF...
            </>
          ) : (
            <>
              <FileCode2 className="h-5 w-5" />

              Generate PDF
            </>
          )}
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

              Cancel Generation
            </button>

            <p className="mt-3 text-center text-sm text-slate-400">
              Chromium is rendering your HTML.
              The first request may take slightly
              longer while the browser starts.
            </p>
          </>
        )}
      </div>

      {result && (
        <div className="mt-10 overflow-hidden rounded-3xl border border-green-500/30 bg-gradient-to-br from-green-950 via-slate-900 to-slate-950 shadow-2xl">
          <div className="border-b border-green-500/20 p-8">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-9 w-9 text-green-400" />

              <h2 className="text-3xl font-bold text-green-400">
                PDF Created
              </h2>
            </div>

            <p className="mt-3 text-slate-300">
              Your HTML document was rendered
              successfully.
            </p>
          </div>

          <div className="grid gap-4 p-8 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-800/60 p-5">
              <p className="text-sm text-slate-400">
                Filename
              </p>

              <p className="mt-2 break-all text-lg font-bold text-white">
                {result.filename}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-800/60 p-5">
              <p className="text-sm text-slate-400">
                Page Format
              </p>

              <p className="mt-2 text-xl font-bold text-white">
                {formData.format}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-800/60 p-5">
              <p className="text-sm text-slate-400">
                PDF Size
              </p>

              <p className="mt-2 text-xl font-bold text-white">
                {formatBytes(
                  result.size
                )}
              </p>
            </div>
          </div>

          <div className="mx-8 mb-8 rounded-2xl border border-blue-500/20 bg-blue-950/30 p-4 text-blue-200">
            The generated PDF supports
            selecting, searching, copying,
            printing, and highlighting text.
          </div>

          <div className="flex flex-wrap gap-4 border-t border-green-500/20 p-8">
            <button
              type="button"
              onClick={
                handleDownload
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
              className="flex items-center gap-2 rounded-2xl border border-slate-600 px-8 py-4 font-semibold text-white transition hover:bg-slate-800"
            >
              <RotateCcw className="h-5 w-5" />

              Create Another PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}