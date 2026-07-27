import {
  deriveReviewStatus,
  deterministicComponentId,
  engineeringValue,
  validateComponent,
} from "./componentCore";
import {
  COMPONENT_SCHEMA_NAME,
  COMPONENT_SCHEMA_VERSION,
  COMPONENT_VALIDATION_VERSION,
  type ComponentRecord,
  type InverterRecord,
  type ParameterSource,
  type PvModuleRecord,
} from "./componentTypes";

export type ManualComponentInput = Record<string, string> & {
  componentType: ComponentRecord["componentType"];
  manufacturer: string;
  model: string;
};

export function createManualComponent(
  input: ManualComponentInput,
  sequence: number,
): ComponentRecord {
  const source: ParameterSource = {
    sourceType: "manual",
    sourceReference: `manual-entry-${sequence}`,
    sourceColumnOrPath: "manual-form",
  };
  const base = {
    schemaName: COMPONENT_SCHEMA_NAME,
    schemaVersion: COMPONENT_SCHEMA_VERSION,
    recordId: deterministicComponentId(
      input.componentType,
      input.manufacturer,
      input.model,
      input.variant,
      sequence,
    ),
    manufacturer: input.manufacturer.trim(),
    model: input.model.trim(),
    variant: input.variant?.trim() || undefined,
    datasheetRevision: input.datasheetRevision?.trim() || undefined,
    sourceType: "manual" as const,
    sourceReference: source.sourceReference,
    sourceDate: input.sourceDate || undefined,
    units: "canonical-si" as const,
    warnings: [],
    findings: [],
    reviewStatus: "manually-entered-review-required" as const,
    reviewerNotes: input.reviewerNotes ?? "",
    changeHistory: [{ sequence: 1, action: "created" as const }],
    validationVersion: COMPONENT_VALIDATION_VERSION,
    unsupportedOrUnverifiedFields: [],
    originalImportedRecord: Object.freeze({ ...input }),
    normalizedReviewedRecord: Object.freeze({}),
  };
  const value = (key: string) => {
    const parsed = Number(input[key]);
    if (!input[key] || !Number.isFinite(parsed)) throw new Error(`${key} requires a finite value.`);
    return parsed;
  };
  let record: ComponentRecord;
  if (input.componentType === "pv-module") {
    const module: PvModuleRecord = {
      ...base,
      componentType: "pv-module",
      parameters: {
        technology: input.technology || undefined,
        bifacial: input.bifacial === "true",
        ratedPower: engineeringValue(
          value("ratedPower"),
          unit(input.ratedPowerUnit, ["W", "kW"]),
          "power",
          source,
        ),
        vmp: engineeringValue(value("vmp"), "V", "identity", source),
        imp: engineeringValue(value("imp"), "A", "identity", source),
        voc: engineeringValue(value("voc"), "V", "identity", source),
        isc: engineeringValue(value("isc"), "A", "identity", source),
        pmaxTemperatureCoefficient: engineeringValue(
          value("pmaxTemperatureCoefficient"),
          unit(input.coefficientUnit, ["percent/C", "fraction/C"]),
          "temperature-coefficient",
          source,
        ),
        vocTemperatureCoefficient: engineeringValue(
          value("vocTemperatureCoefficient"),
          unit(input.coefficientUnit, ["percent/C", "fraction/C"]),
          "temperature-coefficient",
          source,
        ),
        ...(input.vmpTemperatureCoefficient
          ? {
              vmpTemperatureCoefficient: engineeringValue(
                value("vmpTemperatureCoefficient"),
                unit(input.coefficientUnit, ["percent/C", "fraction/C"]),
                "temperature-coefficient",
                source,
              ),
            }
          : {}),
        ...(input.iscTemperatureCoefficient
          ? {
              iscTemperatureCoefficient: engineeringValue(
                value("iscTemperatureCoefficient"),
                unit(input.coefficientUnit, ["percent/C", "fraction/C"]),
                "temperature-coefficient",
                source,
              ),
            }
          : {}),
        ...(input.efficiency
          ? {
              efficiency: engineeringValue(
                value("efficiency"),
                unit(input.efficiencyUnit, ["percent", "fraction"]),
                "efficiency",
                source,
              ),
            }
          : {}),
        ...(input.powerTolerance
          ? {
              powerTolerance: engineeringValue(
                value("powerTolerance"),
                unit(input.ratedPowerUnit, ["W", "kW"]),
                "power",
                source,
              ),
            }
          : {}),
        ...(input.nominalOperatingCellTemperature
          ? {
              nominalOperatingCellTemperature: engineeringValue(
                value("nominalOperatingCellTemperature"),
                "C",
                "identity",
                source,
              ),
            }
          : {}),
        ...(input.length
          ? {
              length: engineeringValue(
                value("length"),
                unit(input.dimensionUnit, ["mm", "cm", "m"]),
                "dimension",
                source,
              ),
            }
          : {}),
        ...(input.width
          ? {
              width: engineeringValue(
                value("width"),
                unit(input.dimensionUnit, ["mm", "cm", "m"]),
                "dimension",
                source,
              ),
            }
          : {}),
        ...(input.thickness
          ? {
              thickness: engineeringValue(
                value("thickness"),
                unit(input.dimensionUnit, ["mm", "cm", "m"]),
                "dimension",
                source,
              ),
            }
          : {}),
        ...(input.weight
          ? { weight: engineeringValue(value("weight"), "kg", "identity", source) }
          : {}),
        ...(input.maximumSystemVoltage
          ? {
              maximumSystemVoltage: engineeringValue(
                value("maximumSystemVoltage"),
                "V",
                "identity",
                source,
              ),
            }
          : {}),
        cellCount: integerOptional(input.cellCount),
        ...(input.maximumSeriesFuse
          ? {
              maximumSeriesFuse: engineeringValue(
                value("maximumSeriesFuse"),
                "A",
                "identity",
                source,
              ),
            }
          : {}),
        connector: input.connector || undefined,
        ...(input.bifacialityFactor
          ? {
              bifacialityFactor: engineeringValue(
                value("bifacialityFactor"),
                unit(input.efficiencyUnit, ["percent", "fraction"]),
                "efficiency",
                source,
              ),
            }
          : {}),
        rearSideRatingMetadata: input.rearSideRatingMetadata || undefined,
        bifacialUncertaintyNote: input.bifacialUncertaintyNote || undefined,
      },
    };
    record = module;
  } else {
    const inverter: InverterRecord = {
      ...base,
      componentType: "inverter",
      parameters: {
        inverterType: input.inverterType || undefined,
        maximumDcVoltage: engineeringValue(value("maximumDcVoltage"), "V", "identity", source),
        ...(input.nominalDcVoltage
          ? {
              nominalDcVoltage: engineeringValue(
                value("nominalDcVoltage"),
                "V",
                "identity",
                source,
              ),
            }
          : {}),
        ...(input.mpptMinimumVoltage
          ? {
              mpptMinimumVoltage: engineeringValue(
                value("mpptMinimumVoltage"),
                "V",
                "identity",
                source,
              ),
            }
          : {}),
        ...(input.mpptMaximumVoltage
          ? {
              mpptMaximumVoltage: engineeringValue(
                value("mpptMaximumVoltage"),
                "V",
                "identity",
                source,
              ),
            }
          : {}),
        ...(input.startupVoltage
          ? {
              startupVoltage: engineeringValue(value("startupVoltage"), "V", "identity", source),
            }
          : {}),
        maximumInputCurrent: engineeringValue(
          value("maximumInputCurrent"),
          "A",
          "identity",
          source,
        ),
        ...(input.maximumShortCircuitCurrent
          ? {
              maximumShortCircuitCurrent: engineeringValue(
                value("maximumShortCircuitCurrent"),
                "A",
                "identity",
                source,
              ),
            }
          : {}),
        mpptTrackers: integerOptional(input.mpptTrackers),
        totalDcInputs: integerOptional(input.totalDcInputs),
        inputsPerMppt: integerOptional(input.inputsPerMppt),
        ...(input.maximumDcPower
          ? {
              maximumDcPower: engineeringValue(
                value("maximumDcPower"),
                unit(input.ratedAcPowerUnit, ["W", "kW"]),
                "power",
                source,
              ),
            }
          : {}),
        ratedAcPower: engineeringValue(
          value("ratedAcPower"),
          unit(input.ratedAcPowerUnit, ["W", "kW"]),
          "power",
          source,
        ),
        nominalAcVoltage: engineeringValue(value("nominalAcVoltage"), "V", "identity", source),
        ...(input.maximumAcPower
          ? {
              maximumAcPower: engineeringValue(
                value("maximumAcPower"),
                unit(input.ratedAcPowerUnit, ["W", "kW"]),
                "power",
                source,
              ),
            }
          : {}),
        phaseConfiguration:
          input.phaseConfiguration === "single-phase" || input.phaseConfiguration === "three-phase"
            ? input.phaseConfiguration
            : undefined,
        ...(input.nominalFrequency
          ? {
              nominalFrequency: engineeringValue(
                value("nominalFrequency"),
                "Hz",
                "identity",
                source,
              ),
            }
          : {}),
        ...(input.maximumAcCurrent
          ? {
              maximumAcCurrent: engineeringValue(
                value("maximumAcCurrent"),
                "A",
                "identity",
                source,
              ),
            }
          : {}),
        powerFactorRange: input.powerFactorRange || undefined,
        ...(input.maximumEfficiency
          ? {
              maximumEfficiency: engineeringValue(
                value("maximumEfficiency"),
                unit(input.efficiencyUnit, ["percent", "fraction"]),
                "efficiency",
                source,
              ),
            }
          : {}),
        ...(input.weightedEfficiency
          ? {
              weightedEfficiency: engineeringValue(
                value("weightedEfficiency"),
                unit(input.efficiencyUnit, ["percent", "fraction"]),
                "efficiency",
                source,
              ),
            }
          : {}),
        ...(input.standbyConsumption
          ? {
              standbyConsumption: engineeringValue(
                value("standbyConsumption"),
                unit(input.ratedAcPowerUnit, ["W", "kW"]),
                "power",
                source,
              ),
            }
          : {}),
        ...(input.minimumOperatingTemperature
          ? {
              minimumOperatingTemperature: engineeringValue(
                value("minimumOperatingTemperature"),
                "C",
                "identity",
                source,
              ),
            }
          : {}),
        ...(input.maximumOperatingTemperature
          ? {
              maximumOperatingTemperature: engineeringValue(
                value("maximumOperatingTemperature"),
                "C",
                "identity",
                source,
              ),
            }
          : {}),
        enclosureRating: input.enclosureRating || undefined,
        ...(input.length
          ? {
              length: engineeringValue(
                value("length"),
                unit(input.dimensionUnit, ["mm", "cm", "m"]),
                "dimension",
                source,
              ),
            }
          : {}),
        ...(input.width
          ? {
              width: engineeringValue(
                value("width"),
                unit(input.dimensionUnit, ["mm", "cm", "m"]),
                "dimension",
                source,
              ),
            }
          : {}),
        ...(input.height
          ? {
              height: engineeringValue(
                value("height"),
                unit(input.dimensionUnit, ["mm", "cm", "m"]),
                "dimension",
                source,
              ),
            }
          : {}),
        ...(input.weight
          ? { weight: engineeringValue(value("weight"), "kg", "identity", source) }
          : {}),
      },
    };
    record = inverter;
  }
  const findings = validateComponent(record);
  return {
    ...record,
    findings,
    reviewStatus: deriveReviewStatus(record, "manual"),
    normalizedReviewedRecord: Object.freeze({
      manufacturer: record.manufacturer,
      model: record.model,
      parameters: structuredClone(record.parameters),
    }),
  };
}

function unit<T extends string>(value: string, supported: readonly T[]): T {
  if (!supported.includes(value as T)) throw new Error(`Unsupported unit: ${value || "missing"}.`);
  return value as T;
}
function integerOptional(value: string) {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error("Topology values must be positive integers.");
  return parsed;
}
