import {
  IRRADIANCE_CALCULATION_VERSION,
  IRRADIANCE_LIMITS,
  IRRADIANCE_SCHEMA,
  IRRADIANCE_SCHEMA_VERSION,
  type IrradianceCalculationRequest,
  type IrradianceCalculationResult,
  type IrradianceReviewRecord,
} from "./irradianceTypes";

const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const nullableFinite = (value: unknown) => value === null || finite(value);
const safeNested = (value: unknown, seen = new WeakSet<object>()): boolean => {
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object") return true;
  if (seen.has(value)) return false;
  seen.add(value);
  const valid = Object.values(value).every((item) => safeNested(item, seen));
  seen.delete(value);
  return valid;
};
export function validateIrradianceRequest(value: unknown): IrradianceCalculationRequest {
  if (
    !object(value) ||
    value.type !== "calculate" ||
    !Number.isSafeInteger(value.generation) ||
    !object(value.weatherReview) ||
    !object(value.configuration)
  )
    throw new Error("Malformed irradiance worker request.");
  const configuration = value.configuration;
  if (
    !["measured-pass-through", "erbs-hourly"].includes(String(configuration.modelId)) ||
    typeof configuration.modelVersion !== "string" ||
    !finite(configuration.lowSunElevationDegrees) ||
    !finite(configuration.reconciliationToleranceWattsPerSquareMetre)
  )
    throw new Error("Malformed irradiance model configuration.");
  return value as IrradianceCalculationRequest;
}
export function isIrradianceResult(value: unknown): value is IrradianceCalculationResult {
  if (
    !object(value) ||
    !Array.isArray(value.records) ||
    !Array.isArray(value.findings) ||
    !object(value.summary) ||
    value.records.length > IRRADIANCE_LIMITS.maxRecords ||
    value.findings.length > IRRADIANCE_LIMITS.maxFindings
  )
    return false;
  const recordsValid = value.records.every(
    (record) =>
      object(record) &&
      typeof record.timestamp === "string" &&
      typeof record.timezone === "string" &&
      Number.isSafeInteger(record.sourceRow) &&
      [
        record.solarElevationDegrees,
        record.solarZenithDegrees,
        record.extraterrestrialNormal,
        record.extraterrestrialHorizontal,
      ].every(finite) &&
      [
        record.clearnessIndex,
        record.inputGhi,
        record.inputDni,
        record.inputDhi,
        record.outputGhi,
        record.outputDni,
        record.outputDhi,
      ].every(nullableFinite) &&
      ["Measured", "Estimated", "Derived", "Missing", "Invalid", "Not evaluated"].includes(
        String(record.ghiOrigin),
      ) &&
      ["Measured", "Estimated", "Derived", "Missing", "Invalid", "Not evaluated"].includes(
        String(record.dniOrigin),
      ) &&
      ["Measured", "Estimated", "Derived", "Missing", "Invalid", "Not evaluated"].includes(
        String(record.dhiOrigin),
      ) &&
      record.calculationVersion === IRRADIANCE_CALCULATION_VERSION &&
      Array.isArray(record.qualityFlags) &&
      Array.isArray(record.warnings),
  );
  const findingsValid = value.findings.every(
    (finding) =>
      object(finding) &&
      ["id", "code", "explanation", "recommendedAction", "evidence"].every(
        (key) => typeof finding[key] === "string",
      ) &&
      typeof finding.modellingBlocked === "boolean" &&
      typeof finding.acknowledged === "boolean",
  );
  const countFields = [
    "inputRecordCount",
    "outputRecordCount",
    "eligibleRecordCount",
    "measuredRecordCount",
    "estimatedRecordCount",
    "excludedRecordCount",
    "notEvaluatedRecordCount",
    "warningCount",
    "blockingCount",
    "reconciliationFailures",
  ];
  const summary = value.summary;
  return (
    recordsValid &&
    findingsValid &&
    countFields.every((key) => finite(summary[key])) &&
    summary.outputRecordCount === value.records.length &&
    summary.inputRecordCount === value.records.length &&
    safeNested(value)
  );
}
export function validateIrradianceReview(
  review: IrradianceReviewRecord,
  expectedProjectId?: string,
) {
  if (review.schema !== IRRADIANCE_SCHEMA || review.schemaVersion !== IRRADIANCE_SCHEMA_VERSION)
    throw new Error("Unsupported irradiance review schema.");
  if (expectedProjectId && review.study.projectId !== expectedProjectId)
    throw new Error("Cross-project irradiance review rejected.");
  const version = review.study.versions.find((item) => item.version === review.currentVersion);
  if (
    !version ||
    version.input.projectId !== review.study.projectId ||
    version.input.weatherResourceId !== review.study.weatherResourceId
  )
    throw new Error("Cross-project or source-version irradiance review mismatch.");
  if (review.status === "Approved for preliminary transposition" && version.summary === null)
    throw new Error("Stale approval cannot be exported.");
  if (
    version.summary &&
    !isIrradianceResult({
      records: version.records,
      findings: version.findings,
      summary: version.summary,
    })
  )
    throw new Error("Malformed nested irradiance result.");
  if (!safeNested(review)) throw new Error("Circular or non-finite irradiance export value.");
  const json = JSON.stringify(review);
  if (new TextEncoder().encode(json).byteLength > IRRADIANCE_LIMITS.maxExportBytes)
    throw new Error("Irradiance review export is oversized.");
  return json;
}
