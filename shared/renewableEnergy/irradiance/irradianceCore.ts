import { calculateSunPosition } from "../shading/shadingCore";
import type { CanonicalWeatherRecord, WeatherReviewRecord } from "../weather/weatherTypes";
import {
  IRRADIANCE_CALCULATION_VERSION,
  IRRADIANCE_LIMITS,
  type IrradianceCalculationResult,
  type IrradianceFinding,
  type IrradianceInputReference,
  type IrradianceModelConfiguration,
  type IrradianceModelDefinition,
  type IrradianceOutputRecord,
  type IrradianceReasonCode,
  type IrradianceVariableAvailability,
} from "./irradianceTypes";

export const IRRADIANCE_MODELS: readonly IrradianceModelDefinition[] = [
  {
    modelId: "measured-pass-through",
    name: "Measured component pass-through",
    version: "1.0",
    category: "irradiance decomposition",
    reference: "Draflio measured-component precedence rule RE8B",
    requiredInputs: ["measured GHI", "measured DNI", "measured DHI"],
    optionalInputs: [],
    supportedIntervalMinutes: [15, 30, 60],
    minimumSolarElevationDegrees: 0,
    clearnessIndexRange: [0, 2],
    outputVariables: ["ghi", "dni", "dhi"],
    validityRange: "Finite, non-negative and physically reconcilable measured components.",
    configurationSchema: "No fitted parameters.",
    benchmarkStatus: "Validated",
    knownLimitations: ["Does not estimate any missing component."],
    unsupportedConditions: ["Missing or invalid measured component."],
  },
  {
    modelId: "erbs-hourly",
    name: "Erbs hourly diffuse-fraction decomposition",
    version: "1982-1.0",
    category: "irradiance decomposition",
    reference:
      "Erbs, Klein and Duffie (1982), Estimation of the diffuse radiation fraction for hourly, daily and monthly-average global radiation.",
    requiredInputs: ["measured GHI", "solar position", "extraterrestrial horizontal irradiance"],
    optionalInputs: ["measured DNI", "measured DHI"],
    supportedIntervalMinutes: [60],
    minimumSolarElevationDegrees: IRRADIANCE_LIMITS.lowSunElevationDegrees,
    clearnessIndexRange: [0, 1],
    outputVariables: ["ghi", "dni", "dhi"],
    validityRange: "Hourly GHI; clearness index 0–1; solar elevation at least 5°.",
    configurationSchema: "lowSunElevationDegrees=5; reconciliationToleranceWattsPerSquareMetre=5",
    benchmarkStatus: "Validated",
    knownLimitations: [
      "Empirical hourly correlation; uncertainty increases at low sun and unusual atmospheric conditions.",
      "No plane-of-array or electrical calculation.",
    ],
    unsupportedConditions: ["Night", "sub-hourly input", "missing/invalid GHI", "Kt outside 0–1"],
  },
] as const;

