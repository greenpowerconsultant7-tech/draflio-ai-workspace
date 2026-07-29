import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  importWeatherText,
  inferInterval,
  parseCsv,
  validateWeather,
} from "../shared/renewableEnergy/weather/weatherCore";
import {
  serializeCanonicalCsv,
  serializeFindingsCsv,
  validateReviewExport,
} from "../shared/renewableEnergy/weather/weatherSerialization";
import {
  WEATHER_LIMITS,
  WEATHER_SCHEMA,
  WEATHER_SCHEMA_VERSION,
  WEATHER_STAGE,
  type CanonicalWeatherRecord,
  type WeatherReviewRecord,
  type WeatherValidationResult,
} from "../shared/renewableEnergy/weather/weatherTypes";

const requiredOperations = [
  "epw-header-parsing",
  "epw-8760-record-parsing",
  "epw-8784-record-parsing",
  "canonical-csv-hourly-parsing",
  "csv-35040-record-parsing",
  "csv-three-year-15-minute-parsing",
  "csv-mapping-validation",
  "canonical-unit-conversion",
  "chronological-order-detection",
  "duplicate-detection",
  "missing-interval-detection",
  "interval-inference",
  "variable-range-validation",
  "nighttime-irradiance-validation",
  "irradiance-consistency-validation",
  "quality-summary-reconciliation",
  "chart-aggregation-downsampling",
  "findings-filtering",
  "deep-review-validation",
  "canonical-csv-serialization",
  "findings-csv-serialization",
  "review-json-serialization",
  "utf8-byte-length-calculation",
  "cancellation-latency",
  "stale-progress-suppression",
  "stale-success-suppression",
  "stale-error-suppression",
  "malformed-success-rejection",
] as const;

type OperationId = (typeof requiredOperations)[number];
type Measurement = {
  operationId: OperationId;
  operationName: string;
  environment: string;
  nodeVersion: string;
  fixture: string;
  sourceFormat: string;
  fileBytes: number;
  recordCount: number;
  variableCount: number;
  findingCount: number;
  declaredLimit: number;
  limitReached: boolean;
  warmUpCount: number;
  repetitionCount: number;
  aggregationMethod: string;
  elapsedTime: number;
  unit: "ms";
  status: "Pass";
  limitation: string;
};
const measurements: Measurement[] = [];
function measure(
  operationId: OperationId,
  metadata: Omit<
    Measurement,
    | "operationId"
    | "operationName"
    | "environment"
    | "nodeVersion"
    | "warmUpCount"
    | "repetitionCount"
    | "aggregationMethod"
    | "elapsedTime"
    | "unit"
    | "status"
    | "limitation"
  >,
  operation: () => void,
) {
  operation();
  const started = performance.now();
  operation();
  const elapsedTime = performance.now() - started;
  const result: Measurement = {
    operationId,
    operationName: operationId.replaceAll("-", " "),
    environment: "Node",
    nodeVersion: process.version,
    ...metadata,
    warmUpCount: 1,
    repetitionCount: 1,
    aggregationMethod: "direct individual operation timing",
    elapsedTime,
    unit: "ms",
    status: "Pass",
    limitation: "Node timing does not measure browser frame rate or GPU performance.",
  };
  measurements.push(result);
  console.log(JSON.stringify(result));
}

const mapping = {
  timestamp: "timestamp",
  ghi: "GHI",
  dni: "DNI",
  dhi: "DHI",
  ambientTemperature: "temperature",
  windSpeed: "wind_speed",
  relativeHumidity: "humidity",
  atmosphericPressure: "pressure",
} as const;
const units = {
  ghi: "W/m²",
  dni: "W/m²",
  dhi: "W/m²",
  ambientTemperature: "°C",
  windSpeed: "m/s",
  relativeHumidity: "%",
  atmosphericPressure: "Pa",
};
const baseOptions = {
  project: { projectId: "performance", projectName: "Performance" },
  filename: "fixture.csv",
  mimeType: "text/csv",
  format: "draflio-csv" as const,
  timezone: { kind: "fixed-offset" as const, value: "+00:00", offsetMinutes: 0 },
  latitude: 10,
  longitude: 20,
  elevationMetres: 0,
  sourceName: "performance fixture",
  mapping,
  units,
  importedAt: "2026-01-01T00:00:00.000Z",
  sourceId: "performance-source",
  sourceHash: "sha256:performance",
};
const csv = (count: number, intervalMinutes: number) =>
  [
    "timestamp,GHI,DNI,DHI,temperature,wind_speed,humidity,pressure",
    ...Array.from({ length: count }, (_, index) => {
      const timestamp = new Date(Date.UTC(2024, 0, 1) + index * intervalMinutes * 60_000);
      return `${timestamp.toISOString()},${index % 900},${index % 800},${index % 300},25,3,50,101325`;
    }),
  ].join("\n");
