export const COMPONENT_SCHEMA_NAME = "draflio-component" as const;
export const COMPONENT_SCHEMA_VERSION = "1.0" as const;
export const COMPONENT_VALIDATION_VERSION = "component-validation-1.0" as const;
export const COMPONENT_LIMITS = {
  maxCsvBytes: 5 * 1024 * 1024,
  maxJsonBytes: 10 * 1024 * 1024,
  maxRows: 5_000,
  maxRecords: 5_000,
  maxFields: 100,
  maxStringLength: 500,
  maxFindings: 200,
  maxCompared: 8,
  maxCompatibilityCases: 100,
  maxExportBytes: 20 * 1024 * 1024,
} as const;

export type ComponentType = "pv-module" | "inverter";
export type ComponentReviewStatus =
  | "imported-review-required"
  | "manually-entered-review-required"
  | "valid-with-warnings"
  | "invalid"
  | "reviewed"
  | "approved-for-current-project"
  | "excluded"
  | "unsupported";
export type FindingSeverity = "error" | "warning" | "information" | "unverified";
export type ComponentFinding = {
  code: string;
  severity: FindingSeverity;
  field: string;
  explanation: string;
  originalValue?: string | number | null;
  normalizedValue?: number | string | null;
  ruleVersion: typeof COMPONENT_VALIDATION_VERSION;
};
export type ParameterSource = {
  sourceType: "manual" | "draflio-csv" | "draflio-json";
  sourceReference: string;
  sourceColumnOrPath: string;
};
export type EngineeringValue<U extends string = string> = {
  originalValue: number;
  originalUnit: U;
  normalizedValue: number;
  canonicalUnit: string;
  normalizationRule: string;
  source: ParameterSource;
  userEdited: boolean;
};
export type ChangeEntry = {
  sequence: number;
  action:
    | "created"
    | "edited"
    | "duplicated"
    | "reviewed"
    | "approved"
    | "approval-revoked"
    | "excluded"
    | "restored";
};
type BaseComponent<T extends ComponentType, P> = {
  schemaName: typeof COMPONENT_SCHEMA_NAME;
  schemaVersion: typeof COMPONENT_SCHEMA_VERSION;
  componentType: T;
  recordId: string;
  manufacturer: string;
  model: string;
  variant?: string;
  datasheetRevision?: string;
  sourceType: ParameterSource["sourceType"];
  sourceReference: string;
  sourceDate?: string;
  importedAt?: string;
  units: "canonical-si";
  parameters: P;
  warnings: string[];
  findings: ComponentFinding[];
  reviewStatus: ComponentReviewStatus;
  reviewerNotes: string;
  changeHistory: ChangeEntry[];
  validationVersion: typeof COMPONENT_VALIDATION_VERSION;
  unsupportedOrUnverifiedFields: string[];
  originalImportedRecord: Readonly<Record<string, unknown>>;
  normalizedReviewedRecord: Readonly<Record<string, unknown>>;
};
export type PvModuleParameters = {
  technology?: string;
  bifacial?: boolean;
  ratedPower: EngineeringValue<"W" | "kW">;
  vmp: EngineeringValue<"V">;
  imp: EngineeringValue<"A">;
  voc: EngineeringValue<"V">;
  isc: EngineeringValue<"A">;
  efficiency?: EngineeringValue<"percent" | "fraction">;
  powerTolerance?: EngineeringValue<"W" | "kW">;
  pmaxTemperatureCoefficient: EngineeringValue<"percent/C" | "fraction/C">;
  vocTemperatureCoefficient: EngineeringValue<"percent/C" | "fraction/C">;
  vmpTemperatureCoefficient?: EngineeringValue<"percent/C" | "fraction/C">;
  iscTemperatureCoefficient?: EngineeringValue<"percent/C" | "fraction/C">;
  nominalOperatingCellTemperature?: EngineeringValue<"C">;
  length?: EngineeringValue<"mm" | "cm" | "m">;
  width?: EngineeringValue<"mm" | "cm" | "m">;
  thickness?: EngineeringValue<"mm" | "cm" | "m">;
  weight?: EngineeringValue<"kg">;
  cellCount?: number;
  maximumSystemVoltage?: EngineeringValue<"V">;
  maximumSeriesFuse?: EngineeringValue<"A">;
  connector?: string;
  bifacialityFactor?: EngineeringValue<"percent" | "fraction">;
  rearSideRatingMetadata?: string;
  bifacialUncertaintyNote?: string;
};
export type InverterParameters = {
  inverterType?: string;
  maximumDcVoltage: EngineeringValue<"V">;
  nominalDcVoltage?: EngineeringValue<"V">;
  mpptMinimumVoltage?: EngineeringValue<"V">;
  mpptMaximumVoltage?: EngineeringValue<"V">;
  startupVoltage?: EngineeringValue<"V">;
  maximumInputCurrent: EngineeringValue<"A">;
  maximumShortCircuitCurrent?: EngineeringValue<"A">;
  mpptTrackers?: number;
  totalDcInputs?: number;
  inputsPerMppt?: number;
  maximumDcPower?: EngineeringValue<"W" | "kW">;
  ratedAcPower: EngineeringValue<"W" | "kW">;
  maximumAcPower?: EngineeringValue<"W" | "kW">;
  nominalAcVoltage: EngineeringValue<"V">;
  phaseConfiguration?: "single-phase" | "three-phase";
  nominalFrequency?: EngineeringValue<"Hz">;
  maximumAcCurrent?: EngineeringValue<"A">;
  powerFactorRange?: string;
  maximumEfficiency?: EngineeringValue<"percent" | "fraction">;
  weightedEfficiency?: EngineeringValue<"percent" | "fraction">;
  standbyConsumption?: EngineeringValue<"W" | "kW">;
  minimumOperatingTemperature?: EngineeringValue<"C">;
  maximumOperatingTemperature?: EngineeringValue<"C">;
  enclosureRating?: string;
  length?: EngineeringValue<"mm" | "cm" | "m">;
  width?: EngineeringValue<"mm" | "cm" | "m">;
  height?: EngineeringValue<"mm" | "cm" | "m">;
  weight?: EngineeringValue<"kg">;
};
export type PvModuleRecord = BaseComponent<"pv-module", PvModuleParameters>;
export type InverterRecord = BaseComponent<"inverter", InverterParameters>;
export type ComponentRecord = PvModuleRecord | InverterRecord;

export type CompatibilityAssumptions = {
  minimumCellTemperatureC: number;
  maximumCellTemperatureC: number;
  modulesPerString: number;
  parallelStrings: number;
  stringsPerMppt?: number;
  designMarginFraction: number;
};
export type CompatibilityResult = {
  code: string;
  status: "pass" | "fail" | "warning" | "not-evaluated";
  method: string;
  inputs: string;
  calculatedValue?: number;
  unit?: string;
  limit?: number;
  margin?: number;
  moduleRecordId: string;
  inverterRecordId: string;
  assumptionProvenance: "user-entered";
  validationVersion: typeof COMPONENT_VALIDATION_VERSION;
};
