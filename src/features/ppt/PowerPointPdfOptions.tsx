import {
  FileText,
  Presentation,
} from "lucide-react";

import type {
  PowerPointPdfMode,
} from "./PowerPointPdfService";

type Props = {
  mode: PowerPointPdfMode;

  onModeChange: (
    mode: PowerPointPdfMode
  ) => void;
};

export default function PowerPointPdfOptions({
  mode,
  onModeChange,
}: Props) {
  return (
    <div className="mt-8 space-y-8 rounded-2xl border border-slate-700 bg-slate-900 p-6">
      <div>
        <h2 className="mb-5 text-2xl font-bold text-white">
          Conversion Type
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() =>
              onModeChange(
                "powerpoint-to-pdf"
              )
            }
            className={`rounded-2xl border p-5 font-semibold transition ${
              mode ===
              "powerpoint-to-pdf"
                ? "border-orange-500 bg-orange-600 text-white"
                : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            <Presentation className="mx-auto mb-3 h-7 w-7" />

            PowerPoint to PDF
          </button>

          <button
            type="button"
            onClick={() =>
              onModeChange(
                "pdf-to-powerpoint"
              )
            }
            className={`rounded-2xl border p-5 font-semibold transition ${
              mode ===
              "pdf-to-powerpoint"
                ? "border-orange-500 bg-orange-600 text-white"
                : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            <FileText className="mx-auto mb-3 h-7 w-7" />

            PDF to PowerPoint
          </button>
        </div>
      </div>

      {mode ===
        "powerpoint-to-pdf" && (
        <div className="rounded-xl border border-orange-500/20 bg-orange-950/30 p-4 text-sm text-orange-200">
          Upload a PPTX presentation to
          convert every slide into a PDF
          page. Slide dimensions, images,
          fonts, and layout formatting will
          be preserved where possible.
        </div>
      )}

      {mode ===
        "pdf-to-powerpoint" && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-950/30 p-4 text-sm text-blue-200">
          Upload a PDF to convert its pages
          into an editable PowerPoint
          presentation. PDFs with clear text
          and simple layouts generally
          produce the best results.
        </div>
      )}
    </div>
  );
}