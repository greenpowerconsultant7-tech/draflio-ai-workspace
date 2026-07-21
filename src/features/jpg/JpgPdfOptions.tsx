import type {
  ImageFit,
  ImageOrientation,
  ImagePageSize,
  ImagesToPdfOptions,
  JpgPdfMode,
  PdfToJpgOptions,
} from "./JpgPdfService";

type Props = {
  mode: JpgPdfMode;
  imagesToPdfOptions: ImagesToPdfOptions;
  pdfToJpgOptions: PdfToJpgOptions;

  onModeChange: (mode: JpgPdfMode) => void;

  onImagesToPdfOptionsChange: (
    options: ImagesToPdfOptions
  ) => void;

  onPdfToJpgOptionsChange: (
    options: PdfToJpgOptions
  ) => void;
};

export default function JpgPdfOptions({
  mode,
  imagesToPdfOptions,
  pdfToJpgOptions,
  onModeChange,
  onImagesToPdfOptionsChange,
  onPdfToJpgOptionsChange,
}: Props) {
  const updateImagesToPdfOptions = (
    changes: Partial<ImagesToPdfOptions>
  ) => {
    onImagesToPdfOptionsChange({
      ...imagesToPdfOptions,
      ...changes,
    });
  };

  const updatePdfToJpgOptions = (
    changes: Partial<PdfToJpgOptions>
  ) => {
    onPdfToJpgOptionsChange({
      ...pdfToJpgOptions,
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
              onModeChange("images-to-pdf")
            }
            className={`rounded-2xl border p-5 font-semibold transition ${
              mode === "images-to-pdf"
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            JPG / PNG to PDF
          </button>

          <button
            type="button"
            onClick={() =>
              onModeChange("pdf-to-jpg")
            }
            className={`rounded-2xl border p-5 font-semibold transition ${
              mode === "pdf-to-jpg"
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            PDF to JPG
          </button>
        </div>
      </div>

      {mode === "images-to-pdf" && (
        <>
          <div>
            <label className="mb-2 block font-semibold text-white">
              PDF Page Size
            </label>

            <select
              value={imagesToPdfOptions.pageSize}
              onChange={(event) =>
                updateImagesToPdfOptions({
                  pageSize:
                    event.target
                      .value as ImagePageSize,
                })
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500"
            >
              <option value="auto">
                Match Image Size
              </option>

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
              Page Orientation
            </label>

            <select
              value={
                imagesToPdfOptions.orientation
              }
              onChange={(event) =>
                updateImagesToPdfOptions({
                  orientation:
                    event.target
                      .value as ImageOrientation,
                })
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500"
            >
              <option value="auto">
                Automatic
              </option>

              <option value="portrait">
                Portrait
              </option>

              <option value="landscape">
                Landscape
              </option>
            </select>
          </div>

          <div>
            <label className="mb-2 block font-semibold text-white">
              Image Fit
            </label>

            <select
              value={imagesToPdfOptions.fit}
              onChange={(event) =>
                updateImagesToPdfOptions({
                  fit:
                    event.target
                      .value as ImageFit,
                })
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500"
            >
              <option value="contain">
                Contain — show the full image
              </option>

              <option value="cover">
                Cover — fill the whole page
              </option>
            </select>

            <p className="mt-2 text-sm text-slate-400">
              Cover may crop part of the image.
            </p>
          </div>

          <div>
            <label className="mb-2 flex justify-between font-semibold text-white">
              <span>Page Margin</span>

              <span>
                {imagesToPdfOptions.margin} pt
              </span>
            </label>

            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={imagesToPdfOptions.margin}
              onChange={(event) =>
                updateImagesToPdfOptions({
                  margin: Number(
                    event.target.value
                  ),
                })
              }
              className="w-full"
            />
          </div>
        </>
      )}

      {mode === "pdf-to-jpg" && (
        <>
          <div>
            <label className="mb-2 flex justify-between font-semibold text-white">
              <span>JPG Quality</span>

              <span>
                {Math.round(
                  pdfToJpgOptions.quality * 100
                )}
                %
              </span>
            </label>

            <input
              type="range"
              min={0.4}
              max={1}
              step={0.05}
              value={pdfToJpgOptions.quality}
              onChange={(event) =>
                updatePdfToJpgOptions({
                  quality: Number(
                    event.target.value
                  ),
                })
              }
              className="w-full"
            />

            <p className="mt-2 text-sm text-slate-400">
              Higher quality produces larger JPG files.
            </p>
          </div>

          <div>
            <label className="mb-2 flex justify-between font-semibold text-white">
              <span>Rendering Resolution</span>

              <span>
                {pdfToJpgOptions.scale.toFixed(1)}×
              </span>
            </label>

            <input
              type="range"
              min={1}
              max={3}
              step={0.25}
              value={pdfToJpgOptions.scale}
              onChange={(event) =>
                updatePdfToJpgOptions({
                  scale: Number(
                    event.target.value
                  ),
                })
              }
              className="w-full"
            />

            <p className="mt-2 text-sm text-slate-400">
              A larger scale creates sharper images but uses more memory.
            </p>
          </div>
        </>
      )}
    </div>
  );
}