const finiteValue = (record: CanonicalWeatherRecord, key: "ghi" | "dni" | "dhi") => {
  const value = record.values[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};
export function extraterrestrialNormalIrradiance(dayOfYear: number) {
  if (!Number.isInteger(dayOfYear) || dayOfYear < 1 || dayOfYear > 366)
    throw new Error("Day of year must be an integer from 1 to 366.");
  return 1367 * (1 + 0.033 * Math.cos((2 * Math.PI * dayOfYear) / 365));
}
export function erbsDiffuseFraction(clearnessIndex: number) {
  if (!Number.isFinite(clearnessIndex) || clearnessIndex < 0 || clearnessIndex > 1)
    throw new Error("Erbs clearness index must be finite and within 0–1.");
  if (clearnessIndex <= 0.22) return 1 - 0.09 * clearnessIndex;
  if (clearnessIndex <= 0.8)
    return (
      0.9511 -
      0.1604 * clearnessIndex +
      4.388 * clearnessIndex ** 2 -
      16.638 * clearnessIndex ** 3 +
      12.336 * clearnessIndex ** 4
    );
  return 0.165;
}
const dayOfYear = (date: Date) =>
  Math.floor(
    (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
      Date.UTC(date.getUTCFullYear(), 0, 0)) /
      86_400_000,
  );
const stableFindingId = (code: string, row: number) => `${code}:${row}`;
const finding = (
  code: string,
  record: CanonicalWeatherRecord,
  explanation: string,
  blocking: boolean,
): IrradianceFinding => ({
  id: stableFindingId(code, record.sourceRow),
  code,
  severity: blocking ? "Error" : "Warning",
  timestamp: record.timestamp,
  sourceRow: record.sourceRow,
  explanation,
  recommendedAction: blocking
    ? "Correct or explicitly replace the source input before calculation."
    : "Review the model limitation and resulting component estimate.",
  evidence: `source row ${record.sourceRow}`,
  modellingBlocked: blocking,
  acknowledged: false,
});
function notEvaluated(
  record: CanonicalWeatherRecord,
  config: IrradianceModelConfiguration,
  sun: ReturnType<typeof calculateSunPosition>,
  normal: number,
  horizontal: number,
  reason: IrradianceReasonCode,
  explanation: string,
  invalid = false,
): IrradianceOutputRecord {
  const ghi = finiteValue(record, "ghi");
  const dni = finiteValue(record, "dni");
  const dhi = finiteValue(record, "dhi");
  return {
    timestamp: record.timestamp,
    timezone: record.timezone,
    sourceRow: record.sourceRow,
    solarElevationDegrees: sun.elevationDegrees,
    solarZenithDegrees: sun.zenithDegrees,
    extraterrestrialNormal: normal,
    extraterrestrialHorizontal: horizontal,
    clearnessIndex: null,
    inputGhi: ghi,
    inputDni: dni,
    inputDhi: dhi,
    outputGhi: invalid ? null : ghi,
    outputDni: invalid ? null : dni,
    outputDhi: invalid ? null : dhi,
    ghiOrigin: invalid ? "Invalid" : ghi === null ? "Not evaluated" : "Measured",
    dniOrigin: invalid ? "Invalid" : dni === null ? "Not evaluated" : "Measured",
    dhiOrigin: invalid ? "Invalid" : dhi === null ? "Not evaluated" : "Measured",
    modelId: config.modelId,
    modelVersion: config.modelVersion,
    eligibility: invalid ? "Ineligible" : "Not evaluated",
    calculationStatus: invalid ? "Invalid" : "Not evaluated",
    qualityFlags: [{ code: reason, severity: invalid ? "Error" : "Not evaluated", explanation }],
    warnings: [explanation],
    notEvaluatedReason: reason,
    calculationVersion: IRRADIANCE_CALCULATION_VERSION,
  };
}
export function buildIrradianceInputReference(
  review: WeatherReviewRecord,
): IrradianceInputReference {
  const version = review.dataset.versions.find((item) => item.version === review.currentVersion);
  if (!version) throw new Error("Weather source version mismatch.");
  const availability = (["ghi", "dni", "dhi"] as const).map((variable) => {
    const values = version.records.map((record) => record.values[variable]);
    return {
      variable,
      measured: values.filter((value) => value !== null && value !== undefined).length,
      valid: values.filter(
        (value) => typeof value === "number" && Number.isFinite(value) && value >= 0,
      ).length,
      missing: values.filter((value) => value === null || value === undefined).length,
      invalid: values.filter(
        (value) =>
          value !== null &&
          value !== undefined &&
          (typeof value !== "number" || !Number.isFinite(value) || value < 0),
      ).length,
    } satisfies IrradianceVariableAvailability;
  });
  return {
    projectId: review.dataset.project.projectId,
    weatherResourceId: review.dataset.datasetId,
    weatherResourceVersion: review.currentVersion,
    weatherApprovalState: review.status,
    sourceHash: version.source.sourceHash,
    latitude: version.source.latitude,
    longitude: version.source.longitude,
    elevationMetres: version.source.elevationMetres,
    timezone: version.source.timezone,
    interval: version.source.interval,
    sourcePeriod: version.source.sourcePeriod,
    availability,
  };
}
export function calculateIrradiance(
  review: WeatherReviewRecord,
  config: IrradianceModelConfiguration,
  onProgress?: (percent: number, stage: string) => void,
): IrradianceCalculationResult {
  const input = buildIrradianceInputReference(review);
  if (review.status !== "Approved for preliminary modelling")
    throw new Error(
      review.status === "Stale"
        ? "Stale weather review is ineligible."
        : "Weather input is not approved.",
    );
  if (input.latitude === null || input.longitude === null)
    throw new Error("Weather location is invalid.");
  if (!input.timezone) throw new Error("Weather timezone is invalid.");
  if (
    !input.interval ||
    !IRRADIANCE_MODELS.find(
      (model) => model.modelId === config.modelId,
    )?.supportedIntervalMinutes.includes(input.interval.minutes)
  )
    throw new Error("Weather sampling interval is unsupported by the selected model.");
  const version = review.dataset.versions.find((item) => item.version === review.currentVersion);
  if (!version) throw new Error("Weather source version mismatch.");
  if (version.records.length > IRRADIANCE_LIMITS.maxRecords)
    throw new Error("Irradiance record limit exceeded.");
  const records: IrradianceOutputRecord[] = [];
  const findings: IrradianceFinding[] = [];
  for (let index = 0; index < version.records.length; index += 1) {
    const record = version.records[index];
    const date = new Date(record.timestamp);
    const sun = calculateSunPosition(date, {
      latitudeDegrees: input.latitude,
      longitudeDegrees: input.longitude,
      timezone: input.timezone.value,
      fixedOffsetMinutes: input.timezone.offsetMinutes,
      daylightSaving: input.timezone.kind === "iana" ? "iana-rules" : "not-applicable-fixed-offset",
      projectNorthDegrees: 0,
    });
    const normal = extraterrestrialNormalIrradiance(dayOfYear(date));
    const cosineZenith = Math.max(0, Math.cos((sun.zenithDegrees * Math.PI) / 180));
    const horizontal = normal * cosineZenith;
    const ghi = finiteValue(record, "ghi");
    const dni = finiteValue(record, "dni");
    const dhi = finiteValue(record, "dhi");
    const rawIrradiance = [record.values.ghi, record.values.dni, record.values.dhi];
    const hasNonFinite = rawIrradiance.some(
      (value) => typeof value === "number" && !Number.isFinite(value),
    );
    if (hasNonFinite || [ghi, dni, dhi].some((value) => value !== null && value < 0)) {
      const explanation = hasNonFinite
        ? "Non-finite irradiance is invalid."
        : "Negative irradiance is invalid.";
      records.push(
        notEvaluated(record, config, sun, normal, horizontal, "GHI_INVALID", explanation, true),
      );
      findings.push(finding("GHI_INVALID", record, explanation, true));
      continue;
    }
    if (config.modelId === "measured-pass-through") {
      if (ghi === null || dni === null || dhi === null) {
        records.push(
          notEvaluated(
            record,
            config,
            sun,
            normal,
            horizontal,
            "REQUIRED_INPUT_MISSING",
            "Measured pass-through requires GHI, DNI and DHI.",
          ),
        );
        continue;
      }
      const difference = Math.abs(ghi - (dhi + dni * cosineZenith));
      const flags =
        difference > config.reconciliationToleranceWattsPerSquareMetre
          ? [
              {
                code: "COMPONENT_RECONCILIATION",
                severity: "Warning" as const,
                explanation: `Measured components differ by ${difference.toFixed(3)} W/m².`,
              },
            ]
          : [];
      records.push({
        timestamp: record.timestamp,
        timezone: record.timezone,
        sourceRow: record.sourceRow,
        solarElevationDegrees: sun.elevationDegrees,
        solarZenithDegrees: sun.zenithDegrees,
        extraterrestrialNormal: normal,
        extraterrestrialHorizontal: horizontal,
        clearnessIndex: horizontal > 1e-9 ? ghi / horizontal : null,
        inputGhi: ghi,
        inputDni: dni,
        inputDhi: dhi,
        outputGhi: ghi,
        outputDni: dni,
        outputDhi: dhi,
        ghiOrigin: "Measured",
        dniOrigin: "Measured",
        dhiOrigin: "Measured",
        modelId: config.modelId,
        modelVersion: config.modelVersion,
        eligibility: flags.length ? "Eligible with warnings" : "Eligible",
        calculationStatus: "Measured pass-through",
        qualityFlags: flags,
        warnings: flags.map((flag) => flag.explanation),
        notEvaluatedReason: null,
        calculationVersion: IRRADIANCE_CALCULATION_VERSION,
      });
      if (flags.length)
        findings.push(finding("COMPONENT_RECONCILIATION", record, flags[0].explanation, false));
      continue;
    }
    if (ghi === null) {
      records.push(
        notEvaluated(
          record,
          config,
          sun,
          normal,
          horizontal,
          "GHI_MISSING",
          "Measured GHI is required.",
        ),
      );
      continue;
    }
    if (sun.belowHorizon) {
      records.push(
        notEvaluated(
          record,
          config,
          sun,
          normal,
          horizontal,
          "SUN_BELOW_HORIZON",
          "The sun is below the horizon.",
        ),
      );
      continue;
    }
    if (sun.elevationDegrees < config.lowSunElevationDegrees) {
      records.push(
        notEvaluated(
          record,
          config,
          sun,
          normal,
          horizontal,
          "LOW_SOLAR_ELEVATION",
          "Solar elevation is below the configured numerical guard.",
        ),
      );
      continue;
    }
    if (!Number.isFinite(horizontal) || horizontal <= 1e-9) {
      records.push(
        notEvaluated(
          record,
          config,
          sun,
          normal,
          horizontal,
          "EXTRATERRESTRIAL_IRRADIANCE_INVALID",
          "Extraterrestrial horizontal irradiance is invalid.",
        ),
      );
      continue;
    }
    const kt = ghi / horizontal;
    if (!Number.isFinite(kt) || kt < 0 || kt > 1) {
      records.push(
        notEvaluated(
          record,
          config,
          sun,
          normal,
          horizontal,
          "MODEL_RANGE_EXCEEDED",
          "Clearness index is outside the implemented Erbs range 0–1.",
        ),
      );
      continue;
    }
    const estimatedDhi = ghi * erbsDiffuseFraction(kt);
    const estimatedDni = (ghi - estimatedDhi) / cosineZenith;
    const outputDhi = dhi ?? estimatedDhi;
    const outputDni = dni ?? estimatedDni;
    const difference = Math.abs(ghi - (outputDhi + outputDni * cosineZenith));
    const flags =
      difference > config.reconciliationToleranceWattsPerSquareMetre
        ? [
            {
              code: "MEASURED_ESTIMATED_INCONSISTENCY",
              severity: "Warning" as const,
              explanation: `Preserved measured and estimated components differ by ${difference.toFixed(3)} W/m².`,
            },
          ]
        : [];
    records.push({
      timestamp: record.timestamp,
      timezone: record.timezone,
      sourceRow: record.sourceRow,
      solarElevationDegrees: sun.elevationDegrees,
      solarZenithDegrees: sun.zenithDegrees,
      extraterrestrialNormal: normal,
      extraterrestrialHorizontal: horizontal,
      clearnessIndex: kt,
      inputGhi: ghi,
      inputDni: dni,
      inputDhi: dhi,
      outputGhi: ghi,
      outputDni,
      outputDhi,
      ghiOrigin: "Measured",
      dniOrigin: dni === null ? "Estimated" : "Measured",
      dhiOrigin: dhi === null ? "Estimated" : "Measured",
      modelId: config.modelId,
      modelVersion: config.modelVersion,
      eligibility: flags.length ? "Eligible with warnings" : "Eligible",
      calculationStatus: dni === null || dhi === null ? "Estimated" : "Measured pass-through",
      qualityFlags: flags,
      warnings: flags.map((flag) => flag.explanation),
      notEvaluatedReason: null,
      calculationVersion: IRRADIANCE_CALCULATION_VERSION,
    });
    if (flags.length)
      findings.push(
        finding("MEASURED_ESTIMATED_INCONSISTENCY", record, flags[0].explanation, false),
      );
    if (index % 500 === 0)
      onProgress?.(
        Math.min(95, Math.round((index / Math.max(1, version.records.length)) * 95)),
        "Decomposing irradiance",
      );
  }
  if (findings.length > IRRADIANCE_LIMITS.maxFindings)
    findings.length = IRRADIANCE_LIMITS.maxFindings;
  const evaluated = records.filter((record) => record.calculationStatus !== "Not evaluated");
  const summary = {
    inputRecordCount: version.records.length,
    outputRecordCount: records.length,
    eligibleRecordCount: evaluated.length,
    measuredRecordCount: records.filter(
      (record) => record.calculationStatus === "Measured pass-through",
    ).length,
    estimatedRecordCount: records.filter((record) => record.calculationStatus === "Estimated")
      .length,
    excludedRecordCount: records.filter((record) => record.calculationStatus === "Invalid").length,
    notEvaluatedRecordCount: records.filter(
      (record) => record.calculationStatus === "Not evaluated",
    ).length,
    warningCount: findings.filter((item) => item.severity === "Warning").length,
    blockingCount: findings.filter((item) => item.modellingBlocked).length,
    calculationPeriod: {
      start: records.at(0)?.timestamp ?? null,
      end: records.at(-1)?.timestamp ?? null,
    },
    intervalMinutes: input.interval?.minutes ?? null,
    reconciliationFailures: findings.filter(
      (item) => item.code.includes("RECONCILIATION") || item.code.includes("INCONSISTENCY"),
    ).length,
  };
  if (summary.outputRecordCount !== summary.inputRecordCount)
    throw new Error("Irradiance summary reconciliation failed.");
  onProgress?.(100, "Complete");
  return { records, findings, summary };
}
