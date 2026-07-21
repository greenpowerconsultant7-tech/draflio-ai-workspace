import {
  useRef,
  useState,
} from "react";

import {
  CheckCircle2,
  Download,
  FileText,
  FileType2,
} from "lucide-react";

import { UploadZone } from "@/components/draflio/UploadZone";

import { ProgressService } from "@/core/services/ProgressService";

import WordPdfOptions from "./WordPdfOptions";

import {
  wordPdfService,
  type PdfToWordOptions,
  type PdfToWordResult,
  type WordPdfMode,
  type WordToPdfOptions,
  type WordToPdfResult,
} from "./WordPdfService";

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

function bytesToArrayBuffer(
  bytes: Uint8Array
): ArrayBuffer {
  const buffer = new ArrayBuffer(
    bytes.byteLength
  );

  const view = new Uint8Array(buffer);

  view.set(bytes);

  return buffer;
}

function downloadBlob(
  blob: Blob,
  filename: string
) {
  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);

  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

export default function WordPdfWorkspace() {
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

  const [loading, setLoading] =
    useState(false);

  const [progress, setProgress] =
    useState(0);

  const [error, setError] =
    useState("");

  const progressService = useRef(
    new ProgressService()
  );

  const clearResults = () => {
    setWordToPdfResult(null);
    setPdfToWordResult(null);
    setProgress(0);
    setError("");
  };

  const handleModeChange = (
    nextMode: WordPdfMode
  ) => {
    progressService.current.stop();

    setMode(nextMode);
    setFile(null);
    setWordToPdfResult(null);
    setPdfToWordResult(null);
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

    try {
      setLoading(true);
      setWordToPdfResult(null);
      setPdfToWordResult(null);
      setError("");

      progressService.current.start(
        setProgress
      );

      if (mode === "word-to-pdf") {
        const result =
          await wordPdfService.wordToPdf(
            file,
            wordToPdfOptions
          );

        setWordToPdfResult(result);
      } else {
        const result =
          await wordPdfService.pdfToWord(
            file,
            pdfToWordOptions
          );

        setPdfToWordResult(result);
      }

      progressService.current.finish(
        setProgress
      );
    } catch (conversionError) {
      console.error(
        "Word/PDF conversion failed:",
        conversionError
      );

      setError(
        conversionError instanceof Error
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
      !wordToPdfResult ||
      !file
    ) {
      return;
    }

    const blob = new Blob(
      [
        bytesToArrayBuffer(
          wordToPdfResult.bytes
        ),
      ],
      {
        type: "application/pdf",
      }
    );

    const originalName =
      file.name.replace(
        /\.docx$/i,
        ""
      );

    downloadBlob(
      blob,
      `${originalName}.pdf`
    );
  };

  const downloadWord = () => {
    if (
      !pdfToWordResult ||
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
      pdfToWordResult.blob,
      `${originalName}.docx`
    );
  };

  const resetWorkspace = () => {
    progressService.current.stop();

    setFile(null);
    setWordToPdfResult(null);
    setPdfToWordResult(null);
    setProgress(0);
    setError("");
    setLoading(false);
  };

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
              ? `Converting... ${progress}%`
              : mode === "word-to-pdf"
                ? "Convert Word to PDF"
                : "Convert PDF to Word"}
          </button>

          {loading && (
            <div className="mt-4 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-3 rounded-full bg-blue-600 transition-all duration-200"
                style={{
                  width: `${progress}%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      {wordToPdfResult && file && (
        <div className="mt-10 overflow-hidden rounded-3xl border border-green-500/30 bg-gradient-to-br from-green-950 via-slate-900 to-slate-950 shadow-2xl">
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
              onClick={downloadPdf}
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
        <div className="mt-10 overflow-hidden rounded-3xl border border-green-500/30 bg-gradient-to-br from-green-950 via-slate-900 to-slate-950 shadow-2xl">
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