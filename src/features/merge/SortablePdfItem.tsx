import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Trash2,
} from "lucide-react";

import PdfThumbnail from "./PdfThumbnail";
import type { PdfDocument } from "@/core/models/PdfDocument";

type Props = {
  pdf: PdfDocument;
  index: number;
  onRemove: (index: number) => void;
};

export default function SortablePdfItem({
  pdf,
  index,
  onRemove,
}: Props) {

  const [pages, setPages] = useState<number | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: pdf.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-900/60 p-5 shadow-lg"
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">

        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="text-slate-500" />
        </button>

        <PdfThumbnail
          file={pdf.file}
          onLoaded={setPages}
        />

        <div className="min-w-0 flex-1">

          <p
            className="truncate text-base font-semibold text-white"
            title={pdf.name}
          >
            {pdf.name}
          </p>

          <div className="mt-2 flex items-center gap-4 text-sm text-slate-400">

            <span>
              {pages ? `${pages} Pages` : "Loading..."}
            </span>

            <span>
              {(pdf.size / 1024 / 1024).toFixed(2)} MB
            </span>

          </div>

        </div>

      </div>

      <button
        onClick={() => onRemove(index)}
        className="rounded-xl p-3 transition hover:bg-red-500/10"
      >
        <Trash2
          size={20}
          className="text-red-500"
        />
      </button>

    </div>
  );
}