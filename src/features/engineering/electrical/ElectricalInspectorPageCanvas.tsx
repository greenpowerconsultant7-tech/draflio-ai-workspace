import { useEffect, useRef } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { EquipmentRecord } from "./electricalInspectorTypes";

type Props = {
  document: PDFDocumentProxy;
  pageIndex: number;
  records: EquipmentRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function ElectricalInspectorPageCanvas({
  document,
  pageIndex,
  records,
  selectedId,
  onSelect,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderRef = useRef<RenderTask | null>(null);

  useEffect(() => {
    let active = true;
    const canvas = canvasRef.current;
    const render = async () => {
      if (!canvas) return;
      renderRef.current?.cancel();
      const page = await document.getPage(pageIndex + 1);
      if (!active) return;
      const base = page.getViewport({ scale: 1, rotation: page.rotate });
      const available = Math.min(canvas.parentElement?.clientWidth ?? 800, 1000);
      const scale = Math.min(2, available / base.width);
      const viewport = page.getViewport({ scale, rotation: page.rotate });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.min(4096, Math.floor(viewport.width * ratio));
      const height = Math.min(4096, Math.floor(viewport.height * ratio));
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      const task = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      renderRef.current = task;
      try {
        await task.promise;
      } catch (error) {
        if (error instanceof Error && error.name !== "RenderingCancelledException") throw error;
      }
    };
    void render();
    const observer = new ResizeObserver(() => void render());
    if (canvas?.parentElement) observer.observe(canvas.parentElement);
    return () => {
      active = false;
      observer.disconnect();
      renderRef.current?.cancel();
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, [document, pageIndex]);

  const pageRecords = records.filter(
    (record) =>
      record.pageIndex === pageIndex && record.normalizedRectangle && record.status !== "rejected",
  );
  return (
    <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-lg bg-white">
      <canvas
        ref={canvasRef}
        className="block max-w-full"
        aria-label={`PDF page ${pageIndex + 1}`}
      />
      <div className="absolute inset-0">
        {pageRecords.map((record, index) => {
          const rectangle = record.normalizedRectangle;
          if (!rectangle) return null;
          return (
            <button
              key={record.id}
              type="button"
              aria-label={`Equipment suggestion ${index + 1}, ${record.equipmentType.replaceAll("-", " ")}, page ${pageIndex + 1}`}
              onClick={() => onSelect(record.id)}
              className={`absolute border-2 ${selectedId === record.id ? "border-warning bg-warning/30 ring-2 ring-white" : "border-primary bg-primary/20"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning`}
              style={{
                left: `${rectangle.x * 100}%`,
                top: `${rectangle.y * 100}%`,
                width: `${rectangle.width * 100}%`,
                height: `${rectangle.height * 100}%`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
