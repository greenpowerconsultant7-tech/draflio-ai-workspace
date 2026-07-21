import {
  useRef,
  useState,
} from "react";

import {
  CheckCircle2,
  PenLine,
} from "lucide-react";

import { UploadZone } from "@/components/draflio/UploadZone";

import type { PdfDocument } from "@/core/models/PdfDocument";

import { ProgressService } from "@/core/services/ProgressService";

import SignOptions from "./SignOptions";

import {
  signService,
  type SignatureSettings,
} from "./SignService";

function createDefaultSettings(): SignatureSettings {
  return {
    mode: "type",
    typedText: "",
    drawnDataUrl: null,
    uploadedImage: null,
    fontSize: 38,
    color: "#111827",
    opacity: 1,
    widthPercent: 30,
    position: "bottom-right",
    scope: {
      type: "first",
    },
  };
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
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

export default function SignWorkspace() {
  const [file, setFile] =
    useState<PdfDocument | null>(null);

  const [settings, setSettings] =
    useState<SignatureSettings>(
      createDefaultSettings
    );

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

  const handleSign = async () => {
    if (!file || loading) {
      return;
    }

    if (
      settings.mode === "type" &&
      !settings.typedText.trim()
    ) {
      setError(
        "Type your signature name."
      );

      return;
    }

    if (
      settings.mode === "draw" &&
      !settings.drawnDataUrl
    ) {
      setError(
        "Draw your signature first."
      );

      return;
    }

    if (
      settings.mode === "upload" &&
      !settings.uploadedImage
    ) {
      setError(
        "Upload a signature image."
      );

      return;
    }

    if (
      settings.scope.type ===
        "selected" &&
      settings.scope.pages.length === 0
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

      const signedBytes =
        await signService.sign(
          file.file,
          settings
        );

      progressService.current.finish(
        setProgress
      );

      setResult(signedBytes);
    } catch (signError) {
      console.error(
        "PDF signing failed:",
        signError
      );

      setError(
        signError instanceof Error
          ? signError.message
          : "The signature could not be added."
      );
    } finally {
      progressService.current.stop();
      setLoading(false);
    }
  };

  const downloadSignedPdf = () => {
    if (!result || !file) {
      return;
    }

    const arrayBuffer =
      new ArrayBuffer(
        result.byteLength
      );

    const view =
      new Uint8Array(arrayBuffer);

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
      `${originalName}-signed.pdf`;

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
    setSettings(
      createDefaultSettings()
    );
    setResult(null);
    setProgress(0);
    setError("");
    setLoading(false);
  };

  return (
    <div className="mx-auto max-w-6xl p-8">
      <div className="mb-8">
        <div className="mb-4 flex items-center gap-3">
          <PenLine className="h-10 w-10 text-blue-500" />

          <h1 className="text-4xl font-bold">
            Sign PDF
          </h1>
        </div>

        <p className="text-slate-400">
          Type, draw, or upload a
          signature and place it on your
          PDF.
        </p>
      </div>

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

          <SignOptions
            settings={settings}
            onChange={(
              nextSettings
            ) => {
              setSettings(
                nextSettings
              );

              setResult(null);
              setProgress(0);
              setError("");
            }}
          />

          <div className="mt-8">
            <button
              type="button"
              onClick={handleSign}
              disabled={loading}
              className="w-full rounded-2xl bg-blue-600 px-8 py-4 font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? `Signing PDF... ${progress}%`
                : "Sign PDF"}
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
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-9 w-9 text-green-400" />

              <h2 className="text-3xl font-bold text-green-400">
                PDF Signed
              </h2>
            </div>

            <p className="mt-3 text-slate-300">
              Your signed PDF is ready
              to download.
            </p>
          </div>

          <div className="grid gap-4 p-8 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-800/60 p-5">
              <p className="text-sm text-slate-400">
                Signature Type
              </p>

              <p className="mt-2 text-xl font-bold capitalize text-white">
                {settings.mode}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-800/60 p-5">
              <p className="text-sm text-slate-400">
                Position
              </p>

              <p className="mt-2 text-xl font-bold capitalize text-white">
                {settings.position.replace(
                  "-",
                  " "
                )}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-800/60 p-5">
              <p className="text-sm text-slate-400">
                Signed File Size
              </p>

              <p className="mt-2 text-xl font-bold text-white">
                {formatBytes(
                  result.byteLength
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 border-t border-green-500/20 p-8">
            <button
              type="button"
              onClick={
                downloadSignedPdf
              }
              className="rounded-2xl bg-green-600 px-8 py-4 font-bold text-white transition hover:bg-green-500"
            >
              Download Signed PDF
            </button>

            <button
              type="button"
              onClick={resetWorkspace}
              className="rounded-2xl border border-slate-600 px-8 py-4 font-semibold text-white transition hover:bg-slate-800"
            >
              Sign Another PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}