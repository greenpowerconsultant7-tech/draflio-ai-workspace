import { API_BASE_URL } from "@/config/api";
import { createApiError } from "@/lib/apiError";
import { downloadPdf } from "@/lib/downloadFile";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import {
  validateRedactionSessionResponse,
  type RedactionRectanglePayload,
  type RedactionSession,
} from "@/lib/redactionSessionValidation";

export {
  isTerminalRedactionSession,
  validateRedactionSessionResponse,
  type RedactionRectanglePayload,
  type RedactionSession,
  type RedactionSessionProgress,
  type RedactionSessionStage,
  type RedactionSessionStatus,
} from "@/lib/redactionSessionValidation";

export interface FinalizeRedactionPayload {
  confirmation: true;
  revision: number;
  dpi: 96 | 144 | 200;
  rectangles: RedactionRectanglePayload[];
}

async function readSession(response: Response, fallback: string): Promise<RedactionSession> {
  if (!response.ok) throw await createApiError(response, fallback);
  return validateRedactionSessionResponse(await response.json());
}

export function validateRedactionPdfFile(file: File): void {
  const extensionValid = file.name.toLowerCase().endsWith(".pdf");
  const mime = file.type.toLowerCase();
  const mimeValid =
    !mime || ["application/pdf", "application/x-pdf", "application/octet-stream"].includes(mime);
  if (!extensionValid || !mimeValid) throw new Error("Please select a PDF file.");
  if (file.size === 0) throw new Error("The selected PDF is empty.");
  if (file.size > 20 * 1024 * 1024) throw new Error("The selected PDF exceeds the 20 MB limit.");
}

export async function createRedactionSession(
  file: File,
  signal?: AbortSignal,
): Promise<RedactionSession> {
  validateRedactionPdfFile(file);
  const form = new FormData();
  form.append("file", file);
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/redaction-sessions`, {
    method: "POST",
    body: form,
    signal,
    timeoutMs: 180_000,
  });
  return readSession(response, "The redaction session could not be created.");
}

export async function getRedactionSession(
  id: string,
  signal?: AbortSignal,
): Promise<RedactionSession> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/redaction-sessions/${encodeURIComponent(id)}`,
    {
      signal,
      timeoutMs: 30_000,
    },
  );
  return readSession(response, "The redaction session status could not be retrieved.");
}

export async function finalizeRedactionSession(
  id: string,
  payload: FinalizeRedactionPayload,
  signal?: AbortSignal,
): Promise<RedactionSession> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/redaction-sessions/${encodeURIComponent(id)}/finalize`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
      timeoutMs: 30_000,
    },
  );
  return readSession(response, "Redaction finalization could not be started.");
}

export async function cancelRedactionSession(
  id: string,
  signal?: AbortSignal,
): Promise<RedactionSession> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/redaction-sessions/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      signal,
      timeoutMs: 130_000,
    },
  );
  return readSession(response, "The redaction session could not be cancelled.");
}

function safeDownloadFilename(disposition: string | null, fallback: string): string {
  const match = disposition?.match(/filename="?([^";]+)"?/i);
  const candidate = (match?.[1] ?? fallback)
    .split("")
    .map((character) => {
      const code = character.charCodeAt(0);
      return character === "/" || character === "\\" || code < 32 || code === 127 ? "-" : character;
    })
    .join("")
    .trim();
  const base = candidate.toLowerCase().endsWith(".pdf") ? candidate.slice(0, -4) : candidate;
  return `${base || "redacted-document"}.pdf`;
}

export async function downloadRedactionResult(
  id: string,
  fallbackFilename: string,
  signal?: AbortSignal,
): Promise<{ blob: Blob; filename: string }> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/redaction-sessions/${encodeURIComponent(id)}/result`,
    { signal, timeoutMs: 180_000 },
  );
  if (!response.ok)
    throw await createApiError(response, "The redacted PDF could not be downloaded.");
  const contentType = response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/pdf" && contentType !== "application/x-pdf") {
    throw new Error("The redaction server returned an unexpected result type.");
  }
  const blob = await response.blob();
  if (blob.size === 0) throw new Error("The redaction server returned an empty PDF.");
  const signature = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  if (new TextDecoder("ascii").decode(signature) !== "%PDF-") {
    throw new Error("The redaction server returned an invalid PDF.");
  }
  return {
    blob,
    filename: safeDownloadFilename(response.headers.get("Content-Disposition"), fallbackFilename),
  };
}

export function saveRedactionResult(result: { blob: Blob; filename: string }): void {
  downloadPdf(result.blob, result.filename);
}

export function abortablePollDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = 0;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      callback();
    };
    const abort = () =>
      finish(() => reject(new DOMException("Redaction polling was cancelled.", "AbortError")));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    timer = window.setTimeout(() => finish(resolve), milliseconds);
  });
}
