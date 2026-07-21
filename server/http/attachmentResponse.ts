import type { Response } from "express";

import { basename } from "node:path";

export type AttachmentResponseOptions = {
  filename: string;
  mediaType: string;
  extension: string;
  cacheControl?: string;
};

function createSafeAttachmentFilename(filename: string, extension: string) {
  const normalizedExtension = extension.startsWith(".") ? extension : `.${extension}`;
  const uploadedBasename = basename(filename.replace(/\\/g, "/"))
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);

      return code > 31 && code !== 127;
    })
    .join("")
    .trim();
  const withoutExtension = uploadedBasename
    .toLowerCase()
    .endsWith(normalizedExtension.toLowerCase())
    ? uploadedBasename.slice(0, -normalizedExtension.length)
    : uploadedBasename;
  const safeName =
    withoutExtension
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 150) || "document";

  return `${safeName}${normalizedExtension}`;
}

export function sendAttachmentResponse(
  response: Response,
  data: Buffer | Uint8Array,
  options: AttachmentResponseOptions,
) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

  if (buffer.byteLength === 0) {
    throw new Error("The generated attachment is empty.");
  }

  const filename = createSafeAttachmentFilename(options.filename, options.extension);

  response.setHeader("Content-Type", options.mediaType);
  response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  response.setHeader("Content-Length", buffer.byteLength.toString());
  response.setHeader("Cache-Control", options.cacheControl ?? "no-store");
  response.send(buffer);
}
