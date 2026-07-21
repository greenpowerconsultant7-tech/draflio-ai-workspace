import {
  API_BASE_URL,
} from "@/config/api";

import {
  createApiError,
} from "@/lib/apiError";

import {
  fetchWithTimeout,
} from "@/lib/fetchWithTimeout";

export type HtmlPdfPageFormat =
  | "A4"
  | "Letter"
  | "Legal";

export type HtmlPdfOrientation =
  | "portrait"
  | "landscape";

export type HtmlPdfMargin = {
  top: string;
  right: string;
  bottom: string;
  left: string;
};

export type HtmlPdfFormData = {
  html: string;
  css: string;
  filename: string;

  format: HtmlPdfPageFormat;
  orientation: HtmlPdfOrientation;

  margin: HtmlPdfMargin;

  printBackground: boolean;
  displayHeaderFooter: boolean;
  preferCssPageSize: boolean;

  headerHtml: string;
  footerHtml: string;

  scale: number;
};

export type HtmlPdfResult = {
  blob: Blob;
  filename: string;
  size: number;
};

type HtmlPdfApiPayload = {
  html: string;
  css?: string;
  filename?: string;

  options: {
    format: HtmlPdfPageFormat;
    orientation: HtmlPdfOrientation;

    margin: HtmlPdfMargin;

    printBackground: boolean;
    displayHeaderFooter: boolean;
    preferCssPageSize: boolean;

    headerHtml?: string;
    footerHtml?: string;

    scale: number;
  };
};

function optionalText(
  value: string
): string | undefined {
  const trimmedValue =
    value.trim();

  return trimmedValue
    ? trimmedValue
    : undefined;
}

function createPayload(
  data: HtmlPdfFormData
): HtmlPdfApiPayload {
  return {
    html: data.html,

    css:
      optionalText(
        data.css
      ),

    filename:
      optionalText(
        data.filename
      ),

    options: {
      format:
        data.format,

      orientation:
        data.orientation,

      margin: {
        top:
          data.margin.top,

        right:
          data.margin.right,

        bottom:
          data.margin.bottom,

        left:
          data.margin.left,
      },

      printBackground:
        data.printBackground,

      displayHeaderFooter:
        data.displayHeaderFooter,

      preferCssPageSize:
        data.preferCssPageSize,

      headerHtml:
        optionalText(
          data.headerHtml
        ),

      footerHtml:
        optionalText(
          data.footerHtml
        ),

      scale:
        data.scale,
    },
  };
}

function getDownloadFilename(
  response: Response,
  requestedFilename: string
) {
  const contentDisposition =
    response.headers.get(
      "Content-Disposition"
    );

  const filenameMatch =
    contentDisposition?.match(
      /filename="([^"]+)"/i
    );

  if (filenameMatch?.[1]) {
    return filenameMatch[1];
  }

  const safeFilename =
    requestedFilename
      .replace(
        /\.pdf$/i,
        ""
      )
      .replace(
        /[^a-zA-Z0-9._-]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      ) || "document";

  return `${safeFilename}.pdf`;
}

function validateMargin(
  value: string,
  fieldName: string
) {
  const margin =
    value.trim();

  const valid =
    margin === "0" ||
    /^\d+(\.\d+)?(px|mm|cm|in|pt)$/i.test(
      margin
    );

  if (!valid) {
    throw new Error(
      `${fieldName} must use px, mm, cm, in, or pt.`
    );
  }
}

function validateHtmlPdfData(
  data: HtmlPdfFormData
) {
  if (!data.html.trim()) {
    throw new Error(
      "HTML content is required."
    );
  }

  if (
    data.html.length >
    1_000_000
  ) {
    throw new Error(
      "HTML content is too large."
    );
  }

  if (
    data.css.length >
    500_000
  ) {
    throw new Error(
      "CSS content is too large."
    );
  }

  if (
    data.headerHtml.length >
    100_000
  ) {
    throw new Error(
      "Header HTML is too large."
    );
  }

  if (
    data.footerHtml.length >
    100_000
  ) {
    throw new Error(
      "Footer HTML is too large."
    );
  }

  if (
    !Number.isFinite(
      data.scale
    ) ||
    data.scale < 0.1 ||
    data.scale > 2
  ) {
    throw new Error(
      "PDF scale must be between 0.1 and 2."
    );
  }

  validateMargin(
    data.margin.top,
    "Top margin"
  );

  validateMargin(
    data.margin.right,
    "Right margin"
  );

  validateMargin(
    data.margin.bottom,
    "Bottom margin"
  );

  validateMargin(
    data.margin.left,
    "Left margin"
  );
}

export type HtmlPdfGenerateOptions = {
  signal?: AbortSignal;
};

class HtmlPdfService {
 async generate(
  data: HtmlPdfFormData,
  options: HtmlPdfGenerateOptions = {}
): Promise<HtmlPdfResult> {
    validateHtmlPdfData(
      data
    );

    const payload =
      createPayload(data);

    let response: Response;

    try {
      response = await fetchWithTimeout(
        `${API_BASE_URL}/api/html-to-pdf`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify(
              payload
            ),
            timeoutMs: 180_000,

            signal: options.signal,
        }
      );
    } catch (error) {
      console.error(
        "HTML-to-PDF API request failed:",
        error
      );

      throw new Error(
        "Could not connect to the HTML-to-PDF server. Make sure the backend is running on port 3001."
      );
    }

   if (!response.ok) {
  throw await createApiError(
    response,
    "The HTML could not be converted to PDF."
  );
}

    const blob =
      await response.blob();

    if (blob.size === 0) {
      throw new Error(
        "The server returned an empty PDF."
      );
    }

    return {
      blob,

      filename:
        getDownloadFilename(
          response,
          data.filename
        ),

      size:
        blob.size,
    };
  }
}

export const htmlPdfService =
  new HtmlPdfService();