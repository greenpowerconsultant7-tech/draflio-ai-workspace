import type { IrradianceCalculationResult, IrradianceReviewRecord } from "./irradianceTypes";
import { validateIrradianceReview } from "./irradianceValidation";

const neutral = (value: string) => (/^[=+\-@]/.test(value) ? `'${value}` : value);
const cell = (value: string | number | boolean | null | undefined) => {
  const text = neutral(value === null || value === undefined ? "" : String(value));
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
export const IRRADIANCE_COMPONENT_COLUMNS = [
  "timestamp",
  "timezone",
  "source_row",
  "solar_elevation_deg",
  "solar_zenith_deg",
  "extraterrestrial_normal_w_m2",
  "extraterrestrial_horizontal_w_m2",
  "clearness_index",
  "input_ghi_w_m2",
  "input_dni_w_m2",
  "input_dhi_w_m2",
  "output_ghi_w_m2",
  "output_dni_w_m2",
  "output_dhi_w_m2",
  "ghi_origin",
  "dni_origin",
  "dhi_origin",
  "model_id",
  "model_version",
  "eligibility",
  "calculation_status",
  "flags",
  "not_evaluated_reason",
] as const;
export function serializeIrradianceComponents(result: IrradianceCalculationResult) {
  return [
    IRRADIANCE_COMPONENT_COLUMNS.join(","),
    ...result.records.map((record) =>
      [
        record.timestamp,
        record.timezone,
        record.sourceRow,
        record.solarElevationDegrees,
        record.solarZenithDegrees,
        record.extraterrestrialNormal,
        record.extraterrestrialHorizontal,
        record.clearnessIndex,
        record.inputGhi,
        record.inputDni,
        record.inputDhi,
        record.outputGhi,
        record.outputDni,
        record.outputDhi,
        record.ghiOrigin,
        record.dniOrigin,
        record.dhiOrigin,
        record.modelId,
        record.modelVersion,
        record.eligibility,
        record.calculationStatus,
        record.qualityFlags.map((flag) => flag.code).join("|"),
        record.notEvaluatedReason,
      ]
        .map(cell)
        .join(","),
    ),
  ].join("\r\n");
}
export function serializeIrradianceFindings(result: IrradianceCalculationResult) {
  const header = [
    "finding_id",
    "code",
    "severity",
    "timestamp",
    "source_row",
    "blocking",
    "explanation",
    "recommended_action",
    "evidence",
    "acknowledged",
    "reviewer_note",
  ];
  return [
    header.join(","),
    ...result.findings.map((finding) =>
      [
        finding.id,
        finding.code,
        finding.severity,
        finding.timestamp,
        finding.sourceRow,
        finding.modellingBlocked,
        finding.explanation,
        finding.recommendedAction,
        finding.evidence,
        finding.acknowledged,
        finding.reviewerNote,
      ]
        .map(cell)
        .join(","),
    ),
  ].join("\r\n");
}
export const serializeIrradianceSummary = (result: IrradianceCalculationResult) =>
  JSON.stringify(
    {
      schema: "draflio-solar-irradiance-summary",
      schemaVersion: "1.0",
      summary: result.summary,
    },
    null,
    2,
  );
export function serializeIrradianceReview(review: IrradianceReviewRecord) {
  return validateIrradianceReview(review);
}
export function serializeIrradianceCompanion(review: IrradianceReviewRecord) {
  validateIrradianceReview(review);
  const version = review.study.versions.find((item) => item.version === review.currentVersion);
  return JSON.stringify(
    {
      schema: "draflio-solar-project-irradiance-companion",
      schemaVersion: "1.0",
      projectId: review.study.projectId,
      weatherResourceId: review.study.weatherResourceId,
      weatherResourceVersion: version?.input.weatherResourceVersion,
      irradianceStudyId: review.study.studyId,
      irradianceStudyVersion: review.currentVersion,
      reviewStatus: review.status,
      calculationVersion: version?.calculationVersion,
      model: version?.configuration,
      summary: version?.summary,
      limitations: version?.limitations,
    },
    null,
    2,
  );
}
export function safeIrradianceFilename(value: string, suffix: string) {
  const base =
    value
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^[.-]+|[.-]+$/g, "")
      .slice(0, 80) || "irradiance";
  return `${base}-${suffix}`;
}
