import {
  deriveReviewStatus,
  deterministicComponentId,
  engineeringValue,
  parseComponentLibraryJson,
  validateComponent,
} from "./componentCore";
import {
  COMPONENT_LIMITS,
  COMPONENT_SCHEMA_NAME,
  COMPONENT_SCHEMA_VERSION,
  COMPONENT_VALIDATION_VERSION,
  type ComponentRecord,
  type EngineeringValue,
  type InverterRecord,
  type ParameterSource,
  type PvModuleRecord,
} from "./componentTypes";

export const MODULE_CSV_COLUMNS = [
  "schema_version",
  "manufacturer",
  "model",
  "variant",
  "technology",
  "bifacial",
  "datasheet_revision",
  "rated_power",
  "rated_power_unit",
  "vmp_v",
  "imp_a",
  "voc_v",
  "isc_a",
  "pmax_temp_coefficient",
  "voc_temp_coefficient",
  "vmp_temp_coefficient",
  "isc_temp_coefficient",
  "temp_coefficient_unit",
  "noct_c",
  "length",
  "length_unit",
  "width",
  "width_unit",
  "thickness",
  "thickness_unit",
  "weight_kg",
  "cell_count",
  "efficiency",
  "efficiency_unit",
  "power_tolerance",
  "maximum_system_voltage_v",
  "maximum_series_fuse_a",
  "connector",
  "bifaciality_factor",
  "rear_side_rating_metadata",
  "bifacial_uncertainty_note",
] as const;
export const INVERTER_CSV_COLUMNS = [
  "schema_version",
  "manufacturer",
  "model",
  "variant",
  "inverter_type",
  "datasheet_revision",
  "maximum_dc_voltage_v",
  "nominal_dc_voltage_v",
  "mppt_minimum_voltage_v",
  "mppt_maximum_voltage_v",
  "startup_voltage_v",
  "maximum_input_current_a",
  "maximum_short_circuit_current_a",
  "mppt_trackers",
  "total_dc_inputs",
  "inputs_per_mppt",
  "maximum_dc_power",
  "maximum_dc_power_unit",
  "rated_ac_power",
  "rated_ac_power_unit",
  "nominal_ac_voltage_v",
  "maximum_ac_power",
  "maximum_ac_power_unit",
  "phase_configuration",
  "nominal_frequency_hz",
  "maximum_ac_current_a",
  "power_factor_range",
  "maximum_efficiency",
  "weighted_efficiency",
  "efficiency_unit",
  "standby_consumption_w",
  "minimum_operating_temperature_c",
  "maximum_operating_temperature_c",
  "enclosure_rating",
  "length",
  "width",
  "height",
  "dimension_unit",
  "weight_kg",
] as const;

export type ImportPreview = {
  records: ComponentRecord[];
  rows: { rowNumber: number; recordId?: string; selected: boolean; findings: string[] }[];
  duplicateGroups: ReturnType<typeof import("./componentCore").findDuplicateComponents>;
};

export function csvTemplate(type: ComponentRecord["componentType"]) {
  const columns = type === "pv-module" ? MODULE_CSV_COLUMNS : INVERTER_CSV_COLUMNS;
  return `# Draflio ${type} CSV template; schema ${COMPONENT_SCHEMA_VERSION}; units are mandatory where named\n${columns.join(",")}\n`;
}

