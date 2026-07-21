import type {
  ValidatedWatermarkRequest,
  WatermarkApiOptions,
  WatermarkMode,
  WatermarkPageScope,
  WatermarkPosition,
} from "./watermarkTypes";

function isObject(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function parseJsonValue(
  value: unknown,
  fieldName: string
): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    throw new Error(
      `${fieldName} must contain valid JSON.`
    );
  }
}

function requiredText(
  value: unknown,
  fieldName: string,
  maximumLength: number
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${fieldName} is required.`
    );
  }

  const text = value.trim();

  if (text.length > maximumLength) {
    throw new Error(
      `${fieldName} cannot exceed ${maximumLength} characters.`
    );
  }

  return text;
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

  const number =
    typeof value === "number"
      ? value
      : Number(value);

  if (
    !Number.isFinite(number) ||
    number < minimum ||
    number > maximum
  ) {
    throw new Error(
      `${fieldName} must be between ${minimum} and ${maximum}.`
    );
  }

  return number;
}

function validateColor(
  value: unknown
): string {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return "#64748b";
  }

  if (
    typeof value !== "string" ||
    !/^#[0-9a-fA-F]{6}$/.test(
      value.trim()
    )
  ) {
    throw new Error(
      "Watermark color must be a six-digit hexadecimal color such as #64748b."
    );
  }

  return value
    .trim()
    .toLowerCase();
}

function validateMode(
  value: unknown
): WatermarkMode {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return "single";
  }

  if (
    value === "single" ||
    value === "repeated"
  ) {
    return value;
  }

  throw new Error(
    'Watermark mode must be "single" or "repeated".'
  );
}

function validatePosition(
  value: unknown
): WatermarkPosition {
  const positions:
    WatermarkPosition[] = [
      "top-left",
      "top-center",
      "top-right",
      "center-left",
      "center",
      "center-right",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ];

  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return "center";
  }

  if (
    typeof value === "string" &&
    positions.includes(
      value as WatermarkPosition
    )
  ) {
    return value as WatermarkPosition;
  }

  throw new Error(
    "The selected watermark position is invalid."
  );
}

function validateScope(
  value: unknown
): WatermarkPageScope {
  if (
    value === undefined ||
    value === null
  ) {
    return {
      type: "all",
    };
  }

  const parsedValue =
    parseJsonValue(
      value,
      "Watermark page scope"
    );

  if (!isObject(parsedValue)) {
    throw new Error(
      "Watermark page scope is invalid."
    );
  }

  if (
    parsedValue.type === "all"
  ) {
    return {
      type: "all",
    };
  }

  if (
    parsedValue.type !== "selected"
  ) {
    throw new Error(
      'Watermark page scope must be "all" or "selected".'
    );
  }

  if (
    !Array.isArray(
      parsedValue.pages
    )
  ) {
    throw new Error(
      "Selected watermark pages must be an array."
    );
  }

  const pages =
    Array.from(
      new Set(
        parsedValue.pages.map(
          (page) => Number(page)
        )
      )
    ).filter(
      (page) =>
        Number.isInteger(page) &&
        page > 0
    );

  if (pages.length === 0) {
    throw new Error(
      "Select at least one valid page number."
    );
  }

  if (pages.length > 10_000) {
    throw new Error(
      "Too many watermark pages were selected."
    );
  }

  pages.sort(
    (first, second) =>
      first - second
  );

  return {
    type: "selected",
    pages,
  };
}

function createSafeFilename(
  value: unknown
): string {
  const requestedName =
    typeof value === "string"
      ? value.trim()
      : "";

  const baseName =
    requestedName
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
    baseName ||
    "watermarked-document"
  }.pdf`;
}

function validateOptions(
  value: unknown
): WatermarkApiOptions {
  const parsedValue =
    parseJsonValue(
      value,
      "Watermark options"
    );

  if (!isObject(parsedValue)) {
    throw new Error(
      "Watermark options are required."
    );
  }

  return {
    text:
      requiredText(
        parsedValue.text,
        "Watermark text",
        500
      ),

    fontSize:
      numberValue(
        parsedValue.fontSize,
        48,
        8,
        200,
        "Font size"
      ),

    color:
      validateColor(
        parsedValue.color
      ),

    opacity:
      numberValue(
        parsedValue.opacity,
        0.25,
        0.05,
        1,
        "Opacity"
      ),

    rotation:
      numberValue(
        parsedValue.rotation,
        -45,
        -360,
        360,
        "Rotation"
      ),

    mode:
      validateMode(
        parsedValue.mode
      ),

    position:
      validatePosition(
        parsedValue.position
      ),

    horizontalGap:
      numberValue(
        parsedValue.horizontalGap,
        180,
        20,
        1_000,
        "Horizontal gap"
      ),

    verticalGap:
      numberValue(
        parsedValue.verticalGap,
        140,
        20,
        1_000,
        "Vertical gap"
      ),

    scope:
      validateScope(
        parsedValue.scope
      ),
  };
}

export function validateWatermarkRequest(
  input: unknown
): ValidatedWatermarkRequest {
  const parsedInput =
    parseJsonValue(
      input,
      "Watermark request"
    );

  if (!isObject(parsedInput)) {
    throw new Error(
      "Watermark request is invalid."
    );
  }

  return {
    filename:
      createSafeFilename(
        parsedInput.filename
      ),

    options:
      validateOptions(
        parsedInput.options
      ),
  };
}