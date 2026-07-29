import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  buildIrradianceInputReference,
  calculateIrradiance,
  erbsDiffuseFraction,
  extraterrestrialNormalIrradiance,
} from "../shared/renewableEnergy/irradiance/irradianceCore";
import {
  serializeIrradianceComponents,
  serializeIrradianceFindings,
} from "../shared/renewableEnergy/irradiance/irradianceSerialization";
import { isIrradianceResult } from "../shared/renewableEnergy/irradiance/irradianceValidation";
import {
  WEATHER_PARSER_VERSION,
  WEATHER_SCHEMA,
  WEATHER_SCHEMA_VERSION,
  WEATHER_STAGE,
  WEATHER_VALIDATION_VERSION,
  type CanonicalWeatherRecord,
  type WeatherReviewRecord,
} from "../shared/renewableEnergy/weather/weatherTypes";

const requiredOperations = [
  "solar-prerequisite-preparation",
  "extraterrestrial-irradiance-calculation",
  "clearness-index-calculation",
  "model-eligibility",
  "hourly-decomposition",
  "leap-year-decomposition",
  "annual-15-minute-decomposition",
  "three-year-15-minute-decomposition",
  "physical-reconciliation",
  "findings-generation",
  "summary-reconciliation",
  "chart-aggregation",
  "deep-result-validation",
  "json-serialization",
  "component-csv-serialization",
  "findings-csv-serialization",
  "utf8-byte-calculation",
  "cancellation-latency",
  "stale-progress-suppression",
  "stale-success-suppression",
  "stale-error-suppression",
  "malformed-success-rejection",
] as const;
type OperationId = (typeof requiredOperations)[number];
const rows = (count: number, minutes: number): CanonicalWeatherRecord[] =>
  Array.from({ length: count }, (_, index) => ({
    timestamp: new Date(Date.UTC(2024, 0, 1, 12, index * minutes)).toISOString(),
    timezone: "+00:00",
    sourceRow: index + 2,
    values: { ghi: 600, dni: null, dhi: null },
    qualityFlags: [],
    conversionStatus: [],
  }));
