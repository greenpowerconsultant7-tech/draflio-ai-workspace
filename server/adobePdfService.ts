import "./httpClient";

import {
  env,
} from "./env";

const ADOBE_API_BASE =
  "https://pdf-services.adobe.io";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const PDF_MIME =
  "application/pdf";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export type OcrPdfOptions = {
  language: string;
};

type AdobeCredentials = {
  clientId: string;
  clientSecret: string;
};

type AccessTokenResponse = {
  access_token?: string;
};

type AssetResponse = {
  assetID?: string;
  uploadUri?: string;
};

type AdobeJobAsset = {
  assetID?: string;
  downloadUri?: string;

  metadata?: {
    type?: string;
    size?: number;
  };
};

type JobStatusResponse = {
  status?: string;
  asset?: AdobeJobAsset;

  error?: {
    code?: string;
    message?: string;
    status?: number;
  };
};

type ErrorLike = {
  code?: unknown;
  cause?: unknown;
};

function getCredentials(): AdobeCredentials {
  return {
    clientId:
      env.adobeClientId,

    clientSecret:
      env.adobeClientSecret,
  };
}

function bufferToArrayBuffer(
  buffer: Buffer
): ArrayBuffer {
  const arrayBuffer =
    new ArrayBuffer(buffer.byteLength);

  const view =
    new Uint8Array(arrayBuffer);

  view.set(buffer);

  return arrayBuffer;
}

async function getResponseError(
  response: Response
): Promise<string> {
  const fallback =
    `Adobe request failed with status ${response.status}.`;

  try {
    const text =
      await response.text();

    if (!text) {
      return fallback;
    }

    try {
      const json =
        JSON.parse(text) as {
          error?:
            | string
            | {
                message?: string;
                code?: string;
              };

          message?: string;
        };

      if (
        typeof json.error ===
        "string"
      ) {
        return json.error;
      }

      if (
        typeof json.error ===
          "object" &&
        json.error?.message
      ) {
        return json.error.message;
      }

      if (json.message) {
        return json.message;
      }

      return text;
    } catch {
      return text;
    }
  } catch {
    return fallback;
  }
}

function wait(
  milliseconds: number
): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(
      resolve,
      milliseconds
    );
  });
}

function getNetworkErrorCode(
  error: unknown
): string | undefined {
  if (
    typeof error !== "object" ||
    error === null
  ) {
    return undefined;
  }

  const candidate =
    error as ErrorLike;

  if (
    typeof candidate.code ===
    "string"
  ) {
    return candidate.code;
  }

  return getNetworkErrorCode(
    candidate.cause
  );
}

function isRetryableNetworkError(
  error: unknown
): boolean {
  const errorCode =
    getNetworkErrorCode(error);

  const retryableCodes =
    new Set([
      "ECONNRESET",
      "ETIMEDOUT",
      "EAI_AGAIN",
      "ENETUNREACH",
      "ECONNREFUSED",
      "EPIPE",
      "UND_ERR_SOCKET",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_HEADERS_TIMEOUT",
      "UND_ERR_BODY_TIMEOUT",
    ]);

  return (
    error instanceof TypeError ||
    (
      errorCode !== undefined &&
      retryableCodes.has(
        errorCode
      )
    )
  );
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maximumAttempts = 10
): Promise<Response> {
  const retryableStatuses =
    new Set([
      408,
      425,
      429,
      500,
      502,
      503,
      504,
    ]);

  let lastError: unknown;

  for (
    let attempt = 1;
    attempt <= maximumAttempts;
    attempt++
  ) {
    try {
      const response =
        await fetch(url, init);

      const shouldRetry =
        retryableStatuses.has(
          response.status
        );

      if (!shouldRetry) {
        return response;
      }

      if (
        attempt === maximumAttempts
      ) {
        return response;
      }

      /*
        Consume the response before
        starting another request.
      */
      await response
        .arrayBuffer()
        .catch(() => undefined);

      const delay =
        Math.min(
          1000 *
            2 ** (attempt - 1),
          15_000
        );

      console.warn(
        `[Adobe REST] HTTP ${response.status}. Retry ${attempt}/${maximumAttempts} in ${delay}ms...`
      );

      await wait(delay);
    } catch (error) {
      lastError = error;

      const errorCode =
        getNetworkErrorCode(
          error
        );

      if (
        !isRetryableNetworkError(
          error
        ) ||
        attempt === maximumAttempts
      ) {
        throw error;
      }

      const delay =
        Math.min(
          1000 *
            2 ** (attempt - 1),
          15_000
        );

      console.warn(
        `[Adobe REST] Network error ${
          errorCode ?? "fetch failed"
        }. Retry ${attempt}/${maximumAttempts} in ${delay}ms...`
      );

      await wait(delay);
    }
  }

  throw (
    lastError ??
    new Error(
      "Adobe request failed after multiple attempts."
    )
  );
}

