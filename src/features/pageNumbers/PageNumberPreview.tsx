import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { PageNumberOptions } from "./pageNumberTypes";
import { formatPageNumber } from "./pageNumberFormatting";

type Props = {
  document: PDFDocumentProxy;
  activePage: number;
  onActivePageChange: (page: number) => void;
  numberedPages: number[];
  options: PageNumberOptions;
};

export function PageNumberPreview({
  document,
  activePage,
  onActivePageChange,
  numberedPages,
  options,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderRef = useRef<RenderTask | null>(null);
  const [renderError, setRenderError] = useState(false);
  const sequenceIndex = numberedPages.indexOf(activePage - 1);
  const isNumbered = sequenceIndex >= 0;

  useEffect(() => {
    let disposed = false;
    const render = async () => {
      renderRef.current?.cancel();
      const page = await document.getPage(activePage);
      if (disposed) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const fitScale = Math.min(1.4, 760 / baseViewport.width);
      const viewport = page.getViewport({ scale: fitScale });
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      let renderScale = pixelRatio;
      const sideLimit = 4096 / Math.max(viewport.width, viewport.height);
      const pixelLimit = Math.sqrt(12_000_000 / (viewport.width * viewport.height));
      renderScale = Math.min(renderScale, sideLimit, pixelLimit);
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.max(1, Math.floor(viewport.width * renderScale));
      canvas.height = Math.max(1, Math.floor(viewport.height * renderScale));
      canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return;
      const task = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: renderScale === 1 ? undefined : [renderScale, 0, 0, renderScale, 0, 0],
      });
      renderRef.current = task;
      try {
        await task.promise;
        if (!disposed) setRenderError(false);
      } catch (error) {
        if (!disposed && !(error instanceof Error && error.name === "RenderingCancelledException")) {
          setRenderError(true);
        }
      }
    };
    void render();
    return () => {
      disposed = true;
      renderRef.current?.cancel();
      renderRef.current = null;
    };
  }, [activePage, document]);

  const overlayPosition = options.position.replace("-", " ");
  const horizontal = options.position.endsWith("left")
    ? "left-0"
    : options.position.endsWith("right")
      ? "right-0"
      : "left-1/2 -translate-x-1/2";
  const vertical = options.position.startsWith("top") ? "top-0" : "bottom-0";

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onActivePageChange(Math.max(1, activePage - 1))}
          disabled={activePage === 1}
          className="rounded-lg border border-slate-600 px-3 py-2 disabled:opacity-50"
        >
          Previous
        </button>
        <label className="flex items-center gap-2 text-sm">
          Page
          <input
            aria-label="Preview page"
            type="number"
            min={1}
            max={document.numPages}
            value={activePage}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isInteger(next) && next >= 1 && next <= document.numPages) {
                onActivePageChange(next);
              }
            }}
            className="w-20 rounded-lg border border-slate-600 bg-slate-800 p-2"
          />
          of {document.numPages}
        </label>
        <button
          type="button"
          onClick={() => onActivePageChange(Math.min(document.numPages, activePage + 1))}
          disabled={activePage === document.numPages}
          className="rounded-lg border border-slate-600 px-3 py-2 disabled:opacity-50"
        >
          Next
        </button>
      </div>
      <div className="relative mx-auto w-full max-w-3xl overflow-hidden bg-white shadow-xl">
        <canvas ref={canvasRef} className="block h-auto w-full" aria-label="PDF page preview" />
        {isNumbered && (
          <div
            aria-label={`Page-number preview, ${overlayPosition}`}
            className={`pointer-events-none absolute ${horizontal} ${vertical} whitespace-nowrap`}
            style={{
              margin: `${Math.max(6, options.margin / 2)}px`,
              color: options.color,
              fontFamily:
                options.font === "Times Roman"
                  ? "Times New Roman, serif"
                  : options.font === "Courier"
                    ? "Courier New, monospace"
                    : "Arial, sans-serif",
              fontSize: `${options.fontSize}px`,
              fontWeight: options.bold ? 700 : 400,
            }}
          >
            {formatPageNumber(
              options.startingNumber + sequenceIndex,
              numberedPages.length,
              options.format,
            )}
          </div>
        )}
      </div>
      {renderError && <p role="alert">This PDF page could not be previewed.</p>}
      <p className="mt-3 text-center text-sm text-slate-400">
        {isNumbered ? "This page will be numbered" : "This page will not be numbered"}
      </p>
    </section>
  );
}
