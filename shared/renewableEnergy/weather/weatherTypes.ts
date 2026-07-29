export const WEATHER_SCHEMA = "draflio-solar-weather-resource" as const;
export const WEATHER_SCHEMA_VERSION = "1.0" as const;
export const WEATHER_STAGE = "re8a-weather-quality-foundation-1.0" as const;
export const WEATHER_PARSER_VERSION = "re8a-weather-parser-1.0" as const;
export const WEATHER_VALIDATION_VERSION = "re8a-weather-validation-1.0" as const;

export const WEATHER_LIMITS = {
  maxFileBytes: 32 * 1024 * 1024,
  maxRecords: 120_000,
  maxColumns: 64,
  maxHeaderLength: 16_384,
  maxFieldLength: 4_096,
  maxFindings: 25_000,
  maxDuplicateDetails: 1_000,
  maxMissingIntervalDetails: 2_000,
  maxExportBytes: 48 * 1024 * 1024,
  chartPoints: 720,
} as const;

export type WeatherReviewStatus =
  | "Draft"
  | "Imported"
  | "Structurally invalid"
  | "Valid with warnings"
  | "Not evaluated"
  | "Reviewed"
  | "Approved for preliminary modelling"
  | "Rejected"
  | "Superseded"
  | "Stale";
export type WeatherSeverity = "Error" | "Warning" | "Information" | "Not evaluated";
export type WeatherVariable =
  | "timestamp"
  | "ghi"
  | "dni"
  | "dhi"
  | "ambientTemperature"
  | "windSpeed"
  | "relativeHumidity"
  | "atmosphericPressure"
  | "precipitation"
  | "albedo"
  | "planeOfArrayIrradiance"
  | "moduleTemperature"
  | "windDirection"
  | "totalSkyCover"
  | "stationStatus"
  | "sourceQualityCode";
export type WeatherSourceFormat = "epw" | "draflio-csv" | "mapped-csv" | "tmy-csv";

export type WeatherResourceProjectReference = { projectId: string; projectName: string };
export type WeatherUnitDefinition = {
  source: string;
  canonical: string;
  conversion: "identity" | "fahrenheit-to-celsius" | "kmh-to-ms" | "hpa-to-pa";
};
export type TimestampDefinition = {
  semantics: "instant" | "epw-hour-ending";
  sourceColumns: string[];
};
export type TimezoneDefinition = {
  kind: "iana" | "fixed-offset";
  value: string;
  offsetMinutes?: number;
};
export type SamplingIntervalDefinition = {
  minutes: number;
  basis: "declared" | "inferred";
  confidence: number;
};
export type WeatherVariableDefinition = {
  variable: WeatherVariable;
  required: boolean;
  unit: WeatherUnitDefinition;
};
export type WeatherQualityFlag = { code: string; severity: WeatherSeverity };
export type CanonicalWeatherRecord = {
  timestamp: string;
  timezone: string;
  sourceRow: number;
  values: Partial<Record<WeatherVariable, number | string | null>>;
  qualityFlags: WeatherQualityFlag[];
  conversionStatus: string[];
};
export type WeatherQualityFinding = {
  id: string;
  code: string;
  severity: WeatherSeverity;
  variable?: WeatherVariable;
  startTimestamp?: string;
  endTimestamp?: string;
  sourceRow?: number;
  sourceValue?: string;
  canonicalValue?: string;
  explanation: string;
  recommendedAction: string;
  evidence: string;
  validationVersion: typeof WEATHER_VALIDATION_VERSION;
  modellingBlocked: boolean;
  acknowledged: boolean;
  reviewerNote?: string;
};
export type WeatherQualitySummary = {
  importedRecordCount: number;
  expectedRecordCount: number | null;
  validRecordCount: number;
  invalidRecordCount: number;
  warningRecordCount: number;
  missingTimestamps: number;
  duplicateTimestamps: number;
  intervalConsistency: "consistent" | "irregular" | "not-evaluated";
  variableCompleteness: Record<string, number>;
  daylightIrradianceCompleteness: number | null;
  locationComplete: boolean;
  timezoneComplete: boolean;
  unitsComplete: boolean;
  sourceConfidence: "high" | "medium" | "low" | "not-evaluated";
  readiness:
    | "Suitable for preliminary weather review"
    | "Suitable for preliminary irradiance modelling"
    | "Blocked pending correction"
    | "Not evaluated"
    | "Rejected";
};
export type WeatherSourceRecord = {
  projectId: string;
  sourceId: string;
  filename: string;
  format: WeatherSourceFormat;
  mimeType: string;
  byteSize: number;
  sourceHash: string;
  importedAt: string;
  originalHeaderMetadata: Record<string, string>;
  declaredLocation: string;
  latitude: number | null;
  longitude: number | null;
  elevationMetres: number | null;
  timezone: TimezoneDefinition | null;
  sourceProvider: string;
  sourcePeriod: string;
  interval: SamplingIntervalDefinition | null;
  sourceUnits: Record<string, string>;
  parserVersion: typeof WEATHER_PARSER_VERSION;
  validationVersion: typeof WEATHER_VALIDATION_VERSION;
  notes: string;
  reviewStatus: WeatherReviewStatus;
  originalText: string;
};
export type WeatherDatasetVersion = {
  version: number;
  createdAt: string;
  source: WeatherSourceRecord;
  records: CanonicalWeatherRecord[];
  findings: WeatherQualityFinding[];
  summary: WeatherQualitySummary | null;
};
export type WeatherDataset = {
  datasetId: string;
  project: WeatherResourceProjectReference;
  versions: WeatherDatasetVersion[];
};
export type WeatherReviewTransition = {
  sequence: number;
  from: WeatherReviewStatus;
  to: WeatherReviewStatus;
  reviewer: string;
  timestamp: string;
  note: string;
  decision: string;
};
export type WeatherReviewRecord = {
  schema: typeof WEATHER_SCHEMA;
  schemaVersion: typeof WEATHER_SCHEMA_VERSION;
  calculationStage: typeof WEATHER_STAGE;
  dataset: WeatherDataset;
  currentVersion: number;
  status: WeatherReviewStatus;
  history: WeatherReviewTransition[];
  limitations: string[];
};
export type WeatherImportResult = {
  dataset: WeatherDataset;
  structuralFindings: WeatherQualityFinding[];
};
export type WeatherValidationResult = {
  records: CanonicalWeatherRecord[];
  findings: WeatherQualityFinding[];
  summary: WeatherQualitySummary;
};
export type WeatherExportRecord = {
  exportedAt: string;
  filename: string;
  mediaType: string;
  bytes: number;
};
export type WeatherModelRegistryEntry = {
  modelId: string;
  name: string;
  version: string;
  category:
    | "solar position"
    | "irradiance decomposition"
    | "irradiance transposition"
    | "incidence-angle modifier"
    | "albedo"
    | "module temperature"
    | "spectral adjustment";
  inputRequirements: string[];
  outputDefinitions: string[];
  documentedSource: string;
  validityRange: string;
  configurationSchema: string;
  validationStatus: "available" | "future";
  knownLimitations: string[];
};
export type WeatherColumnMapping = Partial<
  Record<WeatherVariable | "date" | "time" | "year" | "month" | "day" | "hour" | "minute", string>