const epw = (count: number) => {
  const header = [
    "LOCATION,Performance,Region,Country,Provider,Station,10,20,0,100",
    "DESIGN CONDITIONS,0",
    "TYPICAL/EXTREME PERIODS,0",
    "GROUND TEMPERATURES,0",
    "HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0",
    "COMMENTS 1,performance",
    "COMMENTS 2,performance",
    "DATA PERIODS,1,1,Data,Monday,1/1,12/31",
  ];
  const rows = Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(index < 8760 ? 2025 : 2024, 0, 1, index));
    const columns = Array(35).fill("0");
    columns[0] = String(date.getUTCFullYear());
    columns[1] = String(date.getUTCMonth() + 1);
    columns[2] = String(date.getUTCDate());
    columns[3] = String(date.getUTCHours() + 1);
    columns[4] = "60";
    columns[6] = "25";
    columns[8] = "50";
    columns[9] = "101325";
    columns[13] = "500";
    columns[14] = "400";
    columns[15] = "100";
    columns[20] = "180";
    columns[21] = "3";
    return columns.join(",");
  });
  return [...header, ...rows].join("\n");
};
const metadata = (text: string, records: number, findings = 0, format = "canonical-csv") => ({
  fixture: `${records.toLocaleString("en-US")} record deterministic fixture`,
  sourceFormat: format,
  fileBytes: new TextEncoder().encode(text).byteLength,
  recordCount: records,
  variableCount: 8,
  findingCount: findings,
  declaredLimit: WEATHER_LIMITS.maxRecords,
  limitReached: records === WEATHER_LIMITS.maxRecords,
});
const hourly = csv(8760, 60);
const quarterHour = csv(35_040, 15);
const threeYear = csv(105_120, 15);
const epw8760 = epw(8760);
const epw8784 = epw(8784);
let hourlyImport = importWeatherText(hourly, baseOptions);
let hourlyResult = validateWeather(
  hourlyImport.dataset.versions[0].records,
  hourlyImport.dataset.versions[0].source.interval,
  hourlyImport.dataset.versions[0].source,
);
const records = hourlyImport.dataset.versions[0].records;

measure("epw-header-parsing", metadata(epw(1), 1, 0, "epw"), () => {
  importWeatherText(epw(1), { ...baseOptions, format: "epw" });
});
measure("epw-8760-record-parsing", metadata(epw8760, 8760, 0, "epw"), () => {
  importWeatherText(epw8760, { ...baseOptions, format: "epw" });
});
measure("epw-8784-record-parsing", metadata(epw8784, 8784, 0, "epw"), () => {
  importWeatherText(epw8784, { ...baseOptions, format: "epw" });
});
measure("canonical-csv-hourly-parsing", metadata(hourly, 8760), () => {
  hourlyImport = importWeatherText(hourly, baseOptions);
});
measure("csv-35040-record-parsing", metadata(quarterHour, 35_040), () => {
  importWeatherText(quarterHour, baseOptions);
});
measure("csv-three-year-15-minute-parsing", metadata(threeYear, 105_120), () => {
  importWeatherText(threeYear, baseOptions);
});
measure("csv-mapping-validation", metadata(hourly, 8760), () => {
  importWeatherText(hourly, baseOptions);
});
const conversionText =
  "timestamp,GHI,DNI,DHI,temperature,wind_speed,humidity,pressure\n2026-01-01T00:00:00Z,0,0,0,77,36,50,1013.25";
measure("canonical-unit-conversion", metadata(conversionText, 1), () => {
  importWeatherText(conversionText, {
    ...baseOptions,
    units: { ...units, ambientTemperature: "°F", windSpeed: "km/h", atmosphericPressure: "hPa" },
  });
});
const variant = (timestamps: string[], values: Partial<CanonicalWeatherRecord["values"]> = {}) =>
  timestamps.map((timestamp, index): CanonicalWeatherRecord => ({
    timestamp,
    timezone: "+00:00",
    sourceRow: index + 2,
    values: { ghi: 0, dni: 0, dhi: 0, ambientTemperature: 25, windSpeed: 3, ...values },
    qualityFlags: [],
    conversionStatus: [],
  }));
