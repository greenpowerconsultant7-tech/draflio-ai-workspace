import {
  API_BASE_URL,
} from "@/config/api";

import { PDFDocument } from "pdf-lib";

export type WordPdfMode =
  | "word-to-pdf"
  | "pdf-to-word";

export type WordPageSize =
  | "a4"
  | "letter";

export type WordPageOrientation =
  | "portrait"
  | "landscape";

export type WordToPdfOptions = {
  pageSize: WordPageSize;
  orientation: WordPageOrientation;
  margin: number;
  quality: number;
};

export type PdfToWordOptions = {
  preservePageBreaks: boolean;
  includePageNumbers: boolean;
};

export type WordToPdfResult = {
  bytes: Uint8Array;
  pageCount: number;
  messages: string[];
};

export type PdfToWordResult = {
  blob: Blob;
  pageCount: number;
  paragraphCount: number;
  characterCount: number;
};

async function readErrorMessage(
  response: Response
): Promise<string> {
  try {
    const data = (await response.json()) as {
      error?: string;
    };

    return (
      data.error ??
      "The conversion failed."
    );
  } catch {
    return "The conversion failed.";
  }
}

class WordPdfService {
  async wordToPdf(
    file: File,
    _options: WordToPdfOptions
  ): Promise<WordToPdfResult> {
    const formData = new FormData();

    formData.append("file", file);

    const response = await fetch(
      `${API_BASE_URL}/api/word-to-pdf`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response)
      );
    }

    const arrayBuffer =
      await response.arrayBuffer();

    const bytes =
      new Uint8Array(arrayBuffer);

    const pdf =
      await PDFDocument.load(bytes);

    return {
      bytes,
      pageCount: pdf.getPageCount(),
      messages: [],
    };
  }

  async pdfToWord(
    file: File,
    _options: PdfToWordOptions
  ): Promise<PdfToWordResult> {
    const originalPdf =
      await PDFDocument.load(
        await file.arrayBuffer()
      );

    const pageCount =
      originalPdf.getPageCount();

    const formData = new FormData();

    formData.append("file", file);

    const response = await fetch(
      `${API_BASE_URL}/api/pdf-to-word`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response)
      );
    }

    const blob =
      await response.blob();

    return {
      blob,
      pageCount,
      paragraphCount: 0,
      characterCount: 0,
    };
  }
}

export const wordPdfService =
  new WordPdfService();