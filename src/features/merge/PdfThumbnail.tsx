
import { useEffect, useState } from "react";

import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

type Props = {
  file: File;
  onLoaded?: (pages: number) => void;
};

export default function PdfThumbnail({
  file,
  onLoaded,

}: Props) { 
  const [thumbnail, setThumbnail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const generateThumbnail = async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");

        if (!mounted) return;

        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

        const buffer = await file.arrayBuffer();

        const pdf = await pdfjsLib.getDocument({
          data: buffer,
        }).promise;
        onLoaded?.(pdf.numPages);
        
        const page = await pdf.getPage(1);

        const viewport = page.getViewport({
          scale: 0.5,
        });

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
          canvas,
          canvasContext: context,
          viewport,
        }).promise;

        if (mounted) {
          setThumbnail(canvas.toDataURL("image/png"));
        }
      } catch (err) {
        console.error(err);
      }
    };

    generateThumbnail();

    return () => {
      mounted = false;
    };
  }, [file]);

  if (!thumbnail) {
    return (
      <div className="flex h-24 w-20 items-center justify-center rounded-xl bg-slate-800">
        <span className="text-xs text-slate-400">
          Loading...
        </span>
      </div>
    );
  }

  return (
    <img
      src={thumbnail}
      alt={file.name}
      className="h-24 w-20 rounded-xl border border-slate-700 object-cover"
    />
  );
}