export function parseComponentCsv(
  text: string,
  type: ComponentRecord["componentType"],
): ImportPreview {
  const bytes = new TextEncoder().encode(text).byteLength;
  if (!text || bytes > COMPONENT_LIMITS.maxCsvBytes || text.includes("\0"))
    throw new Error("CSV is empty, binary, or exceeds the 5 MB limit.");
  const rawLines = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const lines = rawLines.filter((line) => line.trim() && !line.trimStart().startsWith("#"));
  if (lines.length < 2 || lines.length - 1 > COMPONENT_LIMITS.maxRows)
    throw new Error("CSV must contain a header and between 1 and 5,000 data rows.");
  const delimiter = detectDelimiter(lines.slice(0, 10));
  const headers = splitCsv(lines[0], delimiter).map((value) => value.trim().toLowerCase());
  const required =
    type === "pv-module"
      ? [
          "schema_version",
          "manufacturer",
          "model",
          "rated_power",
          "rated_power_unit",
          "vmp_v",
          "imp_a",
          "voc_v",
          "isc_a",
          "pmax_temp_coefficient",
          "voc_temp_coefficient",
          "temp_coefficient_unit",
        ]
      : [
          "schema_version",
          "manufacturer",
          "model",
          "maximum_dc_voltage_v",
          "maximum_input_current_a",
          "rated_ac_power",
          "rated_ac_power_unit",
          "nominal_ac_voltage_v",
        ];
  const missing = required.filter((column) => !headers.includes(column));
  if (missing.length) throw new Error(`CSV is missing required columns: ${missing.join(", ")}.`);
  const records: ComponentRecord[] = [];
  const rows: ImportPreview["rows"] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const values = splitCsv(lines[index], delimiter);
    if (values.length !== headers.length) {
      rows.push({
        rowNumber: index + 1,
        selected: false,
        findings: ["Column count does not match the header; row was not imported."],
      });
      continue;
    }
    const row = Object.fromEntries(
      headers.map((header, column) => [header, values[column].trim()]),
    );
    try {
      if (row.schema_version !== COMPONENT_SCHEMA_VERSION)
        throw new Error("Unsupported schema version.");
      const record = type === "pv-module" ? moduleFromRow(row, index) : inverterFromRow(row, index);
      records.push(record);
      rows.push({
        rowNumber: index + 1,
        recordId: record.recordId,
        selected: true,
        findings: record.findings.map((item) => item.explanation),
      });
    } catch (error) {
      rows.push({
        rowNumber: index + 1,
        selected: false,
        findings: [error instanceof Error ? error.message : "Row is invalid."],
      });
    }
  }
  const { findDuplicateComponents } = requireCore();
  return { records, rows, duplicateGroups: findDuplicateComponents(records) };
}

export function parseComponentJson(text: string) {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Component JSON is malformed.");
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaName" in value &&
    value.schemaName === COMPONENT_SCHEMA_NAME
  ) {
    return [
      parseComponentLibraryJson(
        JSON.stringify({
          schemaName: "draflio-component-library",
          schemaVersion: COMPONENT_SCHEMA_VERSION,
          records: [value],
        }),
      )[0],
    ];
  }
  return parseComponentLibraryJson(text);
}

