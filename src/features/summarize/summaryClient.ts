import { API_BASE_URL } from "@/config/api";
import { createApiError } from "@/lib/apiError";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import type { SummaryOptions } from "./summaryTypes";
import { validateSummaryJobResponse, validateSummaryResult } from "./summaryValidation";

async function readJob(response: Response) {
  if (!response.ok) throw await createApiError(response, "The summary request could not be completed.");
  return validateSummaryJobResponse(await response.json());
}

export async function createSummary(
  documentSessionId: string,
  options: SummaryOptions,
  signal?: AbortSignal,
) {
  return readJob(
    await fetchWithTimeout(
      `${API_BASE_URL}/api/document-intelligence/sessions/${encodeURIComponent(documentSessionId)}/summaries`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
        signal,
        timeoutMs: 30_000,
      },
    ),
  );
}

export async function getSummary(id: string, signal?: AbortSignal) {
  return readJob(
    await fetchWithTimeout(
      `${API_BASE_URL}/api/document-intelligence/summaries/${encodeURIComponent(id)}`,
      { signal, timeoutMs: 30_000 },
    ),
  );
}

export async function cancelSummary(id: string, signal?: AbortSignal) {
  return readJob(
    await fetchWithTimeout(
      `${API_BASE_URL}/api/document-intelligence/summaries/${encodeURIComponent(id)}`,
      { method: "DELETE", signal, timeoutMs: 30_000 },
    ),
  );
}

export async function getSummaryResult(id: string, signal?: AbortSignal) {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/document-intelligence/summaries/${encodeURIComponent(id)}/result`,
    { signal, timeoutMs: 30_000 },
  );
  if (!response.ok) throw await createApiError(response, "The summary result is not available.");
  return validateSummaryResult(await response.json());
}

export function summaryPollDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Polling cancelled.", "AbortError"));
      },
      { once: true },
    );
  });
}
