import assert from "node:assert/strict";
import {
  IRRADIANCE_MODELS,
  buildIrradianceInputReference,
  calculateIrradiance,
  erbsDiffuseFraction,
  extraterrestrialNormalIrradiance,
} from "../shared/renewableEnergy/irradiance/irradianceCore";
import { IRRADIANCE_BENCHMARKS } from "../shared/renewableEnergy/irradiance/irradianceBenchmarks";
import {
  IRRADIANCE_CALCULATION_VERSION,
  IRRADIANCE_SCHEMA,
  IRRADIANCE_SCHEMA_VERSION,
  type IrradianceModelConfiguration,
  type IrradianceReviewRecord,
} from "../shared/renewableEnergy/irradiance/irradianceTypes";
import {
  IRRADIANCE_COMPONENT_COLUMNS,
  serializeIrradianceComponents,
  serializeIrradianceFindings,
  serializeIrradianceReview,
} from "../shared/renewableEnergy/irradiance/irradianceSerialization";
import {
  isIrradianceResult,
  validateIrradianceRequest,
  validateIrradianceReview,
} from "../shared/renewableEnergy/irradiance/irradianceValidation";
import {
  WEATHER_PARSER_VERSION,
  WEATHER_SCHEMA,
  WEATHER_SCHEMA_VERSION,
  WEATHER_STAGE,
  WEATHER_VALIDATION_VERSION,
  type CanonicalWeatherRecord,
  type WeatherReviewRecord,
} from "../shared/renewableEnergy/weather/weatherTypes";

