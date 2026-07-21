export class DownloadService {
  downloadBlob(
    blob: Blob,
    filename: string
  ) {
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);
  }

  downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mimeType: string
) {
  const blob = new Blob(
    [new Uint8Array(bytes)],
    {
      type: mimeType,
    }
  );

  this.downloadBlob(blob, filename);
}}