async function getAccessToken(
  credentials: AdobeCredentials
): Promise<string> {
  console.log(
    "[Adobe REST] Requesting access token..."
  );

  const body =
    new URLSearchParams();

  body.set(
    "client_id",
    credentials.clientId
  );

  body.set(
    "client_secret",
    credentials.clientSecret
  );

  const response = await fetchWithRetry(
    `${ADOBE_API_BASE}/token`,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },

      body,
    }
  );

  if (!response.ok) {
    throw new Error(
      await getResponseError(
        response
      )
    );
  }

  const result =
    await response.json() as AccessTokenResponse;

  if (!result.access_token) {
    throw new Error(
      "Adobe authentication succeeded but returned no access token."
    );
  }

  console.log(
    "[Adobe REST] Authentication successful."
  );

  return result.access_token;
}

async function createUploadAsset(
  accessToken: string,
  clientId: string,
  mediaType: string
): Promise<{
  assetID: string;
  uploadUri: string;
}> {
  console.log(
    "[Adobe REST] Creating upload asset..."
  );

  const response = await fetchWithRetry(
    `${ADOBE_API_BASE}/assets`,
    {
      method: "POST",

      headers: {
        Authorization:
          `Bearer ${accessToken}`,

        "X-API-Key":
          clientId,

        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        mediaType,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      await getResponseError(
        response
      )
    );
  }

  const result =
    await response.json() as AssetResponse;

  if (
    !result.assetID ||
    !result.uploadUri
  ) {
    throw new Error(
      "Adobe did not return an asset ID or upload URL."
    );
  }

  return {
    assetID: result.assetID,
    uploadUri: result.uploadUri,
  };
}

async function uploadFile(
  uploadUri: string,
  inputBuffer: Buffer,
  mediaType: string
): Promise<void> {
  console.log(
    "[Adobe REST] Uploading document..."
  );

  const response = await fetchWithRetry(
    uploadUri,
    {
      method: "PUT",

      headers: {
        "Content-Type":
          mediaType,
      },

      body:
        bufferToArrayBuffer(
          inputBuffer
        ),
    }
  );

  if (!response.ok) {
    throw new Error(
      await getResponseError(
        response
      )
    );
  }

  console.log(
    "[Adobe REST] Upload complete."
  );
}

async function submitJob(
  operationPath: string,
  requestBody: Record<
    string,
    unknown
  >,
  accessToken: string,
  clientId: string
): Promise<string> {
  console.log(
    "[Adobe REST] Submitting conversion job..."
  );

  const response = await fetchWithRetry(
    `${ADOBE_API_BASE}${operationPath}`,
    {
      method: "POST",

      headers: {
        Authorization:
          `Bearer ${accessToken}`,

        "X-API-Key":
          clientId,

        "Content-Type":
          "application/json",
      },

      body:
        JSON.stringify(
          requestBody
        ),
    }
  );

  if (!response.ok) {
    throw new Error(
      await getResponseError(
        response
      )
    );
  }

  const location =
    response.headers.get(
      "location"
    );

  if (!location) {
    throw new Error(
      "Adobe accepted the job but returned no status URL."
    );
  }

  console.log(
    "[Adobe REST] Job submitted."
  );

  return new URL(
    location,
    ADOBE_API_BASE
  ).toString();
}

async function waitForJob(
  statusUrl: string,
  accessToken: string,
  clientId: string
): Promise<string> {
  const maximumPollingAttempts =
    150;

  const pollingInterval =
    2000;

  for (
    let attempt = 1;
    attempt <= maximumPollingAttempts;
    attempt++
  ) {
    const response =
      await fetchWithRetry(
        statusUrl,
        {
          method: "GET",

          headers: {
            Authorization:
              `Bearer ${accessToken}`,

            "X-API-Key":
              clientId,
          },
        }
      );

    if (!response.ok) {
      throw new Error(
        await getResponseError(
          response
        )
      );
    }

    const result =
      await response.json() as JobStatusResponse;

    const status =
      result.status
        ?.trim()
        .toLowerCase();

    console.log(
      `[Adobe REST] Job status: ${status ?? "unknown"}`
    );

    if (status === "done") {
      const downloadUri =
        result.asset?.downloadUri;

      if (!downloadUri) {
        throw new Error(
          "Adobe completed the conversion but returned no download URL."
        );
      }

      return downloadUri;
    }

    if (status === "failed") {
      throw new Error(
        result.error?.message ??
        result.error?.code ??
        "Adobe document conversion failed."
      );
    }

    await wait(
      pollingInterval
    );
  }

  throw new Error(
    "Adobe conversion did not finish within five minutes."
  );
}

async function downloadResult(
  downloadUri: string
): Promise<Buffer> {
  console.log(
    "[Adobe REST] Downloading converted document..."
  );

  const response =
    await fetchWithRetry(
      downloadUri,
      {
        method: "GET",
      }
    );

  if (!response.ok) {
    throw new Error(
      await getResponseError(
        response
      )
    );
  }

  const arrayBuffer =
    await response.arrayBuffer();

  console.log(
    "[Adobe REST] Conversion complete."
  );

  return Buffer.from(
    arrayBuffer
  );
}

async function runConversion(
  inputBuffer: Buffer,
  inputMediaType: string,
  operationPath: string,
  createJobBody: (
    assetID: string
  ) => Record<string, unknown>
): Promise<Buffer> {
  const totalStartedAt =
    Date.now();

  function logDuration(
    stage: string,
    startedAt: number
  ) {
    const durationSeconds =
      (
        (
          Date.now() -
          startedAt
        ) /
        1000
      ).toFixed(2);

    console.log(
      `[Adobe REST] ${stage}: ${durationSeconds}s`
    );
  }

  const credentials =
    getCredentials();

  const authenticationStartedAt =
    Date.now();

  const accessToken =
    await getAccessToken(
      credentials
    );

  logDuration(
    "Authentication time",
    authenticationStartedAt
  );

  const assetStartedAt =
    Date.now();

  const asset =
    await createUploadAsset(
      accessToken,
      credentials.clientId,
      inputMediaType
    );

  logDuration(
    "Asset creation time",
    assetStartedAt
  );

  const uploadStartedAt =
    Date.now();

  await uploadFile(
    asset.uploadUri,
    inputBuffer,
    inputMediaType
  );

  logDuration(
    "Upload time",
    uploadStartedAt
  );

  const submissionStartedAt =
    Date.now();

  const statusUrl =
    await submitJob(
      operationPath,
      createJobBody(
        asset.assetID
      ),
      accessToken,
      credentials.clientId
    );

  logDuration(
    "Job submission time",
    submissionStartedAt
  );

  const processingStartedAt =
    Date.now();

  const downloadUri =
    await waitForJob(
      statusUrl,
      accessToken,
      credentials.clientId
    );

  logDuration(
    "Adobe processing time",
    processingStartedAt
  );

  const downloadStartedAt =
    Date.now();

  const result =
    await downloadResult(
      downloadUri
    );

  logDuration(
    "Result download time",
    downloadStartedAt
  );

  logDuration(
    "Total conversion time",
    totalStartedAt
  );

  return result;
}

export async function convertDocxToPdf(
  inputBuffer: Buffer
): Promise<Buffer> {
  console.log(
    "[Adobe REST] Starting Word → PDF conversion."
  );

  return runConversion(
    inputBuffer,
    DOCX_MIME,
    "/operation/createpdf",
    (assetID) => ({
      assetID,
    })
  );
}

export async function convertPdfToDocx(
  inputBuffer: Buffer
): Promise<Buffer> {
  console.log(
    "[Adobe REST] Starting PDF → Word conversion."
  );

  return runConversion(
    inputBuffer,
    PDF_MIME,
    "/operation/exportpdf",
    (assetID) => ({
      assetID,
      targetFormat: "docx",
    })
  );
}

export async function convertXlsxToPdf(
  inputBuffer: Buffer
): Promise<Buffer> {
  console.log(
    "[Adobe REST] Starting Excel → PDF conversion."
  );

  return runConversion(
    inputBuffer,
    XLSX_MIME,
    "/operation/createpdf",
    (assetID) => ({
      assetID,
    })
  );
}

export async function convertPdfToXlsx(
  inputBuffer: Buffer
): Promise<Buffer> {
  console.log(
    "[Adobe REST] Starting PDF → Excel conversion."
  );

  return runConversion(
    inputBuffer,
    PDF_MIME,
    "/operation/exportpdf",
    (assetID) => ({
      assetID,
      targetFormat: "xlsx",
    })
  );
}
export async function convertPptxToPdf(
  inputBuffer: Buffer
): Promise<Buffer> {
  console.log(
    "[Adobe REST] Starting PowerPoint → PDF conversion."
  );

  return runConversion(
    inputBuffer,
    PPTX_MIME,
    "/operation/createpdf",
    (assetID) => ({
      assetID,
    })
  );
}

export async function convertPdfToPptx(
  inputBuffer: Buffer
): Promise<Buffer> {
  console.log(
    "[Adobe REST] Starting PDF → PowerPoint conversion."
  );

  return runConversion(
    inputBuffer,
    PDF_MIME,
    "/operation/exportpdf",
    (assetID) => ({
      assetID,
      targetFormat: "pptx",
    })
  );
}
export async function convertPdfWithOcr(
  inputBuffer: Buffer,
  options: OcrPdfOptions
): Promise<Buffer> {
  console.log(
    "[Adobe REST] Starting PDF OCR conversion."
  );

  return runConversion(
    inputBuffer,
    PDF_MIME,
    "/operation/ocr",
    (assetID) => ({
      assetID,
      ocrLang:
        options.language,
    })
  );
}