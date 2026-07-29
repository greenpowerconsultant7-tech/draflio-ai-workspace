import {
  WEATHER_LIMITS,
  WEATHER_SCHEMA,
  WEATHER_SCHEMA_VERSION,
  WEATHER_STAGE,
  WEATHER_VALIDATION_VERSION,
  type CanonicalWeatherRecord,
  type WeatherQualityFinding,
  type WeatherQualitySummary,
  type WeatherReviewRecord,
  type WeatherValidationResult,
} from "./weatherTypes";

const safeText = (value: string) => (/^[=+\-@]/.test(value) ? `'${value}` : value);
const csvCell = (value: string | number | boolean | null | undefined) => {
  const text = safeText(value === null || value === undefined ? "" : String(value));
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
function finite(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object") return true;
  if (seen.has(value)) return false;
  seen.add(value);
  const ok = Object.values(value).every((child) => finite(child, seen));
  seen.delete(value);
  return ok;
}
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const finiteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const nullableFinite = (value: unknown) => value === null || finiteNumber(value);
const strings = (value: unknown) =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
const validRecord = (value: unknown): value is CanonicalWeatherRecord =>
  object(value) &&
  typeof value.timestamp === "string" &&
  typeof value.timezone === "string" &&
  Number.isSafeInteger(value.sourceRow) &&
  object(value.values) &&
  Object.values(value.values).every(
    (item) => item === null || typeof item === "string" || finiteNumber(item),
  ) &&
  Array.isArray(value.qualityFlags) &&
  value.qualityFlags.every(
    (flag) =>
      object(flag) &&
      typeof flag.code === "string" &&
      ["Error", "Warning", "Information", "Not evaluated"].includes(String(flag.severity)),
  ) &&
  strings(value.conversionStatus);
const validFinding = (value: unknown): value is WeatherQualityFinding =>
  object(value) &&
  ["id", "code", "explanation", "recommendedAction", "evidence"].every(
    (key) => typeof value[key] === "string",
  ) &&
  ["Error", "Warning", "Information", "Not evaluated"].includes(String(value.severity)) &&
  value.validationVersion === WEATHER_VALIDATION_VERSION &&
  typeof value.modellingBlocked === "boolean" &&
  typeof value.acknowledged === "boolean";
const validSummary = (value: unknown): value is WeatherQualitySummary =>
  object(value) &&
  [
    "importedRecordCount",
    "validRecordCount",
    "invalidRecordCount",
    "warningRecordCount",
    "missingTimestamps",
    "duplicateTimestamps",
  ].every((key) => finiteNumber(value[key])) &&
  nullableFinite(value.expectedRecordCount) &&
  ["consistent", "irregular", "not-evaluated"].includes(String(value.intervalConsistency)) &&
  object(value.variableCompleteness) &&
  Object.values(value.variableCompleteness).every(finiteNumber) &&
  nullableFinite(value.daylightIrradianceCompleteness) &&
  typeof value.locationComplete === "boolean" &&
  typeof value.timezoneComplete === "boolean" &&
  typeof value.unitsComplete === "boolean" &&
  ["high", "medium", "low", "not-evaluated"].includes(String(value.sourceConfidence)) &&
  [
    "Suitable for preliminary weather review",
    "Suitable for preliminary irradiance modelling",
    "Blocked pending correction",
    "Not evaluated",
    "Rejected",
  ].includes(String(value.readiness));
export function isWeatherValidationResult(value: unknown): value is WeatherValidationResult {
  return (
    object(value) &&
    Array.isArray(value.records) &&
    value.records.every(validRecord) &&
    Array.isArray(value.findings) &&
    value.findings.every(validFinding) &&
    validSummary(value.summary) &&
    finite(value)
  );
}
export function validateReviewExport(review: WeatherReviewRecord) {
  if (
    review.schema !== WEATHER_SCHEMA ||
    review.schemaVersion !== WEATHER_SCHEMA_VERSION ||
    review.calculationStage !== WEATHER_STAGE
  )
    throw new Error("Unsupported weather review schema.");
  const version = review.dataset.versions.find((item) => item.version === review.currentVersion);
  if (!version || version.source.projectId !== review.dataset.project.projectId)
    throw new Error("Cross-project or missing dataset version.");
  if (
    review.status === "Approved for preliminary modelling" &&
    version.source.reviewStatus === "Stale"
  )
    throw new Error("Stale approval cannot be exported.");
  if (!finite(review)) throw new Error("Circular or non-finite export value.");
  const json = JSON.stringify(review);
  if (new TextEncoder().encode(json).byteLength > WEATHER_LIMITS.maxExportBytes)
    throw new Error("Weather review export is oversized.");
  return json;
}
export function serializeCanonicalCsv(result: WeatherValidationResult) {
  const variables = [
    "ghi",
    "dni",
    "dhi",
    "ambientTemperature",
    "windSpeed",
    "relativeHumidity",
    "atmosphericPressure",
    "precipitation",
    "albedo",
    "planeOfArrayIrradiance",
    "moduleTemperature",
    "stationStatus",
    "sourceQualityCode",
  ] as const;
  const header = [
    "timestamp",
    "timezone",
    ...variables,
    "quality_flags",
    "source_row",
    "conversion_status",
  ];
  return [
    header.join(","),
    ...result.records.map((record) =>
      [
        record.timestamp,
        record.timezone,
        ...variables.map((v) => record.values[v]),
        record.qualityFlags.map((f) => `${f.severity}:${f.code}`).join("|"),
        record.sourceRow,
        record.conversionStatus.join("|"),
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\r\n");
}
export function serializeFindingsCsv(result: WeatherValidationResult) {
  const header = [
    "finding_code",
    "severity",
    "blocking_status",
    "variable",
    "start_timestamp",
    "end_timestamp",
    "source_row",
    "source_value",
    "canonical_value",
    "message",
    "recommended_action",
    "acknowledgement",
    "reviewer_note",
  ];
  return [
    header.join(","),
    ...result.findings.map((f) =>
      [
        f.code,
        f.severity,
        f.modellingBlocked,
        f.variable,
        f.startTimestamp,
        f.endTimestamp,
        f.sourceRow,
        f.sourceValue,
        f.canonicalValue,
        f.explanation,
        f.recommendedAction,
        f.acknowledged,
        f.reviewerNote,
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\r\n");
}
export function serializeSummary(result: WeatherValidationResult) {
  return JSON.stringify(
    {
      schema: "draflio-weather-quality-summary",
      schemaVersion: "1.0",
      validationVersion: WEATHER_VALIDATION_VERSION,
      summary: result.summary,
    },
    null,
    2,
  );
}
export function safeWeatherFilename(value: string, suffix: string) {
  const base =
    value
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^[.-]+|[.-]+$/g, "")
      .slice(0, 80) || "weather";
  return `${base}-${suffix}`;
}