function moduleFromRow(row: Record<string, string>, sequence: number): PvModuleRecord {
  const source = sourceFor(sequence);
  const record: PvModuleRecord = {
    ...base("pv-module", row, sequence),
    parameters: {
      technology: row.technology || undefined,
      bifacial: row.bifacial ? row.bifacial.toLowerCase() === "true" : undefined,
      ratedPower: engineeringValue(
        number(row.rated_power),
        powerUnit(row.rated_power_unit),
        "power",
        source,
      ),
      vmp: engineeringValue(number(row.vmp_v), "V", "identity", source),
      imp: engineeringValue(number(row.imp_a), "A", "identity", source),
      voc: engineeringValue(number(row.voc_v), "V", "identity", source),
      isc: engineeringValue(number(row.isc_a), "A", "identity", source),
      pmaxTemperatureCoefficient: engineeringValue(
        number(row.pmax_temp_coefficient),
        coefficientUnit(row.temp_coefficient_unit),
        "temperature-coefficient",
        source,
      ),
      vocTemperatureCoefficient: engineeringValue(
        number(row.voc_temp_coefficient),
        coefficientUnit(row.temp_coefficient_unit),
        "temperature-coefficient",
        source,
      ),
      ...(row.vmp_temp_coefficient
        ? {
            vmpTemperatureCoefficient: engineeringValue(
              number(row.vmp_temp_coefficient),
              coefficientUnit(row.temp_coefficient_unit),
              "temperature-coefficient",
              source,
            ),
          }
        : {}),
      ...(row.isc_temp_coefficient
        ? {
            iscTemperatureCoefficient: engineeringValue(
              number(row.isc_temp_coefficient),
              coefficientUnit(row.temp_coefficient_unit),
              "temperature-coefficient",
              source,
            ),
          }
        : {}),
      ...(row.noct_c
        ? {
            nominalOperatingCellTemperature: engineeringValue(
              number(row.noct_c),
              "C",
              "identity",
              source,
            ),
          }
        : {}),
      ...(row.length
        ? {
            length: engineeringValue(
              number(row.length),
              dimensionUnit(row.length_unit),
              "dimension",
              source,
            ),
          }
        : {}),
      ...(row.width
        ? {
            width: engineeringValue(
              number(row.width),
              dimensionUnit(row.width_unit),
              "dimension",
              source,
            ),
          }
        : {}),
      ...(row.efficiency
        ? {
            efficiency: engineeringValue(
              number(row.efficiency),
              efficiencyUnit(row.efficiency_unit),
              "efficiency",
              source,
            ),
          }
        : {}),
      ...(row.power_tolerance
        ? {
            powerTolerance: engineeringValue(
              number(row.power_tolerance),
              powerUnit(row.rated_power_unit),
              "power",
              source,
            ),
          }
        : {}),
      ...(row.thickness
        ? {
            thickness: engineeringValue(
              number(row.thickness),
              dimensionUnit(row.thickness_unit),
              "dimension",
              source,
            ),
          }
        : {}),
      ...(row.weight_kg
        ? { weight: engineeringValue(number(row.weight_kg), "kg", "identity", source) }
        : {}),
      cellCount: optionalInteger(row.cell_count),
      ...(row.maximum_system_voltage_v
        ? {
            maximumSystemVoltage: engineeringValue(
              number(row.maximum_system_voltage_v),
              "V",
              "identity",
              source,
            ),
          }
        : {}),
      ...(row.maximum_series_fuse_a
        ? {
            maximumSeriesFuse: engineeringValue(
              number(row.maximum_series_fuse_a),
              "A",
              "identity",
              source,
            ),
          }
        : {}),
      connector: row.connector || undefined,
      ...(row.bifaciality_factor
        ? {
            bifacialityFactor: engineeringValue(
              number(row.bifaciality_factor),
              efficiencyUnit(row.efficiency_unit),
              "efficiency",
              source,
            ),
          }
        : {}),
      rearSideRatingMetadata: row.rear_side_rating_metadata || undefined,
      bifacialUncertaintyNote: row.bifacial_uncertainty_note || undefined,
    },
  };
  return finalize(record, "import");
}

