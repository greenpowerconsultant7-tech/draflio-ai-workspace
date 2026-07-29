import type {
  CanonicalWeatherRecord,
  SamplingIntervalDefinition,
  TimezoneDefinition,
  WeatherReviewRecord,
  WeatherReviewStatus,
} from "../weather/weatherTypes";

export const IRRADIANCE_SCHEMA = "draflio-solar-irradiance-decomposition" as const;
export const IRRADIANCE_SCHEMA_VERSION = "1.0" as const;
export const IRRADIANCE_CALCULATION_VERSION = "re8b-irradiance-decomposition-1.0" as const;
export const IRRADIANCE_SOLAR_VERSION = "re7a-noaa-solar-position-1.0" as const;
export const IRRADIANCE_LIMITS = {
  maxRecords: 120_000,
  maxFindings: 25_000,
  maxExportBytes: 64 * 1024 * 1024,
  chartPoints: 720,
  lowSunElevationDegrees: 5,
  reconciliationToleranceWattsPerSquareMetre: 5,
} as const;

export type IrradianceValueOrigin =
  "Measured" | "Estimated" | "Derived" | "Missing" | "Invalid" | "Not evaluated";
export type IrradianceStudyState =
  | "Draft"
  | "Input review required"
  | "Eligible"
  | "Ineligible"
  | "Calculating"
  | "Cancelled"
  | "Calculated—review required"
  | "Valid with warnings"
  | "Invalid"
  | "Not evaluated"
  | "Reviewed"
  | "Approved for preliminary transposition"
  | "Rejected"
  | "Stale"
  | "Superseded";
export type IrradianceEligibilityOutcome =
  "Eligible" | "Eligible with warnings" | "Ineligible" | "Not evaluated";
export type IrradianceReasonCode =
  | "WEATHER_NOT_APPROVED"
  | "LOCATION_INVALID"
  | "TIMEZONE_INVALID"
  | "INTERVAL_UNSUPPORTED"
  | "GHI_MISSING"
  | "GHI_INVALID"
  | "SUN_BELOW_HORIZON"
  | "LOW_SOLAR_ELEVATION"
  | "EXTRATERRESTRIAL_IRRADIANCE_INVALID"
  | "MODEL_RANGE_EXCEEDED"
  | "REQUIRED_INPUT_MISSING"
  | "SOURCE_RECORD_BLOCKED";
