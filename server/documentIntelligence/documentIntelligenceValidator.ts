import { basename } from "node:path";
import { ApiError } from "../errors/apiError.js";
import { DOCUMENT_INTELLIGENCE_LIMITS } from "./documentIntelligenceSessionStore.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateDocumentIntelligenceSessionId(value: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new ApiError({
      statusCode: 400,
      code: "INVALID_DOCUMENT_INTELLIGENCE_SESSION_ID",
      message: "The document session ID is invalid.",
    });
  }
  return value;
}

export function sanitizeDocumentIntelligenceFilename(value: string) {
  const safeBase = basename(value)
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .replace(/[/\\:*?"<>|]+/g, "-")
    .slice(0, 180);
  return safeBase || "document.pdf";
}

export function validateDocumentIntelligenceUpload(
  file:
    | Pick<Express.Multer.File, "size" | "buffer" | "mimetype" | "originalname">
    | undefined,
) {
  if (!file) {
    throw new ApiError({
      statusCode: 400,
      code: "INVALID_DOCUMENT_INTELLIGENCE_FILE",
      message: "Select a valid PDF.",
    });
  }
  if (file.size <= 0 || file.buffer.byteLength <= 0) {
    throw new ApiError({
      statusCode: 400,
      code: "INVALID_DOCUMENT_INTELLIGENCE_FILE",
      message: "Select a valid PDF.",
    });
  }
  if (file.size > DOCUMENT_INTELLIGENCE_LIMITS.maximumInputBytes) {
    throw new ApiError({
      statusCode: 413,
      code: "DOCUMENT_INTELLIGENCE_FILE_TOO_LARGE",
      message: "The PDF exceeds the 20 MB size limit.",
    });
  }
  const mime = file.mimetype.toLowerCase();
  if (
    !file.originalname.toLowerCase().endsWith(".pdf") ||
    !["application/pdf", "application/x-pdf", "application/octet-stream", ""].includes(mime)
  ) {
    throw new ApiError({
      statusCode: 400,
      code: "INVALID_DOCUMENT_INTELLIGENCE_FILE",
      message: "Select a valid PDF.",
    });
  }
  const bytes = file.buffer;
  if (
    bytes.length < 5 ||
    bytes[0] !== 0x25 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x44 ||
    bytes[3] !== 0x46 ||
    bytes[4] !== 0x2d
  ) {
    throw new ApiError({
      statusCode: 400,
      code: "INVALID_DOCUMENT_INTELLIGENCE_FILE",
      message: "Select a valid PDF.",
    });
  }
  return {
    filename: sanitizeDocumentIntelligenceFilename(file.originalname),
    bytes: Uint8Array.from(file.buffer),
  };
}