function inverterFromRow(row: Record<string, string>, sequence: number): InverterRecord {
  const source = sourceFor(sequence);
  const optional = <U extends "V" | "A">(key: string, unit: U): EngineeringValue<U> | undefined =>
    row[key]
      ? (engineeringValue(number(row[key]), unit, "identity", source) as EngineeringValue<U>)
      : undefined;
  const record: InverterRecord = {
    ...base("inverter", row, sequence),
    parameters: {
      inverterType: row.inverter_type || undefined,
      maximumDcVoltage: engineeringValue(number(row.maximum_dc_voltage_v), "V", "identity", source),
      nominalDcVoltage: optional("nominal_dc_voltage_v", "V"),
      mpptMinimumVoltage: optional("mppt_minimum_voltage_v", "V"),
      mpptMaximumVoltage: optional("mppt_maximum_voltage_v", "V"),
      startupVoltage: optional("startup_voltage_v", "V"),
      maximumInputCurrent: engineeringValue(
        number(row.maximum_input_current_a),
        "A",
        "identity",
        source,
      ),
      maximumShortCircuitCurrent: optional("maximum_short_circuit_current_a", "A"),
      mpptTrackers: optionalInteger(row.mppt_trackers),
      totalDcInputs: optionalInteger(row.total_dc_inputs),
      inputsPerMppt: optionalInteger(row.inputs_per_mppt),
      ...(row.maximum_dc_power
        ? {
            maximumDcPower: engineeringValue(
              number(row.maximum_dc_power),
              powerUnit(row.maximum_dc_power_unit),
              "power",
              source,
            ),
          }
        : {}),
      ratedAcPower: engineeringValue(
        number(row.rated_ac_power),
        powerUnit(row.rated_ac_power_unit),
        "power",
        source,
      ),
      nominalAcVoltage: engineeringValue(number(row.nominal_ac_voltage_v), "V", "identity", source),
      ...(row.maximum_ac_power
        ? {
            maximumAcPower: engineeringValue(
              number(row.maximum_ac_power),
              powerUnit(row.maximum_ac_power_unit),
              "power",
              source,
            ),
          }
        : {}),
      phaseConfiguration:
        row.phase_configuration === "single-phase" || row.phase_configuration === "three-phase"
          ? row.phase_configuration
          : undefined,
      ...(row.nominal_frequency_hz
        ? {
            nominalFrequency: engineeringValue(
              number(row.nominal_frequency_hz),
              "Hz",
              "identity",
              source,
            ),
          }
        : {}),
      maximumAcCurrent: optional("maximum_ac_current_a", "A"),
      powerFactorRange: row.power_factor_range || undefined,
      ...(row.maximum_efficiency
        ? {
            maximumEfficiency: engineeringValue(
              number(row.maximum_efficiency),
              efficiencyUnit(row.efficiency_unit),
              "efficiency",
              source,
            ),
          }
        : {}),
      ...(row.weighted_efficiency
        ? {
            weightedEfficiency: engineeringValue(
              number(row.weighted_efficiency),
              efficiencyUnit(row.efficiency_unit),
              "efficiency",
              source,
            ),
          }
        : {}),
      ...(row.standby_consumption_w
        ? {
            standbyConsumption: engineeringValue(
              number(row.standby_consumption_w),
              "W",
              "power",
              source,
            ),
          }
        : {}),
      ...(row.minimum_operating_temperature_c
        ? {
            minimumOperatingTemperature: engineeringValue(
              number(row.minimum_operating_temperature_c),
              "C",
              "identity",
              source,
            ),
          }
        : {}),
      ...(row.maximum_operating_temperature_c
        ? {
            maximumOperatingTemperature: engineeringValue(
              number(row.maximum_operating_temperature_c),
              "C",
              "identity",
              source,
            ),
          }
        : {}),
      enclosureRating: row.enclosure_rating || undefined,
      ...(row.length
        ? {
            length: engineeringValue(
              number(row.length),
              dimensionUnit(row.dimension_unit),
              "dimension",
              source,
            ),
          }
        : {}),
      ...(row.width
        ? {
            width: engineeringValue(
              number(row.width),
              dimensionUnit(row.dimension_unit),
              "dimension",
              source,
            ),
          }
        : {}),
      ...(row.height
        ? {
            height: engineeringValue(
              number(row.height),
              dimensionUnit(row.dimension_unit),
              "dimension",
              source,
            ),
          }
        : {}),
      ...(row.weight_kg
        ? { weight: engineeringValue(number(row.weight_kg), "kg", "identity", source) }
        : {}),
    },
  };
  return finalize(record, "import");
}

