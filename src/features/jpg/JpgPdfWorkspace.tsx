import {
  useRef,
  useState,
} from "react";

import JSZip from "jszip";

import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Download,
  FileImage,
  FileText,
  Trash2,
} from "lucide-react";

import { UploadZone } from "@/components/draflio/UploadZone";

import { ProgressService } from "@/core/services/ProgressService";

import JpgPdfOptions from "./JpgPdfOptions";

import {
  jpgPdfService,
  type ConvertedJpgPage,
  type ImagesToPdfOptions,
  type JpgPdfMode,
  type PdfToJpgOptions,
} from "./JpgPdfService";

const defaultImagesToPdfOptions: ImagesToPdfOptions = {
  pageSize: "auto",
  orientation: "auto",
  fit: "contain",
  margin: 20,
};

const defaultPdfToJpgOptions: PdfToJpgOptions = {
  quality: 0.9,
  scale: 2,
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
  const arrayBuffer = new ArrayBuffer(
    bytes.byteLength
  );

  const view = new Uint8Array(
    arrayBuffer
  );

  view.set(bytes);

  return arrayBuffer;
}

function downloadBlob(
  blob: Blob,
  filename: string
) {
  const url = URL.createObjectURL(blob);

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

export default function JpgPdfWorkspace() {
  const [mode, setMode] =
    useState<JpgPdfMode>(
      "images-to-pdf"
    );

  const [imageFiles, setImageFiles] =
    useState<File[]>([]);

  const [pdfFile, setPdfFile] =
    useState<File | null>(null);

  const [
    imagesToPdfOptions,
    setImagesToPdfOptions,
  ] = useState<ImagesToPdfOptions>(
    defaultImagesToPdfOptions
  );

  const [
    pdfToJpgOptions,
    setPdfToJpgOptions,
  ] = useState<PdfToJpgOptions>(
    defaultPdfToJpgOptions
  );

  const [pdfResult, setPdfResult] =
    useState<Uint8Array | null>(
      null
    );

  const [jpgResults, setJpgResults] =
    useState<ConvertedJpgPage[]>(
      []
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
    setPdfResult(null);
    setJpgResults([]);
    setProgress(0);
    setError("");
  };

  const handleModeChange = (
    nextMode: JpgPdfMode
  ) => {
    progressService.current.stop();

    setMode(nextMode);
    setImageFiles([]);
    setPdfFile(null);
    setPdfResult(null);
    setJpgResults([]);
    setProgress(0);
    setError("");
    setLoading(false);
  };

  const handleFiles = (
    selectedFiles: File[]
  ) => {
    if (
      mode === "images-to-pdf"
    ) {
      const validImages =
        selectedFiles.filter(
          (file) => {
            const name =
              file.name.toLowerCase();

            return (
              file.type ===
                "image/jpeg" ||
              file.type ===
                "image/png" ||
              name.endsWith(".jpg") ||
              name.endsWith(".jpeg") ||
              name.endsWith(".png")
            );
          }
        );

      if (
        validImages.length === 0
      ) {
        setError(
          "Please upload JPG or PNG images."
        );

        return;
      }

      setImageFiles(
        (currentFiles) => [
          ...currentFiles,
          ...validImages,
        ]
      );

      clearResults();

      return;
    }

    const selectedFile =
      selectedFiles[0];

    if (!selectedFile) {
      return;
    }

    const isPdf =
      selectedFile.type ===
        "application/pdf" ||
      selectedFile.name
        .toLowerCase()
        .endsWith(".pdf");

    if (!isPdf) {
      setError(
        "Please upload a PDF file."
      );

      return;
    }

    setPdfFile(selectedFile);
    clearResults();
  };

  const removeImage = (
    index: number
  ) => {
    setImageFiles(
      (currentFiles) =>
        currentFiles.filter(
          (_, fileIndex) =>
            fileIndex !== index
        )
    );

    clearResults();
  };

  const moveImage = (
    index: number,
    direction: "up" | "down"
  ) => {
    setImageFiles(
      (currentFiles) => {
        const nextFiles = [
          ...currentFiles,
        ];

        const destination =
          direction === "up"
            ? index - 1
            : index + 1;

        if (
          destination < 0 ||
          destination >=
            nextFiles.length
        ) {
          return currentFiles;
        }

        [
          nextFiles[index],
          nextFiles[destination],
        ] = [
          nextFiles[destination],
          nextFiles[index],
        ];

        return nextFiles;
      }
    );

    clearResults();
  };

  const handleConvert =
    async () => {
      if (loading) {
        return;
      }

      if (
        mode === "images-to-pdf" &&
        imageFiles.length === 0
      ) {
        setError(
          "Upload at least one JPG or PNG image."
        );

        return;
      }

      if (
        mode === "pdf-to-jpg" &&
        !pdfFile
      ) {
        setError(
          "Upload a PDF file."
        );

        return;
      }

      try {
        setLoading(true);
        setPdfResult(null);
        setJpgResults([]);
        setError("");

        progressService.current.start(
          setProgress
        );

        if (
          mode === "images-to-pdf"
        ) {
          const result =
            await jpgPdfService.imagesToPdf(
              imageFiles,
              imagesToPdfOptions
            );

          setPdfResult(result);
        } else if (pdfFile) {
          const result =
            await jpgPdfService.pdfToJpg(
              pdfFile,
              pdfToJpgOptions
            );

          setJpgResults(result);
        }

        progressService.current.finish(
          setProgress
        );
      } catch (conversionError) {
        console.error(
          "JPG/PDF conversion failed:",
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

  const downloadPdfResult = () => {
    if (!pdfResult) {
      return;
    }

    const blob = new Blob(
      [
        bytesToArrayBuffer(
          pdfResult
        ),
      ],
      {
        type: "application/pdf",
      }
    );

    downloadBlob(
      blob,
      "draflio-images.pdf"
    );
  };

  const downloadJpgPage = (
    page: ConvertedJpgPage
  ) => {
    const blob = new Blob(
      [
        bytesToArrayBuffer(
          page.bytes
        ),
      ],
      {
        type: "image/jpeg",
      }
    );

    downloadBlob(
      blob,
      page.filename
    );
  };

  const downloadAllJpgs =
    async () => {
      if (
        jpgResults.length === 0
      ) {
        return;
      }

      const zip = new JSZip();

      for (
        const page of jpgResults
      ) {
        zip.file(
          page.filename,
          bytesToArrayBuffer(
            page.bytes
          )
        );
      }

      const blob =
        await zip.generateAsync({
          type: "blob",
        });

      const originalName =
        pdfFile?.name.replace(
          /\.pdf$/i,
          ""
        ) ?? "converted-pages";

      downloadBlob(
        blob,
        `${originalName}-jpg-pages.zip`
      );
    };

  const resetWorkspace = () => {
    progressService.current.stop();

    setImageFiles([]);
    setPdfFile(null);
    setPdfResult(null);
    setJpgResults([]);
    setProgress(0);
    setError("");
    setLoading(false);
  };

  return (
    <div className="mx-auto max-w-6xl p-8">
      <div className="mb-8">
        <div className="mb-4 flex items-center gap-3">
          <FileImage className="h-10 w-10 text-blue-500" />

          <h1 className="text-4xl font-bold">
            JPG ↔ PDF
          </h1>
        </div>

        <p className="text-slate-400">
          Convert JPG and PNG images to PDF,
          or convert PDF pages into JPG images.
        </p>
      </div>

      <JpgPdfOptions
        mode={mode}
        imagesToPdfOptions={
          imagesToPdfOptions
        }
        pdfToJpgOptions={
          pdfToJpgOptions
        }
        onModeChange={
          handleModeChange
        }
        onImagesToPdfOptionsChange={(
          options
        ) => {
          setImagesToPdfOptions(
            options
          );

          clearResults();
        }}
        onPdfToJpgOptionsChange={(
          options
        ) => {
          setPdfToJpgOptions(
            options
          );

          clearResults();
        }}
      />

      <div className="mt-8">
        <UploadZone
          variant="workspace"
          multiple={
            mode ===
            "images-to-pdf"
          }
          accept={
            mode ===
            "images-to-pdf"
              ? "image/jpeg,image/png,.jpg,.jpeg,.png"
              : ".pdf,application/pdf"
          }
          maxSizeMB={500}
          onFiles={handleFiles}
        />
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-950/40 p-4 text-red-300">
          {error}
        </div>
      )}

      {mode ===
        "images-to-pdf" &&
        imageFiles.length > 0 && (
          <div className="mt-8 rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">
                  Selected Images
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  Images will become PDF
                  pages in this order.
                </p>
              </div>

              <button
                type="button"
                onClick={resetWorkspace}
                disabled={loading}
                className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                Remove All
              </button>
            </div>

            <div className="space-y-3">
              {imageFiles.map(
                (file, index) => (
                  <div
                    key={`${file.name}-${file.lastModified}-${index}`}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-slate-800/70 p-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <FileImage className="h-6 w-6 shrink-0 text-blue-400" />

                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">
                          {index + 1}.{" "}
                          {file.name}
                        </p>

                        <p className="text-sm text-slate-400">
                          {formatBytes(
                            file.size
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          moveImage(
                            index,
                            "up"
                          )
                        }
                        disabled={
                          index === 0 ||
                          loading
                        }
                        className="rounded-lg border border-slate-600 p-2 text-white transition hover:bg-slate-700 disabled:opacity-30"
                        aria-label="Move image up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          moveImage(
                            index,
                            "down"
                          )
                        }
                        disabled={
                          index ===
                            imageFiles.length -
                              1 ||
                          loading
                        }
                        className="rounded-lg border border-slate-600 p-2 text-white transition hover:bg-slate-700 disabled:opacity-30"
                        aria-label="Move image down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          removeImage(
                            index
                          )
                        }
                        disabled={loading}
                        className="rounded-lg border border-red-500/30 p-2 text-red-400 transition hover:bg-red-950/40 disabled:opacity-30"
                        aria-label="Remove image"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        )}

      {mode ===
        "pdf-to-jpg" &&
        pdfFile && (
          <div className="mt-8 rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-xl font-bold text-white">
              Uploaded PDF
            </h2>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="h-7 w-7 shrink-0 text-blue-400" />

                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">
                    {pdfFile.name}
                  </p>

                  <p className="text-sm text-slate-400">
                    {formatBytes(
                      pdfFile.size
                    )}
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

      {(
        imageFiles.length > 0 ||
        pdfFile
      ) && (
        <div className="mt-8">
          <button
            type="button"
            onClick={handleConvert}
            disabled={loading}
            className="w-full rounded-2xl bg-blue-600 px-8 py-4 font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? `Converting... ${progress}%`
              : mode ===
                  "images-to-pdf"
                ? "Convert Images to PDF"
                : "Convert PDF to JPG"}
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

      {pdfResult && (
        <div className="mt-10 overflow-hidden rounded-3xl border border-green-500/30 bg-gradient-to-br from-green-950 via-slate-900 to-slate-950 shadow-2xl">
          <div className="border-b border-green-500/20 p-8">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-9 w-9 text-green-400" />

              <h2 className="text-3xl font-bold text-green-400">
                PDF Created
              </h2>
            </div>

            <p className="mt-3 text-slate-300">
              Your images were converted into
              one PDF document.
            </p>
          </div>

          <div className="grid gap-4 p-8 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-800/60 p-5">
              <p className="text-sm text-slate-400">
                PDF Pages
              </p>

              <p className="mt-2 text-2xl font-bold text-white">
                {imageFiles.length}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-800/60 p-5">
              <p className="text-sm text-slate-400">
                PDF Size
              </p>

              <p className="mt-2 text-2xl font-bold text-white">
                {formatBytes(
                  pdfResult.byteLength
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 border-t border-green-500/20 p-8">
            <button
              type="button"
              onClick={
                downloadPdfResult
              }
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
              Convert More Images
            </button>
          </div>
        </div>
      )}

      {jpgResults.length > 0 && (
        <div className="mt-10 overflow-hidden rounded-3xl border border-green-500/30 bg-gradient-to-br from-green-950 via-slate-900 to-slate-950 shadow-2xl">
          <div className="border-b border-green-500/20 p-8">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-9 w-9 text-green-400" />

              <h2 className="text-3xl font-bold text-green-400">
                JPG Conversion Complete
              </h2>
            </div>

            <p className="mt-3 text-slate-300">
              Generated {jpgResults.length} JPG
              image(s).
            </p>
          </div>

          <div className="grid gap-4 p-8">
            {jpgResults.map(
              (page) => (
                <div
                  key={
                    page.pageNumber
                  }
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-slate-800/60 p-5"
                >
                  <div>
                    <p className="font-semibold text-white">
                      Page{" "}
                      {page.pageNumber}
                    </p>

                    <p className="mt-1 text-sm text-slate-400">
                      {page.width} ×{" "}
                      {page.height} px ·{" "}
                      {formatBytes(
                        page.bytes
                          .byteLength
                      )}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      downloadJpgPage(
                        page
                      )
                    }
                    className="flex items-center gap-2 rounded-xl bg-green-600 px-5 py-3 font-semibold text-white transition hover:bg-green-500"
                  >
                    <Download className="h-4 w-4" />
                    Download JPG
                  </button>
                </div>
              )
            )}
          </div>

          <div className="flex flex-wrap gap-4 border-t border-green-500/20 p-8">
            <button
              type="button"
              onClick={
                downloadAllJpgs
              }
              className="flex items-center gap-2 rounded-2xl bg-blue-600 px-8 py-4 font-bold text-white transition hover:bg-blue-700"
            >
              <Download className="h-5 w-5" />
              Download All ZIP
            </button>

            <button
              type="button"
              onClick={resetWorkspace}
              className="rounded-2xl border border-slate-600 px-8 py-4 font-semibold text-white transition hover:bg-slate-800"
            >
              Convert Another PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}