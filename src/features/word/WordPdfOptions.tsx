import type {
  PdfToWordOptions,
  WordPageOrientation,
  WordPageSize,
  WordPdfMode,
  WordToPdfOptions,
} from "./WordPdfService";

type Props = {
  mode: WordPdfMode;
  wordToPdfOptions: WordToPdfOptions;
  pdfToWordOptions: PdfToWordOptions;

  onModeChange: (
    mode: WordPdfMode
  ) => void;

  onWordToPdfOptionsChange: (
    options: WordToPdfOptions
  ) => void;

  onPdfToWordOptionsChange: (
    options: PdfToWordOptions
  ) => void;
};

export default function WordPdfOptions({
  mode,
  wordToPdfOptions,
  pdfToWordOptions,
  onModeChange,
  onWordToPdfOptionsChange,
  onPdfToWordOptionsChange,
}: Props) {
  const updateWordToPdfOptions = (
    changes: Partial<WordToPdfOptions>
  ) => {
    onWordToPdfOptionsChange({
      ...wordToPdfOptions,
      ...changes,
    });
  };

  const updatePdfToWordOptions = (
    changes: Partial<PdfToWordOptions>
  ) => {
    onPdfToWordOptionsChange({
      ...pdfToWordOptions,
      ...changes,
    });
  };

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
                "word-to-pdf"
              )
            }
            className={`rounded-2xl border p-5 font-semibold transition ${
              mode ===
              "word-to-pdf"
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Word to PDF
          </button>

          <button
            type="button"
            onClick={() =>
              onModeChange(
                "pdf-to-word"
              )
            }
            className={`rounded-2xl border p-5 font-semibold transition ${
              mode ===
              "pdf-to-word"
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            PDF to Word
          </button>
        </div>
      </div>

      {mode === "word-to-pdf" && (
        <>
          <div>
            <label className="mb-2 block font-semibold text-white">
              Page Size
            </label>

            <select
              disabled
              value={
                wordToPdfOptions.pageSize
              }
              onChange={(event) =>
                updateWordToPdfOptions({
                  pageSize:
                    event.target
                      .value as WordPageSize,
                })
              }
              className="w-full cursor-not-allowed rounded-xl border border-slate-700 bg-slate-800 p-3 text-slate-500 opacity-70"
            >
              <option value="a4">
                A4
              </option>

              <option value="letter">
                Letter
              </option>
            </select>
          </div>

          <div>
            <label className="mb-2 block font-semibold text-white">
              Orientation
            </label>

            <select
              disabled
              value={
                wordToPdfOptions.orientation
              }
              onChange={(event) =>
                updateWordToPdfOptions({
                  orientation:
                    event.target
                      .value as WordPageOrientation,
                })
              }
              className="w-full cursor-not-allowed rounded-xl border border-slate-700 bg-slate-800 p-3 text-slate-500 opacity-70"
            >
              <option value="portrait">
                Portrait
              </option>

              <option value="landscape">
                Landscape
              </option>
            </select>
          </div>

          <div>
            <label className="mb-2 flex justify-between font-semibold text-white">
              <span>
                Page Margin
              </span>

              <span>
                {
                  wordToPdfOptions.margin
                }{" "}
                pt
              </span>
            </label>

            <input
              type="range"
              disabled
              min={0}
              max={100}
              step={5}
              value={
                wordToPdfOptions.margin
              }
              onChange={(event) =>
                updateWordToPdfOptions({
                  margin: Number(
                    event.target.value
                  ),
                })
              }
              className="w-full cursor-not-allowed opacity-50"
            />
          </div>

          <div>
            <label className="mb-2 flex justify-between font-semibold text-white">
              <span>
                Image Quality
              </span>

              <span>
                {Math.round(
                  wordToPdfOptions.quality *
                    100
                )}
                %
              </span>
            </label>

            <input
              type="range"
              disabled
              min={0.4}
              max={1}
              step={0.05}
              value={
                wordToPdfOptions.quality
              }
              onChange={(event) =>
                updateWordToPdfOptions({
                  quality: Number(
                    event.target.value
                  ),
                })
              }
              className="w-full cursor-not-allowed opacity-50"
            />

            <p className="mt-2 text-sm text-slate-400">
              Higher quality creates a
              sharper PDF but may increase
              the file size.
            </p>
          </div>

          <div className="rounded-xl border border-blue-500/20 bg-blue-950/30 p-4 text-sm text-blue-200">
            Page size, orientation, margin,
            and image-quality controls are
            currently unavailable. Draflio
            uses Adobe to preserve the Word
            document&apos;s existing layout and
            does not send these disabled
            values to the conversion service.
          </div>
        </>
      )}

      {mode === "pdf-to-word" && (
        <>
          <label className="flex items-center gap-3 text-white">
            <input
              type="checkbox"
              disabled
              checked={
                pdfToWordOptions.preservePageBreaks
              }
              onChange={(event) =>
                updatePdfToWordOptions({
                  preservePageBreaks:
                    event.target
                      .checked,
                })
              }
            />

            Preserve PDF page breaks
          </label>

          <label className="flex items-center gap-3 text-white">
            <input
              type="checkbox"
              disabled
              checked={
                pdfToWordOptions.includePageNumbers
              }
              onChange={(event) =>
                updatePdfToWordOptions({
                  includePageNumbers:
                    event.target
                      .checked,
                })
              }
            />

            Add page headings to the Word
            document
          </label>

          <div className="rounded-xl border border-blue-500/20 bg-blue-950/30 p-4 text-sm text-blue-200">
            Adobe currently controls the
            resulting Word layout. Preserve
            page breaks and page headings are
            not yet supported, and Draflio does
            not send these disabled values to
            the conversion service. Scanned
            PDFs without a text layer require
            Draflio Smart OCR.
          </div>
        </>
      )}
    </div>
  );
}
