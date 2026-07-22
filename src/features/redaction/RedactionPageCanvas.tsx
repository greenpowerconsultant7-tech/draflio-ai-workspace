import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import {
  displayPointToNormalized,
  drawNormalizedRectangle,
  isLargeEnough,
  moveRectangle,
  normalizedToDisplay,
  resizeRectangle,
  type EditorRectangle,
  type Point,
  type ResizeCorner,
} from "./redactionGeometry";

interface Props {
  document: PDFDocumentProxy;
  pageIndex: number;
  rectangles: EditorRectangle[];
  selectedId: string | null;
  drawMode: boolean;
  editingDisabled: boolean;
  maximumReached: boolean;
  onSelect: (id: string | null) => void;
  onAdd: (rectangle: EditorRectangle) => void;
  onChange: (rectangle: EditorRectangle) => void;
  onDelete: (id: string) => void;
  onRenderError: () => void;
}

type Interaction =
  | { kind: "draw"; start: Point; current: Point }
  | { kind: "move"; start: Point; original: EditorRectangle }
  | { kind: "resize"; corner: ResizeCorner; original: EditorRectangle };

const corners: ResizeCorner[] = ["north-west", "north-east", "south-west", "south-east"];

function cornerPosition(corner: ResizeCorner) {
  return {
    left: corner.endsWith("west") ? "0%" : "100%",
    top: corner.startsWith("north") ? "0%" : "100%",
  };
}

