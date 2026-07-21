import {
  useRef,
  useState,
} from "react";

import {
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";

import { UploadZone } from "@/components/draflio/UploadZone";

import type { PdfDocument } from "@/core/models/PdfDocument";

import { ProgressService } from "@/core/services/ProgressService";

import ProtectOptions from "./ProtectOptions";

import {
  protectService,
} from "./ProtectService";

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

export default function ProtectWorkspace() {
  const [file, setFile] =
    useState<PdfDocument | null>(
      null
    );

  const [password, setPassword] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  const [
    showPassword,
    setShowPassword,
  ] = useState(false);

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

  const handleProtect =
    async () => {
      if (!file || loading) {
        return;
      }

      if (password.length < 8) {
        setError(
          "Password must contain at least 8 characters."
        );

        return;
      }

      if (
        password !==
        confirmPassword
      ) {
        setError(
          "The passwords do not match."
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

        const protectedBytes =
          await protectService.protect(
            file.file,
            password
          );

        progressService.current.finish(
          setProgress
        );

        setResult(
          protectedBytes
        );
      } catch (protectError) {
        console.error(
          "PDF protection failed:",
          protectError
        );

        setError(
          "The PDF could not be protected. Confirm that qpdf.wasm is inside public/wasm and that the source PDF is not already encrypted."
        );
      } finally {
        progressService.current.stop();
        setLoading(false);
      }
    };

  const downloadProtectedPdf =
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
        `${originalName}-protected.pdf`;

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
      setPassword("");
      setConfirmPassword("");
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
          <ShieldCheck className="h-10 w-10 text-blue-500" />

          <h1 className="text-4xl font-bold">
            Protect PDF
          </h1>
        </div>

        <p className="text-slate-400">
          Add password protection to
          your PDF using 256-bit
          encryption.
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

          <ProtectOptions
            password={password}
            confirmPassword={
              confirmPassword
            }
            showPassword={
              showPassword
            }
            onPasswordChange={(
              nextPassword
            ) => {
              setPassword(
                nextPassword
              );

              setResult(null);
              setProgress(0);
              setError("");
            }}
            onConfirmPasswordChange={(
              nextPassword
            ) => {
              setConfirmPassword(
                nextPassword
              );

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
              onClick={
                handleProtect
              }
              disabled={loading}
              className="w-full rounded-2xl bg-blue-600 px-8 py-4 font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? `Protecting PDF... ${progress}%`
                : "Protect PDF"}
            </button>

            {loading && (
              <>
                <div className="mt-4 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-3 rounded-full bg-blue-600 transition-all duration-200"
                    style={{
                      width:
                        `${progress}%`,
                    }}
                  />
                </div>

                <p className="mt-3 text-center text-sm text-slate-400">
                  The first run may
                  take longer while
                  the encryption engine
                  loads.
                </p>
              </>
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
                PDF Protected
              </h2>
            </div>

            <p className="mt-3 text-slate-300">
              Your encrypted PDF is
              ready to download.
            </p>
          </div>

          <div className="grid gap-4 p-8 sm:grid-cols-3">
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
                Encryption
              </p>

              <p className="mt-2 text-xl font-bold text-white">
                256-bit
              </p>
            </div>

            <div className="rounded-2xl bg-slate-800/60 p-5">
              <p className="text-sm text-slate-400">
                Protected size
              </p>

              <p className="mt-2 text-xl font-bold text-white">
                {formatBytes(
                  result.byteLength
                )}
              </p>
            </div>
          </div>

          <div className="mx-8 mb-8 rounded-2xl border border-amber-500/30 bg-amber-950/30 p-4 text-amber-200">
            Remember your password.
            Draflio cannot recover it
            after the file is downloaded.
          </div>

          <div className="flex flex-wrap gap-4 border-t border-green-500/20 p-8">
            <button
              type="button"
              onClick={
                downloadProtectedPdf
              }
              className="rounded-2xl bg-green-600 px-8 py-4 font-bold text-white transition hover:bg-green-500"
            >
              Download Protected PDF
            </button>

            <button
              type="button"
              onClick={
                resetWorkspace
              }
              className="rounded-2xl border border-slate-600 px-8 py-4 font-semibold text-white transition hover:bg-slate-800"
            >
              Protect Another PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}