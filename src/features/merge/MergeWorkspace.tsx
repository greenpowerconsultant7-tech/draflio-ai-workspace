import { ProgressService } from "@/core/services/ProgressService";
import { useState, useRef } from "react";
import { Download, Loader2 } from "lucide-react";
import type { PdfDocument } from "@/core/models/PdfDocument";
import { UploadZone } from "@/components/draflio/UploadZone";
import MergeFileList from "./MergeFileList";
import { mergeService } from "@/services/pdf/MergeService";

export default function MergeWorkspace() {
  const [files, setFiles] = useState<PdfDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mergedBlob, setMergedBlob] = useState<Blob | null>(null);
  const progressService = useRef(new ProgressService());
const handleFiles = (newFiles: File[]) => {
  const pdfFiles: PdfDocument[] = newFiles.map((file) => ({
    id: crypto.randomUUID(),
    file,
    name: file.name,
    size: file.size,
    rotation: 0,
  }));

  setFiles((prev) => [...prev, ...pdfFiles]);

  setMergedBlob(null);
};

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setMergedBlob(null);
  };
  const handleReorder = (newOrder: PdfDocument[]) => {
  setFiles(newOrder);
  setMergedBlob(null);
};
  const handleMerge = async () => {
    if (files.length < 2) {
      alert("Please select at least two PDF files.");
      return;
    }

    try {
setLoading(true);
setProgress(0);

progressService.current.start(setProgress);

const mergedPdf = await mergeService.merge(
  files.map((pdf) => pdf.file)
);
progressService.current.finish(setProgress);

const arrayBuffer = new ArrayBuffer(mergedPdf.length);

const view = new Uint8Array(arrayBuffer);

view.set(mergedPdf);

const blob = new Blob([arrayBuffer], {
  type: "application/pdf",
});

setMergedBlob(blob);
    } catch (error) {
      console.error(error);
      alert("Failed to merge PDF files.");
    } finally {

 progressService.current.stop();
  setLoading(false);
}
  }
  const downloadMergedPdf = () => {
    if (!mergedBlob) return;

    const url = URL.createObjectURL(mergedBlob);

    const link = document.createElement("a");

    link.href = url;
    link.download = "merged.pdf";

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-6xl p-8">

      <h1 className="mb-8 text-4xl font-bold">
        Merge PDF
      </h1>
            <UploadZone
        variant="workspace"
        multiple
        accept=".pdf"
        maxSizeMB={500}
        onFiles={handleFiles}
      />

      <div className="mt-8">

        <MergeFileList
          files={files}
          onRemove={handleRemoveFile}
          onReorder={handleReorder}
        />

      </div>

      <div className="mt-8 flex justify-center">

  <button
    onClick={handleMerge}
    disabled={loading || files.length < 2}
    className="w-full max-w-md rounded-2xl bg-blue-600 px-8 py-5 font-semibold text-white shadow-lg transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
  >

    {loading ? (

      <div className="space-y-4">

        <div className="flex items-center justify-center gap-2">

          <Loader2 className="h-5 w-5 animate-spin" />

          <span>Merging PDFs...</span>

        </div>

        <div className="h-3 overflow-hidden rounded-full bg-slate-700">

          <div
            className="h-full rounded-full bg-green-500 transition-all duration-500"
            style={{
              width: `${progress}%`,
            }}
          />

        </div>

        <p className="text-center text-sm text-slate-300">

          {progress}%

        </p>

      </div>

    ) : (

      "Merge PDFs"

    )}

  </button>

</div>
{mergedBlob && (

<div className="mt-10 overflow-hidden rounded-3xl border border-green-500/30 bg-gradient-to-br from-green-950 via-slate-900 to-slate-950 shadow-2xl">

<div className="border-b border-green-500/20 p-8">

<h2 className="text-4xl font-bold text-green-400">
🎉 Merge Successful
</h2>

<p className="mt-3 text-slate-300">
Your PDF has been merged successfully.
</p>

</div>

<div className="grid gap-5 p-8 md:grid-cols-3">

<div className="rounded-2xl bg-slate-800/60 p-6">

<p className="text-sm text-slate-400">
Files Merged
</p>

<p className="mt-2 text-3xl font-bold text-white">
{files.length}
</p>

</div>

<div className="rounded-2xl bg-slate-800/60 p-6">

<p className="text-sm text-slate-400">
Output
</p>

<p className="mt-2 text-3xl font-bold text-green-400">
PDF
</p>

</div>

<div className="rounded-2xl bg-slate-800/60 p-6">

<p className="text-sm text-slate-400">
Status
</p>

<p className="mt-2 text-3xl font-bold text-green-400">
Ready
</p>

</div>

</div>

<div className="flex flex-wrap gap-4 border-t border-green-500/20 p-8">

<button
onClick={downloadMergedPdf}
className="flex items-center gap-2 rounded-2xl bg-green-600 px-8 py-4 text-lg font-bold text-white transition hover:scale-105 hover:bg-green-500"
>

<Download className="h-6 w-6" />

Download PDF

</button>

<button
onClick={()=>{
setFiles([]);
setMergedBlob(null);
}}
className="rounded-2xl border border-slate-600 px-8 py-4 text-lg font-semibold text-white transition hover:bg-slate-800"
>

Merge More PDFs

</button>

</div>

</div>

)}

</div>
);
}