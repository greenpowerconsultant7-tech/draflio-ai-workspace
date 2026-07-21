import {
  useRef,
  useState,
} from "react";

import { UploadZone } from "@/components/draflio/UploadZone";

import type { PdfDocument } from "@/core/models/PdfDocument";

import { ProgressService } from "@/core/services/ProgressService";

import CompressOptions from "./CompressOptions";

import {
  compressService,
  type CompressionLevel,
} from "./CompressService";

function formatBytes(bytes: number) {
  if (bytes === 0) {
    return "0 KB";
  }

  const kilobytes = bytes / 1024;

  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(1)} KB`;
  }

  return `${(kilobytes / 1024).toFixed(2)} MB`;
}

export default function CompressWorkspace() {
  const [file, setFile] =
    useState<PdfDocument | null>(null);

  const [level, setLevel] =
    useState<CompressionLevel>("recommended");

  const [result, setResult] =
    useState<Uint8Array | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [progress, setProgress] =
    useState(0);

  const [error, setError] =
    useState("");

  const progressService = useRef(
    new ProgressService()
  );

  const handleFiles = (
    selectedFiles: File[]
  ) => {
    const selectedFile = selectedFiles[0];

    if (!selectedFile) {
      return;
    }

    if (
      selectedFile.type !==
        "application/pdf" &&
      !selectedFile.name
        .toLowerCase()
        .endsWith(".pdf")
    ) {
      setError("Please upload a PDF file.");
      return;
    }

    const document: PdfDocument = {
      id:
        crypto.randomUUID?.() ??
        `${Date.now()}-${Math.random()}`,
      file: selectedFile,
      name: selectedFile.name,
      size: selectedFile.size,
      rotation: 0,
    };

    setFile(document);
    setResult(null);
    setProgress(0);
    setError("");
  };

  const handleCompress = async () => {
    if (!file || loading) {
      return;
    }

    try {
      setLoading(true);
      setResult(null);
      setError("");

      progressService.current.start(
        setProgress
      );

      const compressedBytes =
        await compressService.compress(
          file.file,
          level
        );

      progressService.current.finish(
        setProgress
      );

      setResult(compressedBytes);
    } catch (compressionError) {
      console.error(
        "Compression failed:",
        compressionError
      );

      setError(
        "The PDF could not be compressed. It may be encrypted or damaged."
      );
    } finally {
      progressService.current.stop();
      setLoading(false);
    }
  };

  const downloadCompressedPdf = () => {
    if (!result || !file) {
      return;
    }

    /*
      Allocate a fresh ArrayBuffer to avoid the
      TypeScript 5.9 BlobPart error.
    */

    const arrayBuffer = new ArrayBuffer(
      result.byteLength
    );

    const view = new Uint8Array(
      arrayBuffer
    );

    view.set(result);

    const blob = new Blob(
      [arrayBuffer],
      {
        type: "application/pdf",
      }
    );

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    const originalName =
      file.name.replace(
        /\.pdf$/i,
        ""
      );

    link.href = url;
    link.download =
      `${originalName}-compressed.pdf`;

    document.body.appendChild(link);

    link.click();
    link.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  };

  const resetWorkspace = () => {
    progressService.current.stop();

    setFile(null);
    setResult(null);
    setProgress(0);
    setError("");
    setLevel("recommended");
    setLoading(false);
  };

  const originalSize =
    file?.size ?? 0;

  const compressedSize =
    result?.byteLength ?? 0;

  const bytesSaved = Math.max(
    0,
    originalSize - compressedSize
  );

  const reductionPercent =
    originalSize > 0
      ? (bytesSaved / originalSize) * 100
      : 0;

  return (
    <div className="mx-auto max-w-6xl p-8">
      <h1 className="mb-3 text-4xl font-bold">
        Compress PDF
      </h1>

      <p className="mb-8 text-slate-400">
        Optimize your PDF and reduce its file
        size.
      </p>

      <UploadZone
        variant="workspace"
        multiple={false}
        accept=".pdf"
        maxSizeMB={500}
        onFiles={handleFiles}
      />

      {error && (
        <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-950/40 p-4 text-red-300">
          {error}
        </div>
      )}

      {file && (
        <>
          <div className="mt-8 rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-xl font-bold text-white">
              Uploaded PDF
            </h2>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-white">
                  {file.name}
                </p>

                <p className="mt-1 text-sm text-slate-400">
                  {formatBytes(file.size)}
                </p>
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

          <CompressOptions
            level={level}
            onChange={(nextLevel) => {
              setLevel(nextLevel);
              setResult(null);
              setProgress(0);
              setError("");
            }}
          />

          <div className="mt-8">
            <button
              type="button"
              onClick={handleCompress}
              disabled={loading}
              className="w-full rounded-2xl bg-blue-600 px-8 py-4 font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? `Compressing... ${progress}%`
                : "Compress PDF"}
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
        </>
      )}

      {result && file && (
        <div className="mt-10 overflow-hidden rounded-3xl border border-green-500/30 bg-gradient-to-br from-green-950 via-slate-900 to-slate-950 shadow-2xl">
          <div className="border-b border-green-500/20 p-8">
            <h2 className="text-3xl font-bold text-green-400">
              Compression Complete
            </h2>

            <p className="mt-3 text-slate-300">
              Your optimized PDF is ready to
              download.
            </p>
          </div>

          <div className="grid gap-4 p-8 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-800/60 p-5">
              <p className="text-sm text-slate-400">
                Original size
              </p>

              <p className="mt-2 text-2xl font-bold text-white">
                {formatBytes(originalSize)}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-800/60 p-5">
              <p className="text-sm text-slate-400">
                Compressed size
              </p>

              <p className="mt-2 text-2xl font-bold text-white">
                {formatBytes(compressedSize)}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-800/60 p-5">
              <p className="text-sm text-slate-400">
                Size reduction
              </p>

              <p className="mt-2 text-2xl font-bold text-green-400">
                {reductionPercent.toFixed(1)}%
              </p>
            </div>
          </div>

          {reductionPercent === 0 && (
            <div className="mx-8 mb-6 rounded-2xl border border-amber-500/30 bg-amber-950/30 p-4 text-amber-200">
              This PDF was already optimized, so
              its size could not be reduced
              further without lowering image
              quality.
            </div>
          )}

          <div className="flex flex-wrap gap-4 border-t border-green-500/20 p-8">
            <button
              type="button"
              onClick={downloadCompressedPdf}
              className="rounded-2xl bg-green-600 px-8 py-4 font-bold text-white transition hover:bg-green-500"
            >
              Download Compressed PDF
            </button>

            <button
              type="button"
              onClick={resetWorkspace}
              className="rounded-2xl border border-slate-600 px-8 py-4 font-semibold text-white transition hover:bg-slate-800"
            >
              Compress Another PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}