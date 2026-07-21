import {
  API_BASE_URL,
} from "@/config/api";

import {
  PDFDocument,
} from "pdf-lib";

export type PowerPointPdfMode =
  | "powerpoint-to-pdf"
  | "pdf-to-powerpoint";

export type PowerPointToPdfResult = {
  blob: Blob;
  pageCount: number;
  size: number;
};

export type PdfToPowerPointResult = {
  blob: Blob;
  size: number;
};

type ConversionEndpoint =
  | "/api/powerpoint-to-pdf"
  | "/api/pdf-to-powerpoint";

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
  endpoint: ConversionEndpoint
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
      }
    );
  } catch (error) {
    console.error(
      "PowerPoint conversion request failed:",
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

export async function convertPowerPointToPdf(
  file: File
): Promise<PowerPointToPdfResult> {
  const filename =
    file.name.toLowerCase();

  const isPptx =
    file.type ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    filename.endsWith(
      ".pptx"
    );

  if (!isPptx) {
    throw new Error(
      "Please select a PPTX file."
    );
  }

  const responseBlob =
    await convertFile(
      file,
      "/api/powerpoint-to-pdf"
    );

  const responseBytes =
    new Uint8Array(
      await responseBlob.arrayBuffer()
    );

  const safeBlob =
    createSafeBlob(
      responseBlob,
      responseBytes,
      "application/pdf"
    );

  let pageCount = 0;

  try {
    const pdfDocument =
      await PDFDocument.load(
        responseBytes
      );

    pageCount =
      pdfDocument.getPageCount();
  } catch (error) {
    console.warn(
      "Could not read the generated PDF page count:",
      error
    );
  }

  return {
    blob: safeBlob,
    pageCount,
    size: safeBlob.size,
  };
}

export async function convertPdfToPowerPoint(
  file: File
): Promise<PdfToPowerPointResult> {
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
      "/api/pdf-to-powerpoint"
    );

  const responseBytes =
    new Uint8Array(
      await responseBlob.arrayBuffer()
    );

  const safeBlob =
    createSafeBlob(
      responseBlob,
      responseBytes,
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );

  return {
    blob: safeBlob,
    size: safeBlob.size,
  };
}

export const powerPointPdfService = {
  powerPointToPdf:
    convertPowerPointToPdf,

  pdfToPowerPoint:
    convertPdfToPowerPoint,
};