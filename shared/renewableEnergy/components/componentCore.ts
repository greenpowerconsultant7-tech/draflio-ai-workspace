import {
  COMPONENT_LIMITS,
  COMPONENT_SCHEMA_NAME,
  COMPONENT_SCHEMA_VERSION,
  COMPONENT_VALIDATION_VERSION,
  type ChangeEntry,
  type CompatibilityAssumptions,
  type CompatibilityResult,
  type ComponentFinding,
  type ComponentRecord,
  type ComponentReviewStatus,
  type EngineeringValue,
  type InverterRecord,
  type ParameterSource,
  type PvModuleRecord,
} from "./componentTypes";

export function deterministicComponentId(
  type: ComponentRecord["componentType"],
  manufacturer: string,
  model: string,
  variant = "",
  sequence = 1,
) {
  const input = `${type}\u001f${manufacturer.trim().toLowerCase()}\u001f${model.trim().toLowerCase()}\u001f${variant.trim().toLowerCase()}\u001f${sequence}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `cmp-${type}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function engineeringValue<U extends string>(
  value: number,
  unit: U,
  kind: "power" | "dimension" | "efficiency" | "temperature-coefficient" | "identity",
  source: ParameterSource,
): EngineeringValue<U> {
  if (!Number.isFinite(value)) throw new Error("Engineering values must be finite.");
  let normalizedValue = value;
  let canonicalUnit: string = unit;
  let rule = `${unit}-identity`;
  if (kind === "power") {
    if (unit !== "W" && unit !== "kW") throw new Error("Unsupported power unit.");
    normalizedValue = unit === "kW" ? value * 1_000 : value;
    canonicalUnit = "W";
    rule = unit === "kW" ? "kW-to-W-v1" : "W-identity-v1";
  } else if (kind === "dimension") {
    if (!["mm", "cm", "m"].includes(unit)) throw new Error("Unsupported dimension unit.");
    normalizedValue = value * (unit === "mm" ? 0.001 : unit === "cm" ? 0.01 : 1);
    canonicalUnit = "m";
    rule = `${unit}-to-m-v1`;
  } else if (kind === "efficiency") {
    if (unit !== "percent" && unit !== "fraction") throw new Error("Unsupported efficiency unit.");
    normalizedValue = unit === "percent" ? value / 100 : value;
    canonicalUnit = "fraction";
    rule = `${unit}-to-fraction-v1`;
  } else if (kind === "temperature-coefficient") {
    if (unit !== "percent/C" && unit !== "fraction/C")
      throw new Error("Unsupported temperature-coefficient unit.");
    normalizedValue = unit === "percent/C" ? value / 100 : value;
    canonicalUnit = "fraction/C";
    rule = `${unit}-to-fraction-per-C-v1`;
  }
  return {
    originalValue: value,
    originalUnit: unit,
    normalizedValue,
    canonicalUnit,
    normalizationRule: rule,
    source: { ...source },
    userEdited: source.sourceType === "manual",
  };
}

export function displayEngineeringValue(value: number, digits = 6) {
  if (!Number.isFinite(value)) return "Invalid";
  return Number(value.toPrecision(digits)).toString();
}

const finding = (
  code: string,
  severity: ComponentFinding["severity"],
  field: string,
  explanation: string,
  originalValue?: string | number | null,
  normalizedValue?: string | number | null,
): ComponentFinding => ({
  code,
  severity,
  field,
  explanation,
  originalValue,
  normalizedValue,
  ruleVersion: COMPONENT_VALIDATION_VERSION,
});

export function validateComponent(record: ComponentRecord): ComponentFinding[] {
  const findings: ComponentFinding[] = [];
  if (!record.manufacturer.trim())
    findings.push(finding("REQUIRED", "error", "manufacturer", "Manufacturer is required."));
  if (!record.model.trim())
    findings.push(finding("REQUIRED", "error", "model", "Model is required."));
  const positive = (field: string, value: EngineeringValue | undefined) => {
    if (value && (!Number.isFinite(value.normalizedValue) || value.normalizedValue <= 0))
      findings.push(
        finding(
          "POSITIVE_REQUIRED",
          "error",
          field,
          "Value must be finite and greater than zero.",
          value.originalValue,
          value.normalizedValue,
        ),
      );
  };
  if (record.componentType === "pv-module") {
    const p = record.parameters;
    [
      ["ratedPower", p.ratedPower],
      ["vmp", p.vmp],
      ["imp", p.imp],
      ["voc", p.voc],
      ["isc", p.isc],
      ["length", p.length],
      ["width", p.width],
      ["weight", p.weight],
    ].forEach(([field, value]) => positive(String(field), value as EngineeringValue | undefined));
    if (p.voc.normalizedValue <= p.vmp.normalizedValue)
      findings.push(
        finding(
          "VOC_NOT_ABOVE_VMP",
          "error",
          "voc",
          "Open-circuit voltage must exceed maximum-power voltage.",
        ),
      );
    if (p.isc.normalizedValue < p.imp.normalizedValue)
      findings.push(
        finding(
          "ISC_BELOW_IMP",
          "error",
          "isc",
          "Short-circuit current must not be below maximum-power current.",
        ),
      );
    if (p.pmaxTemperatureCoefficient.normalizedValue >= 0)
      findings.push(
        finding(
          "PMAX_COEFFICIENT_SIGN",
          "error",
          "pmaxTemperatureCoefficient",
          "Pmax temperature coefficient is expected to be negative; verify unit and sign.",
        ),
      );
    if (p.vocTemperatureCoefficient.normalizedValue >= 0)
      findings.push(
        finding(
          "VOC_COEFFICIENT_SIGN",
          "error",
          "vocTemperatureCoefficient",
          "Voc temperature coefficient is expected to be negative; verify unit and sign.",
        ),
      );
    if (
      p.vmpTemperatureCoefficient &&
      (p.vmpTemperatureCoefficient.normalizedValue >= 0 ||
        Math.abs(p.vmpTemperatureCoefficient.normalizedValue) > 0.02)
    )
      findings.push(
        finding(
          "VMP_COEFFICIENT_SUSPICIOUS",
          "warning",
          "vmpTemperatureCoefficient",
          "Vmp temperature coefficient has a physically suspicious sign or magnitude; verify its source and unit.",
          p.vmpTemperatureCoefficient.originalValue,
          p.vmpTemperatureCoefficient.normalizedValue,
        ),
      );
    const calculatedPower = p.vmp.normalizedValue * p.imp.normalizedValue;
    const powerDifference =
      Math.abs(calculatedPower - p.ratedPower.normalizedValue) / p.ratedPower.normalizedValue;
    if (powerDifference > 0.08)
      findings.push(
        finding(
          "PMAX_INCONSISTENT",
          "warning",
          "ratedPower",
          "Rated power differs from Vmp × Imp by more than 8%.",
          p.ratedPower.originalValue,
          calculatedPower,
        ),
      );
    if (p.efficiency && (p.efficiency.normalizedValue <= 0 || p.efficiency.normalizedValue > 1))
      findings.push(
        finding(
          "EFFICIENCY_RANGE",
          "error",
          "efficiency",
          "Efficiency must be above zero and no greater than one.",
        ),
      );
    if (p.efficiency && p.length && p.width) {
      const area = p.length.normalizedValue * p.width.normalizedValue;
      const calculatedEfficiency = p.ratedPower.normalizedValue / (1_000 * area);
      if (Math.abs(calculatedEfficiency - p.efficiency.normalizedValue) > 0.03)
        findings.push(
          finding(
            "EFFICIENCY_INCONSISTENT",
            "warning",
            "efficiency",
            "Supplied efficiency differs from power divided by STC irradiance and module area.",
            p.efficiency.originalValue,
            calculatedEfficiency,
          ),
        );
    }
  } else {
    const p = record.parameters;
    positive("maximumDcVoltage", p.maximumDcVoltage);
    positive("maximumInputCurrent", p.maximumInputCurrent);
    positive("ratedAcPower", p.ratedAcPower);
    positive("nominalAcVoltage", p.nominalAcVoltage);
    if (
      p.mpptMinimumVoltage &&
      p.mpptMaximumVoltage &&
      p.mpptMinimumVoltage.normalizedValue >= p.mpptMaximumVoltage.normalizedValue
    )
      findings.push(
        finding(
          "MPPT_RANGE_INVERTED",
          "error",
          "mpptMinimumVoltage",
          "MPPT minimum voltage must be below MPPT maximum voltage.",
        ),
      );
    if (
      p.mpptMaximumVoltage &&
      p.maximumDcVoltage.normalizedValue < p.mpptMaximumVoltage.normalizedValue
    )
      findings.push(
        finding(
          "DC_VOLTAGE_BELOW_MPPT_MAX",
          "error",
          "maximumDcVoltage",
          "Maximum DC voltage must not be below MPPT maximum voltage.",
        ),
      );
    if (!p.mpptTrackers || !p.totalDcInputs)
      findings.push(
        finding(
          "MPPT_TOPOLOGY_UNVERIFIED",
          "unverified",
          "mpptTrackers",
          "MPPT input topology is incomplete and will not be assumed.",
        ),
      );
    if (
      p.maximumEfficiency &&
      (p.maximumEfficiency.normalizedValue <= 0 || p.maximumEfficiency.normalizedValue > 1)
    )
      findings.push(
        finding(
          "EFFICIENCY_RANGE",
          "error",
          "maximumEfficiency",
          "Efficiency must be above zero and no greater than one.",
        ),
      );
  }
  return findings.slice(0, COMPONENT_LIMITS.maxFindings);
}

export function deriveReviewStatus(
  record: ComponentRecord,
  source: "manual" | "import",
): ComponentReviewStatus {
  const findings = validateComponent(record);
  if (findings.some((item) => item.severity === "error")) return "invalid";
  return source === "manual" ? "manually-entered-review-required" : "imported-review-required";
}

export function transitionComponent(
  record: ComponentRecord,
  action: ChangeEntry["action"],
): ComponentRecord {
  const findings = validateComponent(record);
  let reviewStatus = record.reviewStatus;
  if (action === "reviewed")
    reviewStatus = findings.some((item) => item.severity === "error") ? "invalid" : "reviewed";
  else if (action === "approved") {
    if (record.reviewStatus !== "reviewed" || findings.some((item) => item.severity === "error"))
      throw new Error("Only valid reviewed records can be approved for the current project.");
    reviewStatus = "approved-for-current-project";
  } else if (action === "approval-revoked") reviewStatus = "reviewed";
  else if (action === "excluded") reviewStatus = "excluded";
  else if (action === "restored")
    reviewStatus = findings.some((item) => item.severity === "error")
      ? "invalid"
      : "valid-with-warnings";
  return {
    ...record,
    findings,
    reviewStatus,
    changeHistory: [...record.changeHistory, { sequence: record.changeHistory.length + 1, action }],
  };
}

export function findDuplicateComponents(records: ComponentRecord[]) {
  const groups = new Map<string, ComponentRecord[]>();
  records.forEach((record) => {
    const key = `${record.componentType}|${record.manufacturer.trim().toLowerCase()}|${record.model.trim().toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  });
  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      recordIds: group.map((record) => record.recordId).sort(),
      conflict:
        new Set(group.map((record) => JSON.stringify(record.parameters))).size > 1
          ? "conflicting"
          : "duplicate",
    }))
    .sort((a, b) => a.recordIds[0].localeCompare(b.recordIds[0]));
}

export function serializeComponentLibrary(records: ComponentRecord[]) {
  if (records.length > COMPONENT_LIMITS.maxRecords)
    throw new Error("Component record limit exceeded.");
  const normalized = [...records].sort((a, b) => a.recordId.localeCompare(b.recordId));
  const text = `${JSON.stringify(
    {
      schemaName: "draflio-component-library",
      schemaVersion: COMPONENT_SCHEMA_VERSION,
      records: normalized,
    },
    null,
    2,
  )}\n`;
  if (new TextEncoder().encode(text).byteLength > COMPONENT_LIMITS.maxExportBytes)
    throw new Error("Component export size limit exceeded.");
  return text;
}

export function serializeComponentRecord(record: ComponentRecord) {
  const text = `${JSON.stringify(record, null, 2)}\n`;
  if (new TextEncoder().encode(text).byteLength > COMPONENT_LIMITS.maxExportBytes)
    throw new Error("Component export size limit exceeded.");
  return text;
}

export function parseComponentLibraryJson(text: string): ComponentRecord[] {
  if (!text || new TextEncoder().encode(text).byteLength > COMPONENT_LIMITS.maxJsonBytes)
    throw new Error("JSON is empty or exceeds the size limit.");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Component JSON is malformed.");
  }
  if (!isObject(value) || value.schemaName !== "draflio-component-library")
    throw new Error("JSON is not a Draflio component library.");
  if (value.schemaVersion !== COMPONENT_SCHEMA_VERSION)
    throw new Error("Component schema version is unsupported.");
  if (!Array.isArray(value.records) || value.records.length > COMPONENT_LIMITS.maxRecords)
    throw new Error("Component record collection is invalid or excessive.");
  return value.records.map(parseComponentRecord);
}

export function parseComponentRecord(value: unknown): ComponentRecord {
  if (
    !isObject(value) ||
    value.schemaName !== COMPONENT_SCHEMA_NAME ||
    value.schemaVersion !== COMPONENT_SCHEMA_VERSION
  )
    throw new Error("Component record schema is invalid or unsupported.");
  if (value.componentType !== "pv-module" && value.componentType !== "inverter")
    throw new Error("Component discriminator is unsupported.");
  if (
    typeof value.manufacturer !== "string" ||
    typeof value.model !== "string" ||
    value.manufacturer.length > COMPONENT_LIMITS.maxStringLength ||
    value.model.length > COMPONENT_LIMITS.maxStringLength ||
    !isObject(value.parameters)
  )
    throw new Error("Component identification or parameters are invalid.");
  const requiredEngineering =
    value.componentType === "pv-module"
      ? [
          "ratedPower",
          "vmp",
          "imp",
          "voc",
          "isc",
          "pmaxTemperatureCoefficient",
          "vocTemperatureCoefficient",
        ]
      : ["maximumDcVoltage", "maximumInputCurrent", "ratedAcPower", "nominalAcVoltage"];
  if (
    requiredEngineering.some(
      (field) => !isEngineeringValue((value.parameters as Record<string, unknown>)[field]),
    )
  )
    throw new Error("Required engineering parameters are malformed.");
  for (const parameter of Object.values(value.parameters)) {
    if (isObject(parameter) && "normalizedValue" in parameter && !isEngineeringValue(parameter))
      throw new Error("An engineering parameter is malformed.");
  }
  const record = structuredClone(value) as ComponentRecord;
  const findings = validateComponent(record);
  return {
    ...record,
    findings,
    originalImportedRecord: Object.freeze(structuredClone(record.originalImportedRecord)),
    normalizedReviewedRecord: Object.freeze(structuredClone(record.normalizedReviewedRecord)),
    reviewStatus: findings.some((item) => item.severity === "error")
      ? "invalid"
      : "imported-review-required",
  };
}

export function compatibilityReview(
  module: PvModuleRecord,
  inverter: InverterRecord,
  assumptions: CompatibilityAssumptions,
): CompatibilityResult[] {
  if (
    !Number.isFinite(assumptions.minimumCellTemperatureC) ||
    !Number.isFinite(assumptions.maximumCellTemperatureC) ||
    assumptions.minimumCellTemperatureC < -100 ||
    assumptions.maximumCellTemperatureC > 150 ||
    assumptions.minimumCellTemperatureC >= assumptions.maximumCellTemperatureC ||
    !Number.isInteger(assumptions.modulesPerString) ||
    assumptions.modulesPerString <= 0 ||
    !Number.isInteger(assumptions.parallelStrings) ||
    assumptions.parallelStrings <= 0 ||
    (assumptions.stringsPerMppt !== undefined &&
      (!Number.isInteger(assumptions.stringsPerMppt) || assumptions.stringsPerMppt <= 0)) ||
    !Number.isFinite(assumptions.designMarginFraction) ||
    assumptions.designMarginFraction < 0 ||
    assumptions.designMarginFraction > 0.5
  )
    throw new Error("Compatibility assumptions are invalid or outside supported bounds.");
  const base = (code: string, method: string): Omit<CompatibilityResult, "status"> => ({
    code,
    method,
    inputs: `module=${module.recordId}; inverter=${inverter.recordId}; user-entered temperatures and topology`,
    moduleRecordId: module.recordId,
    inverterRecordId: inverter.recordId,
    assumptionProvenance: "user-entered",
    validationVersion: COMPONENT_VALIDATION_VERSION,
  });
  const results: CompatibilityResult[] = [];
  const coldVoc =
    module.parameters.voc.normalizedValue *
    (1 +
      module.parameters.vocTemperatureCoefficient.normalizedValue *
        (assumptions.minimumCellTemperatureC - 25));
  const coldStringVoc = coldVoc * assumptions.modulesPerString;
  const maxDc = inverter.parameters.maximumDcVoltage.normalizedValue;
  results.push({
    ...base("MAX_DC_VOLTAGE", "Voc(T)=Voc_STC×[1+βVoc×(T−25°C)]; string Voc=Voc(T)×modules/string"),
    status: coldStringVoc <= maxDc * (1 - assumptions.designMarginFraction) ? "pass" : "fail",
    calculatedValue: coldStringVoc,
    unit: "V",
    limit: maxDc,
    margin: maxDc - coldStringVoc,
  });
  const betaVmp = module.parameters.vmpTemperatureCoefficient?.normalizedValue;
  const hotStringVmp =
    betaVmp === undefined
      ? undefined
      : module.parameters.vmp.normalizedValue *
        (1 + betaVmp * (assumptions.maximumCellTemperatureC - 25)) *
        assumptions.modulesPerString;
  for (const [code, limit, lower] of [
    ["MPPT_LOWER", inverter.parameters.mpptMinimumVoltage?.normalizedValue, true],
    ["MPPT_UPPER", inverter.parameters.mpptMaximumVoltage?.normalizedValue, false],
  ] as const)
    results.push(
      hotStringVmp === undefined
        ? {
            ...base(
              code,
              "Not evaluated: supplied Vmp temperature coefficient is missing; no coefficient is derived or substituted.",
            ),
            status: "not-evaluated",
          }
        : limit === undefined
          ? {
              ...base(code, "Temperature-corrected Vmp compared with supplied MPPT limit"),
              status: "not-evaluated",
            }
          : {
              ...base(
                code,
                "Vmp(T)=Vmp_STC × [1 + βVmp × (Tcell − 25°C)]; string Vmp=Vmp(T) × modules/string",
              ),
              status: lower
                ? hotStringVmp >= limit
                  ? "pass"
                  : "fail"
                : hotStringVmp <= limit
                  ? "pass"
                  : "fail",
              calculatedValue: hotStringVmp,
              unit: "V",
              limit,
              margin: lower ? hotStringVmp - limit : limit - hotStringVmp,
            },
    );
  const topologyKnown =
    !inverter.parameters.mpptTrackers ||
    inverter.parameters.mpptTrackers === 1 ||
    assumptions.stringsPerMppt !== undefined;
  const currentStrings = assumptions.stringsPerMppt ?? assumptions.parallelStrings;
  const operatingCurrent = module.parameters.imp.normalizedValue * currentStrings;
  results.push(
    topologyKnown
      ? {
          ...base(
            "INPUT_CURRENT",
            "Operating current=Imp×strings per MPPT; no hidden safety factor",
          ),
          status:
            operatingCurrent <= inverter.parameters.maximumInputCurrent.normalizedValue
              ? "pass"
              : "fail",
          calculatedValue: operatingCurrent,
          unit: "A",
          limit: inverter.parameters.maximumInputCurrent.normalizedValue,
          margin: inverter.parameters.maximumInputCurrent.normalizedValue - operatingCurrent,
        }
      : {
          ...base(
            "INPUT_CURRENT",
            "Not evaluated: strings per MPPT are required for a multi-MPPT inverter.",
          ),
          status: "not-evaluated",
        },
  );
  const shortCircuitLimit = inverter.parameters.maximumShortCircuitCurrent?.normalizedValue;
  const shortCircuit =
    module.parameters.iscTemperatureCoefficient === undefined
      ? undefined
      : module.parameters.isc.normalizedValue *
        (1 +
          module.parameters.iscTemperatureCoefficient.normalizedValue *
            (assumptions.maximumCellTemperatureC - 25)) *
        currentStrings;
  results.push(
    shortCircuitLimit === undefined || shortCircuit === undefined || !topologyKnown
      ? {
          ...base(
            "SHORT_CIRCUIT_CURRENT",
            shortCircuitLimit === undefined
              ? "Not evaluated: inverter short-circuit-current limit is missing."
              : module.parameters.iscTemperatureCoefficient === undefined
                ? "Not evaluated: supplied Isc temperature coefficient is missing."
                : "Not evaluated: strings per MPPT topology is missing.",
          ),
          status: "not-evaluated",
        }
      : {
          ...base(
            "SHORT_CIRCUIT_CURRENT",
            "Isc(T)=Isc_STC × [1 + αIsc × (Tcell − 25°C)]; current=Isc(T) × strings per MPPT",
          ),
          status: shortCircuit <= shortCircuitLimit ? "pass" : "fail",
          calculatedValue: shortCircuit,
          unit: "A",
          limit: shortCircuitLimit,
          margin: shortCircuitLimit - shortCircuit,
        },
  );
  const dcPower =
    module.parameters.ratedPower.normalizedValue *
    assumptions.modulesPerString *
    assumptions.parallelStrings;
  const ratio = dcPower / inverter.parameters.ratedAcPower.normalizedValue;
  results.push({
    ...base("DC_NAMEPLATE_POWER", "DC nameplate power=Pmax × modules/string × parallel strings"),
    status: "warning",
    calculatedValue: dcPower,
    unit: "W",
  });
  results.push({
    ...base(
      "DC_AC_RATIO",
      "DC nameplate power=(Pmax×modules/string×parallel strings); ratio=DC W/rated AC W",
    ),
    status: "warning",
    calculatedValue: ratio,
    unit: "ratio",
  });
  return results;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEngineeringValue(value: unknown): value is EngineeringValue {
  return (
    isObject(value) &&
    typeof value.originalValue === "number" &&
    Number.isFinite(value.originalValue) &&
    typeof value.originalUnit === "string" &&
    typeof value.normalizedValue === "number" &&
    Number.isFinite(value.normalizedValue) &&
    typeof value.canonicalUnit === "string" &&
    typeof value.normalizationRule === "string" &&
    isObject(value.source) &&
    typeof value.source.sourceType === "string" &&
    typeof value.source.sourceReference === "string" &&
    typeof value.source.sourceColumnOrPath === "string" &&
    typeof value.userEdited === "boolean"
  );
}
