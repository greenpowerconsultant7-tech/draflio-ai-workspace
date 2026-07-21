import { pdfCore } from "./PdfCore";

export class MergeService {
  async merge(files: File[]) {
    if (files.length < 2) {
      throw new Error("Select at least two PDF files.");
    }

    const mergedPdf = await pdfCore.create();

    for (const file of files) {
      const pdf = await pdfCore.load(file);

      const pageCount = pdf.getPageCount();

      const pages = Array.from(
        { length: pageCount },
        (_, index) => index
      );

      await pdfCore.copyPages(
        pdf,
        mergedPdf,
        pages
      );
    }

    return await pdfCore.save(mergedPdf);
  }
}

export const mergeService = new MergeService();