import {
  FileSpreadsheet,
  FileText,
} from "lucide-react";

import type {
  ExcelPdfMode,
} from "./ExcelPdfService";

type Props = {
  mode: ExcelPdfMode;

  onModeChange: (
    mode: ExcelPdfMode
  ) => void;
};

export default function ExcelPdfOptions({
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
                "excel-to-pdf"
              )
            }
            className={`rounded-2xl border p-5 font-semibold transition ${
              mode ===
              "excel-to-pdf"
                ? "border-green-500 bg-green-600 text-white"
                : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            <FileSpreadsheet className="mx-auto mb-3 h-7 w-7" />

            Excel to PDF
          </button>

          <button
            type="button"
            onClick={() =>
              onModeChange(
                "pdf-to-excel"
              )
            }
            className={`rounded-2xl border p-5 font-semibold transition ${
              mode ===
              "pdf-to-excel"
                ? "border-green-500 bg-green-600 text-white"
                : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            <FileText className="mx-auto mb-3 h-7 w-7" />

            PDF to Excel
          </button>
        </div>
      </div>

      {mode ===
        "excel-to-pdf" && (
        <div className="rounded-xl border border-green-500/20 bg-green-950/30 p-4 text-sm text-green-200">
          Upload an XLSX workbook to
          convert its worksheets into a
          PDF document. Page layout,
          print areas, column widths, and
          worksheet formatting can affect
          the generated PDF.
        </div>
      )}

      {mode ===
        "pdf-to-excel" && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-950/30 p-4 text-sm text-blue-200">
          Upload a PDF containing tables
          or structured information.
          Draflio will convert the
          detected content into an
          editable XLSX workbook.
        </div>
      )}
    </div>
  );
}