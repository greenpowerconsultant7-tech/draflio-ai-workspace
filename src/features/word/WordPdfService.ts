import {
  runConversionJob,
  type ConversionJobRunOptions,
  type ConversionJobStage,
  type ConversionProgress,
  type ConversionProgressUpdate,
} from "@/lib/conversionJobClient";

import { PDFDocument } from "pdf-lib";

export type WordPdfMode = "word-to-pdf" | "pdf-to-word";

export type WordPageSize = "a4" | "letter";

export type WordPageOrientation = "portrait" | "landscape";

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

export type WordProgressMode = ConversionProgress;
export type WordProgressStage = ConversionJobStage;
export type WordProgressUpdate = ConversionProgressUpdate;

export type WordToPdfRunOptions = Pick<
  ConversionJobRunOptions,
  "signal" | "onProgress" | "pollIntervalMs"
>;

export type WordToPdfResult = {
  bytes: Uint8Array;
  pageCount: number;
  messages: string[];
  outputFilename: string;
};

export type PdfToWordResult = {
  blob: Blob;
  pageCount: number;
  paragraphCount: number;
  characterCount: number;
  outputFilename: string;
};

const MAXIMUM_FILE_SIZE = 100 * 1024 * 1024;
const PDF_MEDIA_TYPE = "application/pdf";
const DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function validateDocxFile(file: File) {
  const filename = file.name.toLowerCase();

  if (!filename.endsWith(".docx")) {
    throw new Error("Please upload a DOCX file.");
  }

  if (file.size <= 0) {
    throw new Error("The selected DOCX file is empty.");
  }

  if (file.size > MAXIMUM_FILE_SIZE) {
    throw new Error("The selected DOCX file exceeds the 100 MB limit.");
  }
}

async function validatePdfFile(file: File) {
  const filename = file.name.toLowerCase();

  if (!filename.endsWith(".pdf")) {
    throw new Error("Please upload a PDF file.");
  }

  if (file.size <= 0) {
    throw new Error("The selected PDF file is empty.");
  }

  if (file.size > MAXIMUM_FILE_SIZE) {
    throw new Error("The selected PDF file exceeds the 100 MB limit.");
  }

  if (
    file.type &&
    file.type !== PDF_MEDIA_TYPE &&
    file.type !== "application/x-pdf" &&
    file.type !== "application/octet-stream"
  ) {
    throw new Error("Please upload a valid PDF file.");
  }

  try {
    return await PDFDocument.load(await file.arrayBuffer());
  } catch {
    throw new Error("The selected file does not contain a valid PDF document.");
  }
}

function hasRecognizedZipSignature(bytes: Uint8Array) {
  if (bytes.byteLength < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return false;
  }

  return (
    (bytes[2] === 0x03 && bytes[3] === 0x04) ||
    (bytes[2] === 0x05 && bytes[3] === 0x06) ||
    (bytes[2] === 0x07 && bytes[3] === 0x08)
  );
}

function emitProgress(
  callback: ((update: WordProgressUpdate) => void) | undefined,
  update: WordProgressUpdate,
) {
  callback?.(update);
}

class WordPdfService {
  async wordToPdf(file: File, runOptions: WordToPdfRunOptions = {}): Promise<WordToPdfResult> {
    validateDocxFile(file);

    const result = await runConversionJob({
      ...runOptions,
      operation: "word-to-pdf",
      expectedOutputMediaType: PDF_MEDIA_TYPE,
      file,
      conversionLabel: "Word-to-PDF",
    });

    emitProgress(runOptions.onProgress, {
      stage: "preparing",
      message: "Verifying the converted PDF.",
      progress: {
        mode: "indeterminate",
      },
    });

    const pdf = await PDFDocument.load(result.bytes);

    emitProgress(runOptions.onProgress, {
      stage: "completed",
      message: "The converted PDF is ready.",
      progress: {
        mode: "determinate",
        value: 100,
      },
    });

    return {
      bytes: result.bytes,
      pageCount: pdf.getPageCount(),
      messages: [],
      outputFilename: result.job.outputFilename,
    };
  }

  async pdfToWord(file: File, runOptions: WordToPdfRunOptions = {}): Promise<PdfToWordResult> {
    const originalPdf = await validatePdfFile(file);

    const result = await runConversionJob({
      ...runOptions,
      operation: "pdf-to-word",
      expectedOutputMediaType: DOCX_MEDIA_TYPE,
      file,
      conversionLabel: "PDF-to-Word",
    });

    emitProgress(runOptions.onProgress, {
      stage: "preparing",
      message: "Verifying the converted Word document.",
      progress: {
        mode: "indeterminate",
      },
    });

    if (!hasRecognizedZipSignature(result.bytes)) {
      throw new Error(
        "The conversion server returned a document without a recognized ZIP signature.",
      );
    }

    emitProgress(runOptions.onProgress, {
      stage: "completed",
      message: "The converted Word document is ready.",
      progress: {
        mode: "determinate",
        value: 100,
      },
    });

    const blobBytes = new Uint8Array(result.bytes.byteLength);

    blobBytes.set(result.bytes);

    return {
      blob: new Blob([blobBytes.buffer], {
        type: DOCX_MEDIA_TYPE,
      }),
      pageCount: originalPdf.getPageCount(),
      paragraphCount: 0,
      characterCount: 0,
      outputFilename: result.job.outputFilename,
    };
  }
}

export const wordPdfService = new WordPdfService();
