import type {
  HtmlPdfMargin,
  HtmlPdfOptions,
  HtmlPdfOrientation,
  HtmlPdfPageFormat,
  ValidatedHtmlPdfRequest,
} from "./htmlPdfTypes";

function isObject(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function requiredString(
  value: unknown,
  fieldName: string
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${fieldName} is required.`
    );
  }

  return value.trim();
}

function optionalString(
  value: unknown
): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function booleanValue(
  value: unknown,
  defaultValue: boolean
): boolean {
  return typeof value === "boolean"
    ? value
    : defaultValue;
}

function numberValue(
  value: unknown,
  defaultValue: number,
  minimum: number,
  maximum: number,
  fieldName: string
): number {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return defaultValue;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `${fieldName} must be between ${minimum} and ${maximum}.`
    );
  }

  return value;
}

function validatePageFormat(
  value: unknown
): HtmlPdfPageFormat {
  if (
    value === "A4" ||
    value === "Letter" ||
    value === "Legal"
  ) {
    return value;
  }

  return "A4";
}

function validateOrientation(
  value: unknown
): HtmlPdfOrientation {
  if (
    value === "portrait" ||
    value === "landscape"
  ) {
    return value;
  }

  return "portrait";
}

function validateMarginValue(
  value: unknown,
  fieldName: string,
  defaultValue: string
): string {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return defaultValue;
  }

  if (typeof value !== "string") {
    throw new Error(
      `${fieldName} must be a CSS measurement.`
    );
  }

  const margin =
    value.trim();

  /*
    Supported examples:

    0
    12px
    20mm
    2cm
    0.5in
    24pt
  */
  const isValid =
    margin === "0" ||
    /^\d+(\.\d+)?(px|mm|cm|in|pt)$/i.test(
      margin
    );

  if (!isValid) {
    throw new Error(
      `${fieldName} must use px, mm, cm, in, or pt.`
    );
  }

  return margin;
}

function validateMargins(
  value: unknown
): HtmlPdfMargin {
  const marginObject =
    isObject(value)
      ? value
      : {};

  return {
    top: validateMarginValue(
      marginObject.top,
      "Top margin",
      "20mm"
    ),

    right: validateMarginValue(
      marginObject.right,
      "Right margin",
      "15mm"
    ),

    bottom: validateMarginValue(
      marginObject.bottom,
      "Bottom margin",
      "20mm"
    ),

    left: validateMarginValue(
      marginObject.left,
      "Left margin",
      "15mm"
    ),
  };
}

function createSafeFilename(
  value: unknown
): string {
  const requestedFilename =
    typeof value === "string"
      ? value.trim()
      : "";

  const baseName =
    requestedFilename
      .replace(/\.pdf$/i, "")
      .replace(
        /[^a-zA-Z0-9._-]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      )
      .slice(0, 120);

  return `${
    baseName || "document"
  }.pdf`;
}

function validateOptions(
  value: unknown,
  hasHeaderOrFooter: boolean
): HtmlPdfOptions {
  const options =
    isObject(value)
      ? value
      : {};

  return {
    format:
      validatePageFormat(
        options.format
      ),

    orientation:
      validateOrientation(
        options.orientation
      ),

    margin:
      validateMargins(
        options.margin
      ),

    printBackground:
      booleanValue(
        options.printBackground,
        true
      ),

    headerHtml:
      optionalString(
        options.headerHtml
      ) || undefined,

    footerHtml:
      optionalString(
        options.footerHtml
      ) || undefined,

    displayHeaderFooter:
      booleanValue(
        options.displayHeaderFooter,
        hasHeaderOrFooter
      ),

    preferCssPageSize:
      booleanValue(
        options.preferCssPageSize,
        false
      ),

    scale:
      numberValue(
        options.scale,
        1,
        0.1,
        2,
        "PDF scale"
      ),
  };
}

export function validateHtmlPdfRequest(
  input: unknown
): ValidatedHtmlPdfRequest {
  if (!isObject(input)) {
    throw new Error(
      "HTML-to-PDF request must be a JSON object."
    );
  }

  const html =
    requiredString(
      input.html,
      "HTML content"
    );

  const css =
    optionalString(
      input.css
    );

  if (
    html.length >
    1_000_000
  ) {
    throw new Error(
      "HTML content is too large."
    );
  }

  if (
    css.length >
    500_000
  ) {
    throw new Error(
      "CSS content is too large."
    );
  }

  const rawOptions =
    isObject(input.options)
      ? input.options
      : {};

  const headerHtml =
    optionalString(
      rawOptions.headerHtml
    );

  const footerHtml =
    optionalString(
      rawOptions.footerHtml
    );

  if (
    headerHtml.length >
    100_000
  ) {
    throw new Error(
      "Header HTML is too large."
    );
  }

  if (
    footerHtml.length >
    100_000
  ) {
    throw new Error(
      "Footer HTML is too large."
    );
  }

  const options =
    validateOptions(
      rawOptions,
      Boolean(
        headerHtml ||
        footerHtml
      )
    );

  return {
    html,
    css,

    filename:
      createSafeFilename(
        input.filename
      ),

    options,
  };
}