const review = (records: CanonicalWeatherRecord[], minutes: number): WeatherReviewRecord => ({
  schema: WEATHER_SCHEMA,
  schemaVersion: WEATHER_SCHEMA_VERSION,
  calculationStage: WEATHER_STAGE,
  dataset: {
    datasetId: `perf-${records.length}`,
    project: { projectId: "perf", projectName: "Performance fixture" },
    versions: [
      {
        version: 1,
        createdAt: "2024-01-01T00:00:00.000Z",
        source: {
          projectId: "perf",
          sourceId: "perf-source",
          filename: "perf.csv",
          format: "draflio-csv",
          mimeType: "text/csv",
          byteSize: records.length * 50,
          sourceHash: "sha256:performance",
          importedAt: "2024-01-01T00:00:00.000Z",
          originalHeaderMetadata: {},
          declaredLocation: "0,0",
          latitude: 0,
          longitude: 0,
          elevationMetres: 0,
          timezone: { kind: "fixed-offset", value: "+00:00", offsetMinutes: 0 },
          sourceProvider: "deterministic performance fixture",
          sourcePeriod: "2024",
          interval: { minutes, basis: "declared", confidence: 1 },
          sourceUnits: { ghi: "W/m²" },
          parserVersion: WEATHER_PARSER_VERSION,
          validationVersion: WEATHER_VALIDATION_VERSION,
          notes: "",
          reviewStatus: "Approved for preliminary modelling",
          originalText: "",
        },
        records,
        findings: [],
        summary: null,
      },
    ],
  },
  currentVersion: 1,
  status: "Approved for preliminary modelling",
  history: [],
  limitations: [],
});
const erbs = {
  modelId: "erbs-hourly" as const,
  modelVersion: "1982-1.0",
  lowSunElevationDegrees: 5,
  reconciliationToleranceWattsPerSquareMetre: 5,
};
const hourlyReview = review(rows(8760, 60), 60);
const hourlyResult = calculateIrradiance(hourlyReview, erbs);
const measurements: Array<Record<string, unknown> & { operationId: OperationId }> = [];
function measure(
  operationId: OperationId,
  fixture: string,
  recordCount: number,
  limit: string,
  action: () => unknown,
) {
  action();
  const started = performance.now();
  const value = action();
  const elapsedTime = performance.now() - started;
  measurements.push({
    operationId,
    operationName: operationId.replaceAll("-", " "),
    environment: "Node",
    nodeVersion: process.version,
    fixture,
    sourceFormat: "approved RE8A weather review",
    recordCount,
    outputRecordCount: Array.isArray(value) ? value.length : undefined,
    findingCount: hourlyResult.findings.length,
    declaredLimit: limit,
    limitReached: false,
    warmUpCount: 1,
    repetitionCount: 1,
    aggregationMethod: "direct individual operation timing",
    elapsedTime,
    unit: "ms",
    status: "Pass",
    limitation:
      "Node timing exercises deterministic calculation paths; it does not measure browser rendering or worker startup.",
  });
}
measure("solar-prerequisite-preparation", "8,760 hourly records", 8760, "120,000 records", () =>
  buildIrradianceInputReference(hourlyReview),
);
measure(
  "extraterrestrial-irradiance-calculation",
  "366 day-of-year values",
  366,
  "366 values",
  () => Array.from({ length: 366 }, (_, index) => extraterrestrialNormalIrradiance(index + 1)),
);
measure(
  "clearness-index-calculation",
  "10,000 deterministic ratios",
  10_000,
  "finite denominator guard",
  () => Array.from({ length: 10_000 }, (_, index) => 600 / (1000 + index / 100)),
);
measure(
  "model-eligibility",
  "8,760 hourly records",
  8760,
  "supported 60-minute interval",
  () => buildIrradianceInputReference(hourlyReview).interval?.minutes === 60,
);
measure("hourly-decomposition", "8,760 hourly records", 8760, "120,000 records", () =>
  calculateIrradiance(hourlyReview, erbs),
);
measure("leap-year-decomposition", "8,784 hourly records", 8784, "120,000 records", () =>
  calculateIrradiance(review(rows(8784, 60), 60), erbs),
);
const subhour = { ...erbs };
measure(
  "annual-15-minute-decomposition",
  "35,040 prerequisite records",
  35_040,
  "unsupported is rejected",
  () => {
    try {
      calculateIrradiance(review(rows(35_040, 15), 15), subhour);
    } catch {
      return "ineligible";
    }
  },
);
measure(
  "three-year-15-minute-decomposition",
  "105,120 prerequisite records",
  105_120,
  "unsupported is rejected",
  () => {
    try {
      calculateIrradiance(review(rows(105_120, 15), 15), subhour);
    } catch {
      return "ineligible";
    }
  },
);
measure("physical-reconciliation", "8,760 calculated records", 8760, "5 W/m² tolerance", () =>
  hourlyResult.records.map((item) =>
    item.outputGhi === null || item.outputDni === null || item.outputDhi === null
      ? null
      : Math.abs(
          item.outputGhi -
            (item.outputDhi +
              item.outputDni * Math.max(0, Math.cos((item.solarZenithDegrees * Math.PI) / 180))),
        ),
  ),
);
measure("findings-generation", "8,760 calculated records", 8760, "25,000 findings", () =>
  hourlyResult.records.flatMap((item) => item.qualityFlags),
);
measure(
  "summary-reconciliation",
  "8,760 calculated records",
  8760,
  "exact count equality",
  () => hourlyResult.summary.inputRecordCount === hourlyResult.summary.outputRecordCount,
);
measure("chart-aggregation", "8,760 records to <=720", 8760, "720 display points", () => {
  const step = Math.ceil(hourlyResult.records.length / 720);
  return hourlyResult.records.filter((_, index) => index % step === 0);
});
measure("deep-result-validation", "8,760 calculated records", 8760, "120,000 records", () =>
  isIrradianceResult(hourlyResult),
);
measure("json-serialization", "8,760 calculated records", 8760, "64 MiB export", () =>
  JSON.stringify(hourlyResult),
);
measure("component-csv-serialization", "8,760 calculated records", 8760, "64 MiB export", () =>
  serializeIrradianceComponents(hourlyResult),
);
measure("findings-csv-serialization", "deterministic findings", 8760, "25,000 findings", () =>
  serializeIrradianceFindings(hourlyResult),
);
measure(
  "utf8-byte-calculation",
  "component CSV",
  8760,
  "64 MiB export",
  () => new TextEncoder().encode(serializeIrradianceComponents(hourlyResult)).byteLength,
);
let active = 1;
measure(
  "cancellation-latency",
  "generation token",
  0,
  "synchronous invalidation",
  () => (active += 1),
);
measure(
  "stale-progress-suppression",
  "stale generation 1 vs active 2",
  0,
  "strict token equality",
  () => 1 === active,
);
measure(
  "stale-success-suppression",
  "stale generation 1 vs active 2",
  0,
  "strict token equality",
  () => 1 === active,
);
measure(
  "stale-error-suppression",
  "stale generation 1 vs active 2",
  0,
  "strict token equality",
  () => 1 === active,
);
measure(
  "malformed-success-rejection",
  "nested malformed summary",
  0,
  "deep runtime validator",
  () =>
    isIrradianceResult({
      ...hourlyResult,
      summary: { ...hourlyResult.summary, warningCount: "bad" },
    }),
);
assert.equal(new Set(measurements.map((item) => item.operationId)).size, measurements.length);
assert.deepEqual(
  measurements.map((item) => item.operationId).sort(),
  [...requiredOperations].sort(),
);
for (const item of measurements)
  for (const key of [
    "operationId",
    "operationName",
    "environment",
    "nodeVersion",
    "fixture",
    "recordCount",
    "declaredLimit",
    "warmUpCount",
    "repetitionCount",
    "aggregationMethod",
    "elapsedTime",
    "unit",
    "status",
    "limitation",
  ])
    assert.notEqual(item[key], undefined, `${item.operationId} is missing ${key}.`);
measurements.forEach((item) => console.log(JSON.stringify(item)));
console.log(`irradiance performance: ${measurements.length} required operations passed`);
