import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export type ThumbnailResult = {
  thumbnail: string;
  pages: number;
};

export class ThumbnailService {
  async generate(file: File): Promise<ThumbnailResult> {
    const buffer = await file.arrayBuffer();

    const pdf = await pdfjsLib.getDocument({
      data: buffer,
    }).promise;

    const page = await pdf.getPage(1);

    const viewport = page.getViewport({
      scale: 0.5,
    });

    const canvas = document.createElement("canvas");

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas context unavailable.");
    }

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvas,
      canvasContext: context,
      viewport,
    }).promise;

    return {
      thumbnail: canvas.toDataURL("image/png"),
      pages: pdf.numPages,
    };
  }
}