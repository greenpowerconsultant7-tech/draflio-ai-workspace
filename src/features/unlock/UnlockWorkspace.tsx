import {
  useRef,
  useState,
} from "react";

import {
  CheckCircle2,
  UnlockKeyhole,
} from "lucide-react";

import { UploadZone } from "@/components/draflio/UploadZone";

import type { PdfDocument } from "@/core/models/PdfDocument";

import { ProgressService } from "@/core/services/ProgressService";

import UnlockOptions from "./UnlockOptions";

import { unlockService } from "./UnlockService";

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

export default function UnlockWorkspace() {
  const [file, setFile] =
    useState<PdfDocument | null>(null);

  const [password, setPassword] =
    useState("");

  const [
    showPassword,
    setShowPassword,
  ] = useState(false);

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

    setPassword("");
    setResult(null);
    setProgress(0);
    setError("");
  };

  const handleUnlock = async () => {
    if (!file || loading) {
      return;
    }

    if (!password) {
      setError(
        "Enter the PDF password."
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

      const unlockedBytes =
        await unlockService.unlock(
          file.file,
          password
        );

      progressService.current.finish(
        setProgress
      );

      setResult(unlockedBytes);
    } catch (unlockError) {
      console.error(
        "PDF unlock failed:",
        unlockError
      );

      setError(
        "The PDF could not be unlocked. Check that the password is correct and that the file is encrypted."
      );
    } finally {
      progressService.current.stop();
      setLoading(false);
    }
  };

  const downloadUnlockedPdf = () => {
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
      `${originalName}-unlocked.pdf`;

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
    setPassword("");
    setShowPassword(false);
    setResult(null);
    setProgress(0);
    setError("");
    setLoading(false);
  };

  return (
    <div className="mx-auto max-w-6xl p-8">
      <div className="mb-8">
        <div className="mb-4 flex items-center gap-3">
          <UnlockKeyhole className="h-10 w-10 text-blue-500" />

          <h1 className="text-4xl font-bold">
            Unlock PDF
          </h1>
        </div>

        <p className="text-slate-400">
          Remove password protection from
          a PDF using its current password.
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

          <UnlockOptions
            password={password}
            showPassword={showPassword}
            onPasswordChange={(
              nextPassword
            ) => {
              setPassword(nextPassword);
              setResult(null);
              setProgress(0);
              setError("");
            }}
            onShowPasswordChange={
              setShowPassword
            }
          />

          <div className="mt-8">
            <button
              type="button"
              onClick={handleUnlock}
              disabled={loading}
              className="w-full rounded-2xl bg-blue-600 px-8 py-4 font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? `Unlocking PDF... ${progress}%`
                : "Unlock PDF"}
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
                PDF Unlocked
              </h2>
            </div>

            <p className="mt-3 text-slate-300">
              Your unlocked PDF is ready
              to download.
            </p>
          </div>

          <div className="grid gap-4 p-8 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-800/60 p-5">
              <p className="text-sm text-slate-400">
                Original file
              </p>

              <p className="mt-2 break-all font-bold text-white">
                {file.name}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-800/60 p-5">
              <p className="text-sm text-slate-400">
                Unlocked size
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
                downloadUnlockedPdf
              }
              className="rounded-2xl bg-green-600 px-8 py-4 font-bold text-white transition hover:bg-green-500"
            >
              Download Unlocked PDF
            </button>

            <button
              type="button"
              onClick={resetWorkspace}
              className="rounded-2xl border border-slate-600 px-8 py-4 font-semibold text-white transition hover:bg-slate-800"
            >
              Unlock Another PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}