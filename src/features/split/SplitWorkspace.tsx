import { useRef, useState } from "react";
import JSZip from "jszip";

import { UploadZone } from "@/components/draflio/UploadZone";
import type { PdfDocument } from "@/core/models/PdfDocument";
import { ProgressService } from "@/core/services/ProgressService";

import SplitOptions from "./SplitOptions";
import { splitService } from "./SplitService";
import type { SplitMode } from "./SplitService";

export default function SplitWorkspace() {
  const [files, setFiles] = useState<PdfDocument[]>([]);
  const [mode, setMode] = useState<SplitMode>({
    type: "every-page",
  });

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Uint8Array[]>([]);

  const progressService = useRef(new ProgressService());

  const handleFiles = (newFiles: File[]) => {
    const pdfFiles: PdfDocument[] = newFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      size: file.size,
      rotation: 0,
    }));

    setFiles(pdfFiles);
    setResult([]);
  };

  const handleSplit = async () => {
  console.log("1. Split clicked");

  console.log("Files:", files);

  console.log("Mode:", mode);

  if (files.length === 0) {
    console.log("No file selected");
    return;
  }

  try {
    setLoading(true);

    console.log("2. Starting service");

    const pdfs = await splitService.split(
      files[0].file,
      mode
    );

    console.log("3. Split result:", pdfs);

    setResult(pdfs);

  } catch (error) {
    console.error("Split failed:", error);
  } finally {
    setLoading(false);
  }
};

  const downloadPdf = (
    bytes: Uint8Array,
    filename: string
  ) => {
    
    const buffer = bytes.buffer.slice(
  bytes.byteOffset,
  bytes.byteOffset + bytes.byteLength
) as ArrayBuffer;

const blob = new Blob([buffer], {
  type: "application/pdf",
});

    const url = URL.createObjectURL(blob);
  
    const a = document.createElement("a");

    a.href = url;
    a.download = filename;

    a.click();

    URL.revokeObjectURL(url);
  };

  const downloadZip = async () => {
    if (result.length === 0) return;

    const zip = new JSZip();

    result.forEach((pdf, index) => {
      zip.file(
        `split-${index + 1}.pdf`,
        pdf
      );
    });

    const blob = await zip.generateAsync({
      type: "blob",
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;
    a.download = "split-files.zip";

    a.click();

    URL.revokeObjectURL(url);
  };
    return (
    <div className="mx-auto max-w-6xl p-8">

      <h1 className="mb-8 text-4xl font-bold">
        Split PDF
      </h1>

      <UploadZone
        variant="workspace"
        multiple={false}
        accept=".pdf"
        maxSizeMB={500}
        onFiles={handleFiles}
      />

      {files.length > 0 && (
        <>

          <div className="mt-8 rounded-2xl border border-slate-700 bg-slate-900 p-6">

            <h2 className="text-2xl font-bold text-white">
              Uploaded PDF
            </h2>

            <p className="mt-4 text-slate-300">
              {files[0].name}
            </p>

            <p className="text-slate-500">
              {(files[0].size / 1024 / 1024).toFixed(2)} MB
            </p>

          </div>

          <SplitOptions
            mode={mode}
            onChange={setMode}
          />

          <div className="mt-8">

            <button
              onClick={handleSplit}
              disabled={loading}
              className="w-full rounded-2xl bg-blue-600 px-8 py-4 font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >

              {loading
                ? `Splitting... ${progress}%`
                : "Split PDF"}

            </button>

          </div>

        </>
      )}

      {result.length > 0 && (

        <div className="mt-10 overflow-hidden rounded-3xl border border-green-500/30 bg-gradient-to-br from-green-950 via-slate-900 to-slate-950 shadow-2xl">

          <div className="border-b border-green-500/20 p-8">

            <h2 className="text-4xl font-bold text-green-400">
              🎉 Split Successful
            </h2>

            <p className="mt-3 text-slate-300">
              Generated {result.length} PDF file(s)
            </p>

          </div>

          <div className="grid gap-4 p-8">

            {result.map((pdf, index) => (

              <div
                key={index}
                className="flex items-center justify-between rounded-2xl bg-slate-800/60 p-5"
              >

                <div>

                  <p className="font-semibold text-white">
                    Part {index + 1}
                  </p>

                  <p className="text-sm text-slate-400">
                    PDF Document
                  </p>

                </div>

                <button
                  onClick={() =>
                    downloadPdf(
                      pdf,
                      `split-${index + 1}.pdf`
                    )
                  }
                  className="rounded-xl bg-green-600 px-5 py-3 font-semibold text-white transition hover:bg-green-500"
                >
                  Download
                </button>

              </div>

            ))}

          </div>

          <div className="flex flex-wrap gap-4 border-t border-green-500/20 p-8">

            <button
              onClick={downloadZip}
              className="rounded-2xl bg-blue-600 px-8 py-4 font-bold text-white transition hover:bg-blue-700"
            >
              Download All ZIP
            </button>

            <button
              onClick={() => {
                setFiles([]);
                setResult([]);
                setProgress(0);
              }}
              className="rounded-2xl border border-slate-600 px-8 py-4 font-semibold text-white transition hover:bg-slate-800"
            >
              Split Another PDF
            </button>

          </div>

        </div>

      )}

    </div>
  );
}