export type IrradianceQualityFlag = {
  code: string;
  severity: "Error" | "Warning" | "Information" | "Not evaluated";
  explanation: string;
};
export type IrradianceVariableAvailability = {
  variable: "ghi" | "dni" | "dhi";
  measured: number;
  valid: number;
  missing: number;
  invalid: number;
};
export type IrradianceModelDefinition = {
  modelId: "measured-pass-through" | "erbs-hourly";
  name: string;
  version: string;
  category: "irradiance decomposition";
  reference: string;
  requiredInputs: string[];
  optionalInputs: string[];
  supportedIntervalMinutes: number[];
  minimumSolarElevationDegrees: number;
  clearnessIndexRange: [number, number];
  outputVariables: Array<"ghi" | "dni" | "dhi">;
  validityRange: string;
  configurationSchema: string;
  benchmarkStatus: "Validated";
  knownLimitations: string[];
  unsupportedConditions: string[];
};
export type IrradianceModelConfiguration = {
  modelId: IrradianceModelDefinition["modelId"];
  modelVersion: string;
  lowSunElevationDegrees: number;
  reconciliationToleranceWattsPerSquareMetre: number;
};
export type IrradianceModelEligibility = {
  outcome: IrradianceEligibilityOutcome;
  reasonCode?: IrradianceReasonCode;
  explanation: string;
};
export type IrradianceInputReference = {
  projectId: string;
  weatherResourceId: string;
  weatherResourceVersion: number;
  weatherApprovalState: WeatherReviewStatus;
  sourceHash: string;
  latitude: number | null;
  longitude: number | null;
  elevationMetres: number | null;
  timezone: TimezoneDefinition | null;
  interval: SamplingIntervalDefinition | null;
  sourcePeriod: string;
  availability: IrradianceVariableAvailability[];
};
export type IrradianceOutputRecord = {
  timestamp: string;
  timezone: string;
  sourceRow: number;
  solarElevationDegrees: number;
  solarZenithDegrees: number;
  extraterrestrialNormal: number;
  extraterrestrialHorizontal: number;
  clearnessIndex: number | null;
  inputGhi: number | null;
  inputDni: number | null;
  inputDhi: number | null;
  outputGhi: number | null;
  outputDni: number | null;
  outputDhi: number | null;
  ghiOrigin: IrradianceValueOrigin;
  dniOrigin: IrradianceValueOrigin;
  dhiOrigin: IrradianceValueOrigin;
  modelId: IrradianceModelDefinition["modelId"];
  modelVersion: string;
  eligibility: IrradianceEligibilityOutcome;
  calculationStatus: "Measured pass-through" | "Estimated" | "Not evaluated" | "Invalid";
  qualityFlags: IrradianceQualityFlag[];
  warnings: string[];
  notEvaluatedReason: IrradianceReasonCode | null;
  calculationVersion: typeof IRRADIANCE_CALCULATION_VERSION;
};
export type IrradianceCalculationRecord = {
  source: CanonicalWeatherRecord;
  output: IrradianceOutputRecord;
};
export type IrradianceFinding = {
  id: string;
  code: string;
  severity: IrradianceQualityFlag["severity"];
  timestamp?: string;
  sourceRow?: number;
  explanation: string;
  recommendedAction: string;
  evidence: string;
  modellingBlocked: boolean;
  acknowledged: boolean;
  reviewerNote?: string;
};
export type IrradianceSummary = {
  inputRecordCount: number;
  outputRecordCount: number;
  eligibleRecordCount: number;
  measuredRecordCount: number;
  estimatedRecordCount: number;
  excludedRecordCount: number;
  notEvaluatedRecordCount: number;
  warningCount: number;
  blockingCount: number;
  calculationPeriod: { start: string | null; end: string | null };
  intervalMinutes: number | null;
  reconciliationFailures: number;
};
export type IrradianceCalculationResult = {
  records: IrradianceOutputRecord[];
  findings: IrradianceFinding[];
  summary: IrradianceSummary;
};
export type IrradianceCalculationRequest = {
  type: "calculate";
  generation: number;
  weatherReview: WeatherReviewRecord;
  configuration: IrradianceModelConfiguration;
};
export type IrradianceCalculationProgress = {
  type: "progress";
  generation: number;
  percent: number;
  stage: string;
};
export type IrradianceStudyVersion = {
  version: number;
  createdAt: string;
  input: IrradianceInputReference;
  configuration: IrradianceModelConfiguration;
  records: IrradianceOutputRecord[];
  findings: IrradianceFinding[];
  summary: IrradianceSummary | null;
  calculationTimestamp: string | null;
  calculationVersion: typeof IRRADIANCE_CALCULATION_VERSION;
  solarPositionVersion: typeof IRRADIANCE_SOLAR_VERSION;
  assumptions: string[];
  limitations: string[];
};
export type IrradianceStudy = {
  studyId: string;
  projectId: string;
  weatherResourceId: string;
  versions: IrradianceStudyVersion[];
};
export type IrradianceReviewTransition = {
  sequence: number;
  from: IrradianceStudyState;
  to: IrradianceStudyState;
  reviewer: string;
  note: string;
  timestamp: string;
};
export type IrradianceReviewRecord = {
  schema: typeof IRRADIANCE_SCHEMA;
  schemaVersion: typeof IRRADIANCE_SCHEMA_VERSION;
  study: IrradianceStudy;
  currentVersion: number;
  status: IrradianceStudyState;
  history: IrradianceReviewTransition[];
  reviewerNotes: string;
};
export type IrradianceBenchmarkRecord = {
  referenceSource: string;
  modelId: IrradianceModelDefinition["modelId"];
  input: Record<string, number>;
  expected: Record<string, number>;
  actual: Record<string, number>;
  absoluteDifference: Record<string, number>;
  relativeDifference: Record<string, number>;
  tolerance: Record<string, number>;
  status: "Pass" | "Fail";
  limitation: string;
};
export type IrradianceExportRecord = {
  exportedAt: string;
  filename: string;
  mediaType: string;
  bytes: number;
};

export const IRRADIANCE_TRANSITIONS: Readonly<
  Record<IrradianceStudyState, readonly IrradianceStudyState[]>
> = {
  Draft: ["Input review required", "Eligible", "Ineligible", "Rejected"],
  "Input review required": ["Eligible", "Ineligible", "Rejected"],
  Eligible: ["Calculating", "Rejected"],
  Ineligible: ["Superseded", "Rejected"],
  Calculating: ["Cancelled", "Calculated—review required", "Invalid", "Not evaluated"],
  Cancelled: ["Calculating", "Rejected", "Superseded"],
  "Calculated—review required": ["Valid with warnings", "Reviewed", "Rejected", "Stale"],
  "Valid with warnings": ["Reviewed", "Rejected", "Stale"],
  Invalid: ["Rejected", "Superseded"],
  "Not evaluated": ["Rejected", "Superseded"],
  Reviewed: ["Approved for preliminary transposition", "Rejected", "Stale"],
  "Approved for preliminary transposition": ["Stale", "Superseded"],
  Rejected: ["Superseded"],
  Stale: ["Calculating", "Reviewed", "Rejected", "Superseded"],
  Superseded: [],
};