const record = (
  timestamp: string,
  sourceRow: number,
  ghi: number | null,
  dni: number | null,
  dhi: number | null,
): CanonicalWeatherRecord => ({
  timestamp,
  timezone: "+00:00",
  sourceRow,
  values: { ghi, dni, dhi },
  qualityFlags: [],
  conversionStatus: [],
});
const weatherReview = (
  records: CanonicalWeatherRecord[],
  status: WeatherReviewRecord["status"] = "Approved for preliminary modelling",
  minutes = 60,
): WeatherReviewRecord => ({
  schema: WEATHER_SCHEMA,
  schemaVersion: WEATHER_SCHEMA_VERSION,
  calculationStage: WEATHER_STAGE,
  dataset: {
    datasetId: "weather-1",
    project: { projectId: "solar-1", projectName: "Solar one" },
    versions: [
      {
        version: 1,
        createdAt: "2024-01-01T00:00:00.000Z",
        source: {
          projectId: "solar-1",
          sourceId: "source-1",
          filename: "weather.csv",
          format: "draflio-csv",
          mimeType: "text/csv",
          byteSize: 10,
          sourceHash: "sha256:abc",
          importedAt: "2024-01-01T00:00:00.000Z",
          originalHeaderMetadata: {},
          declaredLocation: "0,0",
          latitude: 0,
          longitude: 0,
          elevationMetres: 0,
          timezone: { kind: "fixed-offset", value: "+00:00", offsetMinutes: 0 },
          sourceProvider: "test",
          sourcePeriod: "2024",
          interval: { minutes, basis: "declared", confidence: 1 },
          sourceUnits: { ghi: "W/m²", dni: "W/m²", dhi: "W/m²" },
          parserVersion: WEATHER_PARSER_VERSION,
          validationVersion: WEATHER_VALIDATION_VERSION,
          notes: "",
          reviewStatus: status,
          originalText: "fixture",
        },
        records,
        findings: [],
        summary: null,
      },
    ],
  },
  currentVersion: 1,
  status,
  history: [],
  limitations: [],
});
const erbs: IrradianceModelConfiguration = {
  modelId: "erbs-hourly",
  modelVersion: "1982-1.0",
  lowSunElevationDegrees: 5,
  reconciliationToleranceWattsPerSquareMetre: 5,
};
const passThrough: IrradianceModelConfiguration = {
  ...erbs,
  modelId: "measured-pass-through",
  modelVersion: "1.0",
};
const noon = record("2024-03-20T12:00:00.000Z", 2, 800, null, null);
const measured = record("2024-03-20T13:00:00.000Z", 3, 700, 500, 220);
const night = record("2024-03-20T00:00:00.000Z", 4, 0, null, null);
const result = calculateIrradiance(weatherReview([noon, measured, night]), erbs);
assert.equal(result.records.length, 3);
assert.equal(result.records[0].ghiOrigin, "Measured");
assert.equal(result.records[0].dniOrigin, "Estimated");
assert.equal(result.records[0].dhiOrigin, "Estimated");
assert.equal(result.records[0].outputGhi, 800);
assert.equal(result.records[1].outputDni, 500);
assert.equal(result.records[1].outputDhi, 220);
assert.equal(result.records[1].dniOrigin, "Measured");
assert.equal(result.records[2].notEvaluatedReason, "SUN_BELOW_HORIZON");
assert.equal(result.summary.inputRecordCount, result.summary.outputRecordCount);
assert(isIrradianceResult(result));
assert.equal(calculateIrradiance(weatherReview([measured]), passThrough).records[0].outputGhi, 700);
assert.equal(
  calculateIrradiance(weatherReview([record("2024-03-20T12:00:00.000Z", 5, 800, null, 150)]), erbs)
    .records[0].dhiOrigin,
  "Measured",
);
assert.equal(
  calculateIrradiance(
    weatherReview([record("2024-03-20T12:00:00.000Z", 6, null, null, null)]),
    erbs,
  ).records[0].notEvaluatedReason,
  "GHI_MISSING",
);
const negativeResult = calculateIrradiance(
  weatherReview([record("2024-03-20T12:00:00.000Z", 7, -1, null, null)]),
  erbs,
);
assert.equal(negativeResult.records[0].calculationStatus, "Invalid");
assert.equal(negativeResult.records[0].ghiOrigin, "Invalid");
assert.equal(negativeResult.records[0].outputGhi, null);
assert.equal(negativeResult.summary.excludedRecordCount, 1);
const nonFiniteResult = calculateIrradiance(
  weatherReview([record("2024-03-20T12:00:00.000Z", 8, Number.NaN, null, null)]),
  erbs,
);
assert.equal(nonFiniteResult.records[0].calculationStatus, "Invalid");
assert.equal(nonFiniteResult.records[0].notEvaluatedReason, "GHI_INVALID");
assert.throws(() => calculateIrradiance(weatherReview([noon], "Imported"), erbs), /not approved/);
assert.throws(() => calculateIrradiance(weatherReview([noon], "Stale"), erbs), /Stale/);
assert.throws(
  () => calculateIrradiance(weatherReview([noon], "Approved for preliminary modelling", 15), erbs),
  /unsupported/,
);
assert.throws(() => erbsDiffuseFraction(-0.1), /0–1/);
assert.equal(erbsDiffuseFraction(0.22), 0.9802);
assert(Math.abs(erbsDiffuseFraction(0.8) - 0.16526959999999757) < 1e-12);
assert.equal(erbsDiffuseFraction(0.81), 0.165);
assert(Math.abs(extraterrestrialNormalIrradiance(1) - 1412.1043163185625) < 1e-9);
assert.throws(() => extraterrestrialNormalIrradiance(0), /1 to 366/);
assert.deepEqual(
  calculateIrradiance(weatherReview([noon]), erbs),
  calculateIrradiance(weatherReview([noon]), erbs),
);
assert.deepEqual(
  result.records.map((item) => item.sourceRow),
  [2, 3, 4],
);
assert.equal(IRRADIANCE_MODELS.length, 2);
assert.equal(
  IRRADIANCE_BENCHMARKS.every((benchmark) => benchmark.status === "Pass"),
  true,
);
assert.deepEqual(
  new Set(IRRADIANCE_BENCHMARKS.map((benchmark) => benchmark.modelId)),
  new Set(["measured-pass-through", "erbs-hourly"]),
);
const input = buildIrradianceInputReference(weatherReview([noon]));
assert.equal(input.weatherResourceVersion, 1);
assert.equal(input.availability[0].valid, 1);
validateIrradianceRequest({
  type: "calculate",
  generation: 1,
  weatherReview: weatherReview([noon]),
  configuration: erbs,
});
assert.throws(() => validateIrradianceRequest({ type: "calculate", generation: 1 }), /Malformed/);
assert.equal(
  isIrradianceResult({ ...result, summary: { ...result.summary, inputRecordCount: 99 } }),
  false,
);
const review: IrradianceReviewRecord = {
  schema: IRRADIANCE_SCHEMA,
  schemaVersion: IRRADIANCE_SCHEMA_VERSION,
  study: {
    studyId: "study-1",
    projectId: "solar-1",
    weatherResourceId: "weather-1",
    versions: [
      {
        version: 1,
        createdAt: "2024-01-01T00:00:00.000Z",
        input,
        configuration: erbs,
        records: result.records,
        findings: result.findings,
        summary: result.summary,
        calculationTimestamp: "2024-01-01T00:00:00.000Z",
        calculationVersion: IRRADIANCE_CALCULATION_VERSION,
        solarPositionVersion: "re7a-noaa-solar-position-1.0",
        assumptions: [],
        limitations: [],
      },
    ],
  },
  currentVersion: 1,
  status: "Reviewed",
  history: [],
  reviewerNotes: "",
};
assert.equal(JSON.parse(serializeIrradianceReview(review)).schema, IRRADIANCE_SCHEMA);
assert.throws(() => validateIrradianceReview(review, "other"), /Cross-project/);
const componentCsv = serializeIrradianceComponents({
  ...result,
  records: [{ ...result.records[0], timezone: "=unsafe" }],
  summary: { ...result.summary, inputRecordCount: 1, outputRecordCount: 1 },
});
assert.equal(componentCsv.split("\r\n")[0], IRRADIANCE_COMPONENT_COLUMNS.join(","));
assert(componentCsv.includes("'=unsafe"));
assert(!componentCsv.includes(",,0,"));
assert(serializeIrradianceFindings(result).startsWith("finding_id,code,severity"));
console.log("irradiance core: 40 checks passed");