function base<T extends ComponentRecord["componentType"]>(
  type: T,
  row: Record<string, string>,
  sequence: number,
) {
  if (!row.manufacturer || !row.model) throw new Error("Manufacturer and model are required.");
  if (Object.keys(row).length > COMPONENT_LIMITS.maxFields)
    throw new Error("Row has too many fields.");
  Object.values(row).forEach((value) => {
    if (value.length > COMPONENT_LIMITS.maxStringLength)
      throw new Error("A field exceeds the string limit.");
  });
  return {
    schemaName: COMPONENT_SCHEMA_NAME,
    schemaVersion: COMPONENT_SCHEMA_VERSION,
    componentType: type,
    recordId: deterministicComponentId(type, row.manufacturer, row.model, row.variant, sequence),
    manufacturer: row.manufacturer,
    model: row.model,
    variant: row.variant || undefined,
    datasheetRevision: row.datasheet_revision || undefined,
    sourceType: "draflio-csv" as const,
    sourceReference: `row-${sequence + 1}`,
    units: "canonical-si" as const,
    warnings: [],
    findings: [],
    reviewStatus: "imported-review-required" as const,
    reviewerNotes: "",
    changeHistory: [{ sequence: 1, action: "created" as const }],
    validationVersion: COMPONENT_VALIDATION_VERSION,
    unsupportedOrUnverifiedFields: [],
    originalImportedRecord: Object.freeze({ ...row }),
    normalizedReviewedRecord: Object.freeze({}),
  };
}

function finalize<T extends ComponentRecord>(record: T, source: "manual" | "import"): T {
  const findings = validateComponent(record);
  return {
    ...record,
    findings,
    reviewStatus: deriveReviewStatus(record, source),
    normalizedReviewedRecord: Object.freeze({
      manufacturer: record.manufacturer,
      model: record.model,
      parameters: structuredClone(record.parameters),
    }),
  };
}

function sourceFor(sequence: number): ParameterSource {
  return {
    sourceType: "draflio-csv",
    sourceReference: `row-${sequence + 1}`,
    sourceColumnOrPath: "documented-column",
  };
}
function number(value: string) {
  const parsed = Number(value);
  if (!value || !Number.isFinite(parsed))
    throw new Error("A required numeric value is missing or non-finite.");
  return parsed;
}
function optionalInteger(value: string) {
  if (!value) return undefined;
  const parsed = number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error("Topology counts must be positive integers.");
  return parsed;
}
function powerUnit(value: string): "W" | "kW" {
  if (value !== "W" && value !== "kW") throw new Error("Power unit must be W or kW.");
  return value;
}
function dimensionUnit(value: string): "mm" | "cm" | "m" {
  if (value !== "mm" && value !== "cm" && value !== "m")
    throw new Error("Dimension unit must be mm, cm, or m.");
  return value;
}
function coefficientUnit(value: string): "percent/C" | "fraction/C" {
  if (value !== "percent/C" && value !== "fraction/C")
    throw new Error("Temperature coefficient unit is unsupported.");
  return value;
}
function efficiencyUnit(value: string): "percent" | "fraction" {
  if (value !== "percent" && value !== "fraction")
    throw new Error("Efficiency unit must be percent or fraction.");
  return value;
}
function detectDelimiter(lines: string[]) {
  const candidates = [",", ";", "\t"] as const;
  const scored = candidates.map((delimiter) => ({
    delimiter,
    widths: lines.map((line) => splitCsv(line, delimiter).length),
  }));
  const best = scored.sort((a, b) => Math.max(...b.widths) - Math.max(...a.widths))[0];
  if (Math.max(...best.widths) < 3 || new Set(best.widths).size !== 1)
    throw new Error("CSV delimiter or column structure is malformed.");
  return best.delimiter;
}
function splitCsv(line: string, delimiter: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      values.push(current);
      current = "";
    } else current += character;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  values.push(current);
  return values;
}
function requireCore() {
  // Kept as a direct local helper to avoid circular state or dynamic code.
  return {
    findDuplicateComponents: (records: ComponentRecord[]) => {
      const groups = new Map<string, ComponentRecord[]>();
      records.forEach((record) => {
        const key = `${record.componentType}|${record.manufacturer.toLowerCase()}|${record.model.toLowerCase()}`;
        groups.set(key, [...(groups.get(key) ?? []), record]);
      });
      return [...groups.values()]
        .filter((group) => group.length > 1)
        .map((group) => ({
          recordIds: group.map((record) => record.recordId).sort(),
          conflict:
            new Set(group.map((record) => JSON.stringify(record.parameters))).size > 1
              ? ("conflicting" as const)
              : ("duplicate" as const),
        }));
    },
  };
}
