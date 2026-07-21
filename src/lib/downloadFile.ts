export type DownloadableData =
  | Blob
  | ArrayBuffer
  | Uint8Array;

export type DownloadFileOptions = {
  filename: string;
  mimeType?: string;
  revokeDelayMs?: number;
};

function createSafeFilename(
  filename: string
): string {
  const trimmedFilename =
    filename.trim();

  if (!trimmedFilename) {
    return "download";
  }

  return trimmedFilename
    .replace(
      /[<>:"/\\|?*\u0000-\u001F]/g,
      "-"
    )
    .replace(
      /\s+/g,
      " "
    )
    .replace(
      /^\.+|\.+$/g,
      ""
    )
    .slice(0, 180) || "download";
}

function toBlob(
  data: DownloadableData,
  mimeType?: string
): Blob {
  if (data instanceof Blob) {
    if (
      mimeType &&
      data.type !== mimeType
    ) {
      return new Blob(
        [data],
        {
          type: mimeType,
        }
      );
    }

    return data;
  }

  if (
    data instanceof
    ArrayBuffer
  ) {
    return new Blob(
      [data],
      {
        type:
          mimeType ??
          "application/octet-stream",
      }
    );
  }

const copiedBuffer =
  new ArrayBuffer(
    data.byteLength
  );

new Uint8Array(
  copiedBuffer
).set(data);

return new Blob(
  [copiedBuffer],
  {
    type:
      mimeType ??
      "application/octet-stream",
  }
);
}

export function downloadFile(
  data: DownloadableData,
  options: DownloadFileOptions
) {
  const blob =
    toBlob(
      data,
      options.mimeType
    );

  if (blob.size === 0) {
    throw new Error(
      "The file is empty and cannot be downloaded."
    );
  }

  const objectUrl =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = objectUrl;

  link.download =
    createSafeFilename(
      options.filename
    );

  link.style.display =
    "none";

  document.body.appendChild(
    link
  );

  link.click();
  link.remove();

  window.setTimeout(
    () => {
      URL.revokeObjectURL(
        objectUrl
      );
    },
    options.revokeDelayMs ??
      1_000
  );
}

export function downloadPdf(
  data: DownloadableData,
  filename: string
) {
  downloadFile(
    data,
    {
      filename:
        filename
          .toLowerCase()
          .endsWith(".pdf")
          ? filename
          : `${filename}.pdf`,

      mimeType:
        "application/pdf",
    }
  );
}

export function downloadDocx(
  data: DownloadableData,
  filename: string
) {
  downloadFile(
    data,
    {
      filename:
        filename
          .toLowerCase()
          .endsWith(".docx")
          ? filename
          : `${filename}.docx`,

      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
  );
}