export default function RedactionPageCanvas({
  document,
  pageIndex,
  rectangles,
  selectedId,
  drawMode,
  editingDisabled,
  maximumReached,
  onSelect,
  onAdd,
  onChange,
  onDelete,
  onRenderError,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const renderIdRef = useRef(0);
  const interactionRef = useRef<Interaction | null>(null);
  const [displaySize, setDisplaySize] = useState({ width: 1, height: 1 });
  const [draft, setDraft] = useState<EditorRectangle | null>(null);
  const [renderReady, setRenderReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    let disposed = false;
    const render = async () => {
      const renderId = ++renderIdRef.current;
      setRenderReady(false);
      renderTaskRef.current?.cancel();
      const page = await document.getPage(pageIndex + 1);
      try {
        if (disposed || renderId !== renderIdRef.current) return;
        const base = page.getViewport({ scale: 1 });
        const cssWidth = Math.max(240, Math.min(960, container.clientWidth || 960));
        const cssHeight = (cssWidth / base.width) * base.height;
        const desiredPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const capRatio = Math.min(
          1,
          4096 / Math.max(cssWidth * desiredPixelRatio, cssHeight * desiredPixelRatio),
        );
        const pixelRatio = desiredPixelRatio * capRatio;
        const viewport = page.getViewport({ scale: (cssWidth / base.width) * pixelRatio });
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas is unavailable");
        const task = page.render({ canvas, canvasContext: context, viewport });
        renderTaskRef.current = task;
        await task.promise;
        if (!disposed && renderId === renderIdRef.current) {
          setDisplaySize({ width: cssWidth, height: cssHeight });
          setRenderReady(true);
        }
      } catch (error) {
        if (!(error instanceof Error && error.name === "RenderingCancelledException") && !disposed)
          onRenderError();
      } finally {
        page.cleanup();
      }
    };
    const observer = new ResizeObserver(() => void render());
    observer.observe(container);
    void render();
    return () => {
      disposed = true;
      observer.disconnect();
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [document, onRenderError, pageIndex]);

  const normalizedPoint = (event: ReactPointerEvent): Point => {
    const bounds = editorRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return displayPointToNormalized(
      { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      bounds.width,
      bounds.height,
    );
  };

  const beginBackground = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!renderReady || editingDisabled || !drawMode || maximumReached || event.button !== 0)
      return;
    editorRef.current?.setPointerCapture(event.pointerId);
    const start = normalizedPoint(event);
    interactionRef.current = { kind: "draw", start, current: start };
    setDraft(drawNormalizedRectangle(start, start, pageIndex));
    onSelect(null);
  };

  const beginRectangle = (event: ReactPointerEvent, rectangle: EditorRectangle) => {
    event.stopPropagation();
    onSelect(rectangle.id);
    if (!renderReady || editingDisabled || drawMode || event.button !== 0) return;
    editorRef.current?.setPointerCapture(event.pointerId);
    interactionRef.current = { kind: "move", start: normalizedPoint(event), original: rectangle };
  };

  const beginResize = (
    event: ReactPointerEvent,
    rectangle: EditorRectangle,
    corner: ResizeCorner,
  ) => {
    event.stopPropagation();
    if (!renderReady || editingDisabled) return;
    editorRef.current?.setPointerCapture(event.pointerId);
    interactionRef.current = { kind: "resize", corner, original: rectangle };
  };

  const movePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (!interaction) return;
    event.preventDefault();
    const point = normalizedPoint(event);
    if (interaction.kind === "draw") {
      interaction.current = point;
      setDraft(drawNormalizedRectangle(interaction.start, point, pageIndex));
    } else if (interaction.kind === "move") {
      onChange(
        moveRectangle(interaction.original, {
          x: point.x - interaction.start.x,
          y: point.y - interaction.start.y,
        }),
      );
    } else {
      onChange(
        resizeRectangle(
          interaction.original,
          interaction.corner,
          point,
          6 / displaySize.width,
          6 / displaySize.height,
        ),
      );
    }
  };

  const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    interactionRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (
      interaction?.kind === "draw" &&
      draft &&
      isLargeEnough(draft, displaySize.width, displaySize.height)
    )
      onAdd(draft);
    setDraft(null);
  };

  const visibleRectangles = renderReady ? (draft ? [...rectangles, draft] : rectangles) : [];
  return (
    <div
      ref={containerRef}
      className="flex min-h-[360px] w-full justify-center overflow-auto rounded-2xl bg-slate-950/80 p-3 sm:p-6"
    >
      <div
        ref={editorRef}
        className="relative shrink-0 touch-none shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        style={{ width: displaySize.width, height: displaySize.height }}
        onPointerDown={beginBackground}
        onPointerMove={movePointer}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            interactionRef.current = null;
            setDraft(null);
            onSelect(null);
          }
          const target = event.target;
          const editingText =
            target instanceof HTMLElement &&
            ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
          if ((event.key === "Delete" || event.key === "Backspace") && selectedId && !editingText) {
            event.preventDefault();
            onDelete(selectedId);
          }
        }}
        role="application"
        aria-label={`Redaction editor for page ${pageIndex + 1}`}
        aria-busy={!renderReady}
        tabIndex={0}
      >
        <canvas
          ref={canvasRef}
          className="block bg-white"
          aria-label={`PDF page ${pageIndex + 1}`}
        />
        <div className="absolute inset-0" aria-label="Redaction rectangles">
          {visibleRectangles.map((rectangle) => {
            const display = normalizedToDisplay(rectangle, displaySize.width, displaySize.height);
            const selected = rectangle.id === selectedId;
            return (
              <div
                key={rectangle.id}
                className={`absolute border-2 bg-red-600/55 ${selected ? "border-yellow-300 ring-2 ring-yellow-300/70" : "border-red-200"}`}
                style={{
                  left: display.left,
                  top: display.top,
                  width: display.width,
                  height: display.height,
                }}
                onPointerDown={(event) => beginRectangle(event, rectangle)}
                role="button"
                aria-label="Redaction rectangle. Select to move or resize."
                tabIndex={selected ? 0 : -1}
              >
                {selected &&
                  !editingDisabled &&
                  corners.map((corner) => (
                    <span
                      key={corner}
                      className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-950 bg-yellow-300"
                      style={cornerPosition(corner)}
                      onPointerDown={(event) => beginResize(event, rectangle, corner)}
                      role="button"
                      aria-label={`Resize from ${corner}`}
                    />
                  ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