>;

export const WEATHER_TRANSITIONS: Readonly<
  Record<WeatherReviewStatus, readonly WeatherReviewStatus[]>
> = {
  Draft: ["Imported", "Rejected"],
  Imported: ["Structurally invalid", "Valid with warnings", "Reviewed", "Rejected"],
  "Structurally invalid": ["Rejected", "Superseded"],
  "Valid with warnings": ["Reviewed", "Rejected", "Superseded"],
  "Not evaluated": ["Imported", "Rejected"],
  Reviewed: ["Approved for preliminary modelling", "Rejected", "Stale"],
  "Approved for preliminary modelling": ["Stale", "Superseded"],
  Rejected: ["Superseded"],
  Superseded: [],
  Stale: ["Reviewed", "Rejected", "Superseded"],
};

export const WEATHER_MODEL_REGISTRY: readonly WeatherModelRegistryEntry[] = [
  {
    modelId: "draflio-noaa-solar-position",
    name: "Existing solar position",
    version: "re7a",
    category: "solar position",
    inputRequirements: ["timestamp", "latitude", "longitude", "timezone"],
    outputDefinitions: ["solar elevation", "solar azimuth"],
    documentedSource: "RE7A validated implementation",
    validityRange: "RE7A documented range",
    configurationSchema: "none",
    validationStatus: "available",
    knownLimitations: ["Used only for quality checks in RE8A."],
  },
  ...(
    [
      "irradiance decomposition",
      "irradiance transposition",
      "incidence-angle modifier",
      "albedo",
      "module temperature",
      "spectral adjustment",
    ] as const
  ).map((category) => ({
    modelId: `future-${category.replaceAll(" ", "-")}`,
    name: `Future ${category}`,
    version: "unimplemented",
    category,
    inputRequirements: [],
    outputDefinitions: [],
    documentedSource: "Not selected",
    validityRange: "Not evaluated",
    configurationSchema: "Not defined",
    validationStatus: "future" as const,
    knownLimitations: ["No implementation or validation suite exists."],
  })),
];
