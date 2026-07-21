import type {
  Response,
} from "express";

export type PdfResponseData =
  | Buffer
  | Uint8Array;

export type PdfResponseOptions = {
  filename: string;

  disposition?:
    | "attachment"
    | "inline";

  cacheControl?: string;
};

function createSafePdfFilename(
  filename: string
): string {
  const withoutExtension =
    filename
      .trim()
      .replace(
        /\.pdf$/i,
        ""
      );

  const safeName =
    withoutExtension
      .replace(
        /[^a-zA-Z0-9._-]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      )
      .slice(
        0,
        150
      ) || "document";

  return `${safeName}.pdf`;
}

function toBuffer(
  data: PdfResponseData
): Buffer {
  return Buffer.isBuffer(data)
    ? data
    : Buffer.from(
        data
      );
}

export function sendPdfResponse(
  response: Response,
  pdfData: PdfResponseData,
  options:
    PdfResponseOptions
) {
  const pdfBuffer =
    toBuffer(pdfData);

  if (
    pdfBuffer.byteLength === 0
  ) {
    throw new Error(
      "The generated PDF is empty."
    );
  }

  const filename =
    createSafePdfFilename(
      options.filename
    );

  const disposition =
    options.disposition ??
    "attachment";

  response.setHeader(
    "Content-Type",
    "application/pdf"
  );

  response.setHeader(
    "Content-Disposition",
    `${disposition}; filename="${filename}"`
  );

  response.setHeader(
    "Content-Length",
    pdfBuffer.byteLength.toString()
  );

  response.setHeader(
    "Cache-Control",
    options.cacheControl ??
      "no-store"
  );

  response.send(
    pdfBuffer
  );
}