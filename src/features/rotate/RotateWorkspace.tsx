import {
  useRef,
  useState,
} from "react";

import { UploadZone } from "@/components/draflio/UploadZone";

import type { PdfDocument } from "@/core/models/PdfDocument";

import { ProgressService } from "@/core/services/ProgressService";

import RotateOptions from "./RotateOptions";

import {
  rotateService,
  type RotationAngle,
  type RotationScope,
} from "./RotateService";

function formatBytes(bytes: number) {
  const kilobytes = bytes / 1024;

  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(
      1
    )} KB`;
  }

  return `${(
    kilobytes / 1024
  ).toFixed(2)} MB`;
}

export default function RotateWorkspace() {
  const [file, setFile] =
    useState<PdfDocument | null>(
      null
    );

  const [angle, setAngle] =
    useState<RotationAngle>(90);

  const [scope, setScope] =
    useState<RotationScope>({
      type: "all",
    });

  const [result, setResult] =
    useState<Uint8Array | null>(
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

  const handleFiles = (
    selectedFiles: File[]
  ) => {
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

    setFile({
      id:
        crypto.randomUUID?.() ??
        `${Date.now()}-${Math.random()}`,
      file: selectedFile,
      name: selectedFile.name,
      size: selectedFile.size,
      rotation: 0,
    });

    setResult(null);
    setProgress(0);
    setError("");
  };

  const handleRotate =
    async () => {
      if (!file || loading) {
        return;
      }

      if (
        scope.type ===
          "selected" &&
        scope.pages.length === 0
      ) {
        setError(
          "Enter at least one page number."
        );

        return;
      }

      try {
        setLoading(true);
        setResult(null);
        setError("");

        progressService.current.start(
          setProgress
        );

        const rotatedBytes =
          await rotateService.rotate(
            file.file,
            angle,
            scope
          );

        progressService.current.finish(
          setProgress
        );

        setResult(rotatedBytes);
      } catch (rotationError) {
        console.error(
          "Rotation failed:",
          rotationError
        );

        setError(
          "The PDF could not be rotated. It may be encrypted or damaged."
        );
      } finally {
        progressService.current.stop();
        setLoading(false);
      }
    };

  const downloadRotatedPdf =
    () => {
      if (!result || !file) {
        return;
      }

      const arrayBuffer =
        new ArrayBuffer(
          result.byteLength
        );

      const view =
        new Uint8Array(
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
        document.createElement(
          "a"
        );

      const originalName =
        file.name.replace(
          /\.pdf$/i,
          ""
        );

      link.href = url;
      link.download =
        `${originalName}-rotated.pdf`;

      document.body.appendChild(
        link
      );

      link.click();
      link.remove();

      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
    };

  const resetWorkspace =
    () => {
      progressService.current.stop();

      setFile(null);
      setResult(null);
      setProgress(0);
      setError("");
      setAngle(90);
      setScope({
        type: "all",
      });
      setLoading(false);
    };

  return (
    <div className="mx-auto max-w-6xl p-8">
      <h1 className="mb-3 text-4xl font-bold">
        Rotate PDF
      </h1>

      <p className="mb-8 text-slate-400">
        Rotate every page or only
        selected pages in your PDF.
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
                  {formatBytes(
                    file.size
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={
                  resetWorkspace
                }
                disabled={loading}
                className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </div>

          <RotateOptions
            angle={angle}
            scope={scope}
            onAngleChange={(
              nextAngle
            ) => {
              setAngle(nextAngle);
              setResult(null);
              setProgress(0);
              setError("");
            }}
            onScopeChange={(
              nextScope
            ) => {
              setScope(nextScope);
              setResult(null);
              setProgress(0);
              setError("");
            }}
          />

          <div className="mt-8">
            <button
              type="button"
              onClick={
                handleRotate
              }
              disabled={loading}
              className="w-full rounded-2xl bg-blue-600 px-8 py-4 font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? `Rotating... ${progress}%`
                : "Rotate PDF"}
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
              Rotation Complete
            </h2>

            <p className="mt-3 text-slate-300">
              Your rotated PDF is
              ready to download.
            </p>
          </div>

          <div className="grid gap-4 p-8 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-800/60 p-5">
              <p className="text-sm text-slate-400">
                Rotation
              </p>

              <p className="mt-2 text-2xl font-bold text-white">
                {angle}°
              </p>
            </div>

            <div className="rounded-2xl bg-slate-800/60 p-5">
              <p className="text-sm text-slate-400">
                Pages
              </p>

              <p className="mt-2 text-2xl font-bold text-white">
                {scope.type === "all"
                  ? "All pages"
                  : scope.pages.join(
                      ", "
                    )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 border-t border-green-500/20 p-8">
            <button
              type="button"
              onClick={
                downloadRotatedPdf
              }
              className="rounded-2xl bg-green-600 px-8 py-4 font-bold text-white transition hover:bg-green-500"
            >
              Download Rotated PDF
            </button>

            <button
              type="button"
              onClick={
                resetWorkspace
              }
              className="rounded-2xl border border-slate-600 px-8 py-4 font-semibold text-white transition hover:bg-slate-800"
            >
              Rotate Another PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}