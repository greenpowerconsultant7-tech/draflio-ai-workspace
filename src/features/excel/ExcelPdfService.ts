import {
  API_BASE_URL,
} from "@/config/api";

import {
  runConversionJob,
  type ConversionJobRunOptions,
  type ConversionProgressUpdate,
} from "@/lib/conversionJobClient";

import {
  PDFDocument,
} from "pdf-lib";

export type ExcelPdfMode =
  | "excel-to-pdf"
  | "pdf-to-excel";

export type ExcelToPdfResult = {
  blob: Blob;
  pageCount: number;
  size: number;
  outputFilename: string;
};

export type PdfToExcelResult = {
  blob: Blob;
  size: number;
};

type ConversionEndpoint =
  | "/api/excel-to-pdf"
  | "/api/pdf-to-excel";

export type ExcelProgressUpdate =
  ConversionProgressUpdate;

export type ExcelToPdfRunOptions = Pick<
  ConversionJobRunOptions,
  "signal" | "onProgress" | "pollIntervalMs"
>;

export type PdfToExcelRunOptions = {
  signal?: AbortSignal;
};

const MAXIMUM_FILE_SIZE =
  100 * 1024 * 1024;

const PDF_MEDIA_TYPE =
  "application/pdf";

const XLSX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function readErrorMessage(
  response: Response
): Promise<string> {
  try {
    const result =
      (await response.json()) as {
        error?: string;
      };

    return (
      result.error ??
      `Conversion failed with status ${response.status}.`
    );
  } catch {
    return `Conversion failed with status ${response.status}.`;
  }
}

async function convertFile(
  file: File,
  endpoint: ConversionEndpoint,
  signal?: AbortSignal
): Promise<Blob> {
  const formData =
    new FormData();

  formData.append(
    "file",
    file
  );

  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}${endpoint}`,
      {
        method: "POST",
        body: formData,
        signal,
      }
    );
  } catch (error) {
    console.error(
      "Excel conversion request failed:",
      error
    );

    throw new Error(
      "Could not connect to the conversion server. Make sure the backend is running on port 3001."
    );
  }

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response
      )
    );
  }

  return response.blob();
}

function validateXlsxFile(
  file: File
) {
  const filename =
    file.name.toLowerCase();

  const mimeType =
    file.type
      .trim()
      .toLowerCase();

  if (
    !filename.endsWith(
      ".xlsx"
    )
  ) {
    throw new Error(
      "Please select an XLSX file."
    );
  }

  if (file.size <= 0) {
    throw new Error(
      "The selected XLSX file is empty."
    );
  }

  if (
    file.size >
    MAXIMUM_FILE_SIZE
  ) {
    throw new Error(
      "The selected XLSX file exceeds the 100 MB limit."
    );
  }

  if (
    mimeType &&
    mimeType !==
      XLSX_MEDIA_TYPE &&
    mimeType !==
      "application/octet-stream"
  ) {
    throw new Error(
      "Please select a valid XLSX file."
    );
  }
}

function emitProgress(
  callback:
    | ((update: ExcelProgressUpdate) => void)
    | undefined,
  update: ExcelProgressUpdate
) {
  callback?.(update);
}

function createSafeBlob(
  source: Blob,
  bytes: Uint8Array,
  mimeType: string
): Blob {
  const arrayBuffer =
    new ArrayBuffer(
      bytes.byteLength
    );

  const view =
    new Uint8Array(
      arrayBuffer
    );

  view.set(bytes);

  return new Blob(
    [arrayBuffer],
    {
      type:
        source.type ||
        mimeType,
    }
  );
}

export async function convertExcelToPdf(
  file: File,
  runOptions:
    ExcelToPdfRunOptions = {}
): Promise<ExcelToPdfResult> {
  validateXlsxFile(file);

  const result =
    await runConversionJob({
      ...runOptions,
      operation:
        "excel-to-pdf",
      expectedOutputMediaType:
        PDF_MEDIA_TYPE,
      file,
      conversionLabel:
        "Excel-to-PDF",
    });

  emitProgress(
    runOptions.onProgress,
    {
      stage:
        "preparing",
      message:
        "Verifying the converted PDF.",
      progress: {
        mode:
          "indeterminate",
      },
    }
  );

  let pdfDocument;

  try {
    pdfDocument =
      await PDFDocument.load(
        result.bytes
      );
  } catch {
    throw new Error(
      "The conversion server returned an invalid PDF document."
    );
  }

  const blobBytes =
    new Uint8Array(
      result.bytes.byteLength
    );

  blobBytes.set(
    result.bytes
  );

  const safeBlob =
    new Blob(
      [blobBytes.buffer],
      {
        type:
          PDF_MEDIA_TYPE,
      }
    );

  emitProgress(
    runOptions.onProgress,
    {
      stage:
        "completed",
      message:
        "The converted PDF is ready.",
      progress: {
        mode:
          "determinate",
        value: 100,
      },
    }
  );

  return {
    blob: safeBlob,
    pageCount:
      pdfDocument.getPageCount(),
    size: safeBlob.size,
    outputFilename:
      result.job.outputFilename,
  };
}

export async function convertPdfToExcel(
  file: File,
  runOptions:
    PdfToExcelRunOptions = {}
): Promise<PdfToExcelResult> {
  const filename =
    file.name.toLowerCase();

  const isPdf =
    file.type ===
      "application/pdf" ||
    filename.endsWith(
      ".pdf"
    );

  if (!isPdf) {
    throw new Error(
      "Please select a PDF file."
    );
  }

  const responseBlob =
    await convertFile(
      file,
      "/api/pdf-to-excel",
      runOptions.signal
    );

  const responseBytes =
    new Uint8Array(
      await responseBlob.arrayBuffer()
    );

  const safeBlob =
    createSafeBlob(
      responseBlob,
      responseBytes,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

  return {
    blob: safeBlob,
    size: safeBlob.size,
  };
}

export const excelPdfService = {
  excelToPdf:
    convertExcelToPdf,

  pdfToExcel:
    convertPdfToExcel,
};
