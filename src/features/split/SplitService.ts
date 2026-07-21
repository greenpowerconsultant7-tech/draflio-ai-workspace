import { PDFDocument } from "pdf-lib";

export type SplitMode =
  | {
      type: "every-page";
    }
  | {
      type: "range";
      ranges: string[];
    }
  | {
      type: "extract";
      pages: number[];
    }
  | {
      type: "every-n";
      size: number;
    };

class SplitService {
  async split(
    file: File,
    mode: SplitMode
  ): Promise<Uint8Array[]> {
    const bytes = await file.arrayBuffer();

    const pdf = await PDFDocument.load(bytes);

    switch (mode.type) {
      case "every-page":
        return this.splitEveryPage(pdf);

      case "extract":
        return this.extractPages(pdf, mode.pages);

      case "every-n":
        return this.splitEveryN(pdf, mode.size);

      case "range":
        return this.splitRanges(pdf, mode.ranges);

      default:
        return [];
    }
  }

  private async splitEveryPage(
    pdf: PDFDocument
  ): Promise<Uint8Array[]> {
    const result: Uint8Array[] = [];

    const total = pdf.getPageCount();

    for (let i = 0; i < total; i++) {
      const newPdf = await PDFDocument.create();

      const [page] = await newPdf.copyPages(pdf, [i]);

      newPdf.addPage(page);

      result.push(await newPdf.save());
    }

    return result;
  }

  private async extractPages(
    pdf: PDFDocument,
    pages: number[]
  ): Promise<Uint8Array[]> {
    const newPdf = await PDFDocument.create();

    const indices = pages
      .map((p) => p - 1)
      .filter(
        (i) =>
          i >= 0 &&
          i < pdf.getPageCount()
      );

    const copied = await newPdf.copyPages(
      pdf,
      indices
    );

    copied.forEach((page) =>
      newPdf.addPage(page)
    );

    return [await newPdf.save()];
  }

  private async splitEveryN(
    pdf: PDFDocument,
    size: number
  ): Promise<Uint8Array[]> {
    const result: Uint8Array[] = [];

    const total = pdf.getPageCount();

    for (
      let start = 0;
      start < total;
      start += size
    ) {
      const end = Math.min(
        start + size,
        total
      );

      const indices = [];

      for (
        let i = start;
        i < end;
        i++
      ) {
        indices.push(i);
      }

      const newPdf = await PDFDocument.create();

      const copied = await newPdf.copyPages(
        pdf,
        indices
      );

      copied.forEach((page) =>
        newPdf.addPage(page)
      );

      result.push(await newPdf.save());
    }

    return result;
  }

  private async splitRanges(
    pdf: PDFDocument,
    ranges: string[]
  ): Promise<Uint8Array[]> {
    const result: Uint8Array[] = [];

    for (const range of ranges) {
      const [start, end] = range
        .split("-")
        .map(Number);

      if (
        Number.isNaN(start) ||
        Number.isNaN(end)
      ) {
        continue;
      }

      const indices = [];

      for (
        let i = start - 1;
        i < end;
        i++
      ) {
        indices.push(i);
      }

      const newPdf = await PDFDocument.create();

      const copied = await newPdf.copyPages(
        pdf,
        indices
      );

      copied.forEach((page) =>
        newPdf.addPage(page)
      );

      result.push(await newPdf.save());
    }

    return result;
  }
}

export const splitService =
  new SplitService();