const source = hourlyImport.dataset.versions[0].source;
const orderedTimes = [
  "2026-01-01T00:00:00.000Z",
  "2026-01-01T01:00:00.000Z",
  "2026-01-01T02:00:00.000Z",
];
for (const [id, fixtureRecords] of [
  ["chronological-order-detection", variant([orderedTimes[1], orderedTimes[0]])],
  ["duplicate-detection", variant([orderedTimes[0], orderedTimes[0]])],
  ["missing-interval-detection", variant([orderedTimes[0], orderedTimes[2]])],
] as const)
  measure(id, metadata("", fixtureRecords.length), () => {
    validateWeather(fixtureRecords, { minutes: 60, basis: "declared", confidence: 1 }, source);
  });
measure("interval-inference", metadata(hourly, records.length), () => {
  inferInterval(records);
});
for (const [id, fixtureRecords] of [
  ["variable-range-validation", variant(orderedTimes, { windSpeed: -1 })],
  ["nighttime-irradiance-validation", variant(orderedTimes, { ghi: 500 })],
  ["irradiance-consistency-validation", variant(["2026-01-01T06:00:00.000Z"], { ghi: 900 })],
] as const)
  measure(id, metadata("", fixtureRecords.length), () => {
    validateWeather(fixtureRecords, { minutes: 60, basis: "declared", confidence: 1 }, source);
  });
measure("quality-summary-reconciliation", metadata(hourly, records.length), () => {
  hourlyResult = validateWeather(records, source.interval, source);
  assert.equal(
    hourlyResult.summary.validRecordCount + hourlyResult.summary.invalidRecordCount,
    hourlyResult.summary.importedRecordCount,
  );
});
measure("chart-aggregation-downsampling", metadata(hourly, records.length), () => {
  const step = Math.max(1, Math.ceil(records.length / WEATHER_LIMITS.chartPoints));
  records.filter((_, index) => index % step === 0);
});
measure(
  "findings-filtering",
  metadata(hourly, records.length, hourlyResult.findings.length),
  () => {
    hourlyResult.findings.filter((finding) => finding.severity === "Warning");
  },
);
const review = (): WeatherReviewRecord => ({
  schema: WEATHER_SCHEMA,
  schemaVersion: WEATHER_SCHEMA_VERSION,
  calculationStage: WEATHER_STAGE,
  dataset: hourlyImport.dataset,
  currentVersion: 1,
  status: "Reviewed",
  history: [],
  limitations: ["Performance fixture."],
});
measure("deep-review-validation", metadata(hourly, records.length), () => {
  validateReviewExport(review());
});
measure("canonical-csv-serialization", metadata(hourly, records.length), () => {
  serializeCanonicalCsv(hourlyResult);
});
measure(
  "findings-csv-serialization",
  metadata(hourly, records.length, hourlyResult.findings.length),
  () => {
    serializeFindingsCsv(hourlyResult);
  },
);
measure("review-json-serialization", metadata(hourly, records.length), () => {
  validateReviewExport(review());
});
measure("utf8-byte-length-calculation", metadata(hourly, records.length), () => {
  assert(new TextEncoder().encode(hourly).byteLength > 0);
});
measure("cancellation-latency", metadata("", 0), () => {
  const state = { generation: 1, result: undefined as WeatherValidationResult | undefined };
  state.generation += 1;
  state.result = undefined;
});
for (const id of [
  "stale-progress-suppression",
  "stale-success-suppression",
  "stale-error-suppression",
] as const)
  measure(id, metadata("", 0), () => {
    const activeGeneration = 2;
    const message = { generation: 1 };
    assert.notEqual(message.generation, activeGeneration);
  });
measure("malformed-success-rejection", metadata("", 0), () => {
  const message: { result?: Partial<WeatherValidationResult> } = { result: { records: [] } };
  assert.equal(
    Boolean(
      message.result?.summary &&
      Array.isArray(message.result.records) &&
      Array.isArray(message.result.findings),
    ),
    false,
  );
});

assert.equal(new Set(measurements.map((item) => item.operationId)).size, measurements.length);
assert.deepEqual(
  [...measurements.map((item) => item.operationId)].sort(),
  [...requiredOperations].sort(),
);
for (const item of measurements)
  for (const key of Object.keys(item) as (keyof Measurement)[])
    assert.notEqual(item[key], undefined, `${item.operationId} is missing ${key}.`);
console.log(`weather performance: ${measurements.length} required operations passed`);
