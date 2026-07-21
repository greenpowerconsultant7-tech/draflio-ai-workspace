import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";

import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";

import { FileText } from "lucide-react";

import SortablePdfItem from "./SortablePdfItem";
import type { PdfDocument } from "@/core/models/PdfDocument";

type Props = {
  files: PdfDocument[];
  onRemove: (index: number) => void;
  onReorder: (files: PdfDocument[]) => void;
};

export default function MergeFileList({
  files,
  onRemove,
  onReorder,
}: Props) {

  const totalSize = files.reduce(
    (sum, pdf) => sum + pdf.size,
    0
  );

  const totalSizeMB = (
    totalSize /
    1024 /
    1024
  ).toFixed(2);

  const handleDragEnd = (event: DragEndEvent) => {

    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = files.findIndex(
      (pdf) => pdf.id === active.id
    );

    const newIndex = files.findIndex(
      (pdf) => pdf.id === over.id
    );

    if (oldIndex === -1 || newIndex === -1) return;

    onReorder(arrayMove(files, oldIndex, newIndex));

  };

  if (files.length === 0) {

    return (

      <div className="rounded-2xl border-2 border-dashed border-slate-700 bg-slate-900/40 p-10 text-center">

        <FileText className="mx-auto mb-4 h-14 w-14 text-slate-500" />

        <h3 className="text-lg font-semibold text-white">
          No PDF files selected
        </h3>

        <p className="mt-2 text-slate-400">
          Upload two or more PDFs.
        </p>

      </div>

    );

  }

  return (

    <div className="space-y-5">

      <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5">

        <h2 className="text-xl font-bold text-white">
          {files.length} PDF{files.length > 1 ? "s" : ""} Selected
        </h2>

        <p className="mt-1 text-sm text-slate-400">
          Total Size : {totalSizeMB} MB
        </p>

      </div>

      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >

        <SortableContext
          items={files.map((pdf) => pdf.id)}
          strategy={verticalListSortingStrategy}
        >

          <div className="space-y-4">

            {files.map((pdf, index) => (

              <SortablePdfItem
                key={pdf.id}
                pdf={pdf}
                index={index}
                onRemove={onRemove}
              />

            ))}

          </div>

        </SortableContext>

      </DndContext>

    </div>

  );

}