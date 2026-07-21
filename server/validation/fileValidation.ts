import {
  badRequest,
  payloadTooLarge,
  unsupportedMediaType,
  unprocessableContent,
} from "../errors/apiError";

export type UploadedFile =
  Express.Multer.File;

export type FileValidationOptions = {
  fieldName?: string;

  allowedMimeTypes?:
    readonly string[];

  allowedExtensions?:
    readonly string[];

  maximumSizeBytes?: number;

  requireNonEmpty?: boolean;
};

export type FileListValidationOptions =
  FileValidationOptions & {
    minimumFiles?: number;
    maximumFiles?: number;
  };

const PDF_MIME_TYPES = [
  "application/pdf",
  "application/x-pdf",
] as const;

const PDF_EXTENSIONS = [
  ".pdf",
] as const;

function normalizeExtension(
  extension: string
): string {
  const normalized =
    extension
      .trim()
      .toLowerCase();

  if (!normalized) {
    return "";
  }

  return normalized.startsWith(".")
    ? normalized
    : `.${normalized}`;
}

function getFileExtension(
  filename: string
): string {
  const lastDotIndex =
    filename.lastIndexOf(".");

  if (
    lastDotIndex < 0 ||
    lastDotIndex ===
      filename.length - 1
  ) {
    return "";
  }

  return filename
    .slice(lastDotIndex)
    .toLowerCase();
}

function formatMegabytes(
  bytes: number
): string {
  return (
    bytes /
    1024 /
    1024
  ).toFixed(1);
}

function validateFileSize(
  file: UploadedFile,
  maximumSizeBytes?: number,
  requireNonEmpty = true
) {
  if (
    requireNonEmpty &&
    file.size <= 0
  ) {
    throw unprocessableContent(
      `The uploaded file "${file.originalname}" is empty.`
    );
  }

  if (
    maximumSizeBytes !==
      undefined &&
    file.size >
      maximumSizeBytes
  ) {
    throw payloadTooLarge(
      `The uploaded file "${file.originalname}" exceeds the ${formatMegabytes(
        maximumSizeBytes
      )} MB size limit.`
    );
  }
}

function validateFileExtension(
  file: UploadedFile,
  allowedExtensions?:
    readonly string[]
) {
  if (
    !allowedExtensions ||
    allowedExtensions.length ===
      0
  ) {
    return;
  }

  const normalizedAllowedExtensions =
    allowedExtensions.map(
      normalizeExtension
    );

  const fileExtension =
    getFileExtension(
      file.originalname
    );

  if (
    !normalizedAllowedExtensions.includes(
      fileExtension
    )
  ) {
    throw unsupportedMediaType(
      `The file "${file.originalname}" has an unsupported extension. Allowed extensions: ${normalizedAllowedExtensions.join(
        ", "
      )}.`
    );
  }
}

function validateMimeType(
  file: UploadedFile,
  allowedMimeTypes?:
    readonly string[]
) {
  if (
    !allowedMimeTypes ||
    allowedMimeTypes.length ===
      0
  ) {
    return;
  }

  const normalizedMimeType =
    file.mimetype
      .trim()
      .toLowerCase();

  const normalizedAllowedMimeTypes =
    allowedMimeTypes.map(
      (mimeType) =>
        mimeType
          .trim()
          .toLowerCase()
    );

  const genericMimeTypes = [
    "",
    "application/octet-stream",
  ];

  if (
    genericMimeTypes.includes(
      normalizedMimeType
    )
  ) {
    return;
  }

  if (
    !normalizedAllowedMimeTypes.includes(
      normalizedMimeType
    )
  ) {
    throw unsupportedMediaType(
      `The file "${file.originalname}" has an unsupported type.`
    );
  }
}

function hasPdfSignature(
  buffer: Buffer
): boolean {
  if (buffer.length < 5) {
    return false;
  }

  const searchLength =
    Math.min(
      buffer.length,
      1024
    );

  const header =
    buffer
      .subarray(
        0,
        searchLength
      )
      .toString(
        "latin1"
      );

  return header.includes(
    "%PDF-"
  );
}

export function requireUploadedFile(
  file:
    | UploadedFile
    | undefined,
  fieldName = "file"
): UploadedFile {
  if (!file) {
    throw badRequest(
      `A file is required in the "${fieldName}" field.`
    );
  }

  return file;
}

export function validateUploadedFile(
  file:
    | UploadedFile
    | undefined,
  options:
    FileValidationOptions = {}
): UploadedFile {
  const uploadedFile =
    requireUploadedFile(
      file,
      options.fieldName ??
        "file"
    );

  validateFileSize(
    uploadedFile,
    options.maximumSizeBytes,
    options.requireNonEmpty ??
      true
  );

  validateFileExtension(
    uploadedFile,
    options.allowedExtensions
  );

  validateMimeType(
    uploadedFile,
    options.allowedMimeTypes
  );

  return uploadedFile;
}

export function validateUploadedFiles(
  files:
    | UploadedFile[]
    | undefined,
  options:
    FileListValidationOptions = {}
): UploadedFile[] {
  const uploadedFiles =
    files ?? [];

  const minimumFiles =
    options.minimumFiles ?? 1;

  const maximumFiles =
    options.maximumFiles ??
    Number.MAX_SAFE_INTEGER;

  if (
    uploadedFiles.length <
    minimumFiles
  ) {
    throw badRequest(
      `At least ${minimumFiles} file${
        minimumFiles === 1
          ? ""
          : "s"
      } must be uploaded.`
    );
  }

  if (
    uploadedFiles.length >
    maximumFiles
  ) {
    throw badRequest(
      `No more than ${maximumFiles} file${
        maximumFiles === 1
          ? ""
          : "s"
      } may be uploaded.`
    );
  }

  return uploadedFiles.map(
    (file) =>
      validateUploadedFile(
        file,
        options
      )
  );
}

export function validatePdfFile(
  file:
    | UploadedFile
    | undefined,
  options: Omit<
    FileValidationOptions,
    | "allowedMimeTypes"
    | "allowedExtensions"
  > = {}
): UploadedFile {
  const uploadedFile =
    validateUploadedFile(
      file,
      {
        ...options,

        allowedMimeTypes:
          PDF_MIME_TYPES,

        allowedExtensions:
          PDF_EXTENSIONS,
      }
    );

  if (
    !hasPdfSignature(
      uploadedFile.buffer
    )
  ) {
    throw unsupportedMediaType(
      `The file "${uploadedFile.originalname}" does not contain a valid PDF signature.`
    );
  }

  return uploadedFile;
}

export function validatePdfFiles(
  files:
    | UploadedFile[]
    | undefined,
  options: Omit<
    FileListValidationOptions,
    | "allowedMimeTypes"
    | "allowedExtensions"
  > = {}
): UploadedFile[] {
  const uploadedFiles =
    files ?? [];

  const minimumFiles =
    options.minimumFiles ?? 1;

  const maximumFiles =
    options.maximumFiles ??
    Number.MAX_SAFE_INTEGER;

  if (
    uploadedFiles.length <
    minimumFiles
  ) {
    throw badRequest(
      `At least ${minimumFiles} PDF file${
        minimumFiles === 1
          ? ""
          : "s"
      } must be uploaded.`
    );
  }

  if (
    uploadedFiles.length >
    maximumFiles
  ) {
    throw badRequest(
      `No more than ${maximumFiles} PDF file${
        maximumFiles === 1
          ? ""
          : "s"
      } may be uploaded.`
    );
  }

  return uploadedFiles.map(
    (file) =>
      validatePdfFile(
        file,
        options
      )
  );
}