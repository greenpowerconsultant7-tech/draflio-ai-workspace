import { PDFDocument } from "pdf-lib";
import { pdfAdapter } from "./PdfAdapter";

export class PdfCore {
  async create() {
    return await pdfAdapter.createDocument();
  }

  async load(file: File) {
    const bytes = await file.arrayBuffer();
    return await pdfAdapter.loadDocument(bytes);
  }

  async save(document: PDFDocument) {
    return await pdfAdapter.saveDocument(document);
  }

  async getPageCount(file: File) {
    const pdf = await this.load(file);
    return pdf.getPageCount();
  }

  async copyPages(
    source: PDFDocument,
    destination: PDFDocument,
    pages: number[],
  ) {
    const copied = await destination.copyPages(source, pages);

    copied.forEach((page) => destination.addPage(page));
  }
}

export const pdfCore = new PdfCore();