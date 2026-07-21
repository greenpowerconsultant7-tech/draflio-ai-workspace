import { PDFDocument } from "pdf-lib";

export class PdfAdapter {
  async createDocument() {
    return await PDFDocument.create();
  }

  async loadDocument(bytes: ArrayBuffer | Uint8Array) {
    return await PDFDocument.load(bytes);
  }

  async saveDocument(document: PDFDocument) {
    return await document.save();
  }
}

export const pdfAdapter = new PdfAdapter();