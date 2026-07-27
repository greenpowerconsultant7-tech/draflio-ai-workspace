import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  compatibilityReview,
  deterministicComponentId,
  displayEngineeringValue,
  engineeringValue,
  findDuplicateComponents,
  parseComponentLibraryJson,
  serializeComponentLibrary,
  transitionComponent,
  validateComponent,
} from "../shared/renewableEnergy/components/componentCore";
import {
  INVERTER_CSV_COLUMNS,
  MODULE_CSV_COLUMNS,
  csvTemplate,
  parseComponentCsv,
  parseComponentJson,
} from "../shared/renewableEnergy/components/componentImport";
import { createManualComponent } from "../shared/renewableEnergy/components/componentManual";
import type {
  InverterRecord,
  PvModuleRecord,
} from "../shared/renewableEnergy/components/componentTypes";

const moduleInput = {
  componentType: "pv-module" as const,
  manufacturer: "Traceable Energy",
  model: "M-550",
  ratedPower: "550",
  ratedPowerUnit: "W",
  vmp: "41.5",
  imp: "13.25",
  voc: "49.8",
  isc: "14.1",
  pmaxTemperatureCoefficient: "-0.29",
  vocTemperatureCoefficient: "-0.25",
  vmpTemperatureCoefficient: "-0.31",
  iscTemperatureCoefficient: "0.05",
  coefficientUnit: "percent/C",
  length: "2278",
  width: "1134",
  dimensionUnit: "mm",
  efficiency: "21.3",
  efficiencyUnit: "percent",
};
const inverterInput = {
  componentType: "inverter" as const,
  manufacturer: "Traceable Energy",
  model: "INV-100K",
  maximumDcVoltage: "1100",
  mpptMinimumVoltage: "200",
  mpptMaximumVoltage: "1000",
  maximumInputCurrent: "300",
  maximumShortCircuitCurrent: "450",
  mpptTrackers: "10",
  totalDcInputs: "20",
  ratedAcPower: "100",
  ratedAcPowerUnit: "kW",
  nominalAcVoltage: "400",
  maximumEfficiency: "98.6",
  efficiencyUnit: "percent",
};
const module = createManualComponent(moduleInput, 1) as PvModuleRecord;
const inverter = createManualComponent(inverterInput, 2) as InverterRecord;
assert.equal(module.componentType, "pv-module");
assert.equal(inverter.componentType, "inverter");
assert.equal(module.reviewStatus, "manually-entered-review-required");
assert.equal(
  validateComponent(module).some((item) => item.severity === "error"),
  false,
);
assert.equal(
  deterministicComponentId("pv-module", "A", "B"),
  deterministicComponentId("pv-module", "A", "B"),
);
assert.notEqual(
  deterministicComponentId("pv-module", "A", "B"),
  deterministicComponentId("inverter", "A", "B"),
);
assert.equal(
  engineeringValue(1, "kW", "power", module.parameters.vmp.source).normalizedValue,
  1_000,
);
assert.equal(
  engineeringValue(1_000, "mm", "dimension", module.parameters.vmp.source).normalizedValue,
  1,
);
assert.equal(
  engineeringValue(100, "cm", "dimension", module.parameters.vmp.source).normalizedValue,
  1,
);
assert.equal(
  engineeringValue(21, "percent", "efficiency", module.parameters.vmp.source).normalizedValue,
  0.21,
);
assert.equal(
  engineeringValue(-0.3, "percent/C", "temperature-coefficient", module.parameters.vmp.source)
    .normalizedValue,
  -0.003,
);
assert.throws(() => engineeringValue(1, "MW", "power", module.parameters.vmp.source));
const exact = 0.123456789;
assert.equal(exact, 0.123456789);
assert.equal(displayEngineeringValue(exact), "0.123457");

assert(
  validateComponent({
    ...module,
    parameters: { ...module.parameters, voc: module.parameters.vmp },
  }).some((item) => item.code === "VOC_NOT_ABOVE_VMP"),
);
assert(
  validateComponent({
    ...module,
    parameters: {
      ...module.parameters,
      isc: module.parameters.imp,
      imp: { ...module.parameters.imp, normalizedValue: 15 },
    },
  }).some((item) => item.code === "ISC_BELOW_IMP"),
);
assert(
  validateComponent({
    ...module,
    parameters: {
      ...module.parameters,
      ratedPower: { ...module.parameters.ratedPower, normalizedValue: 900 },
    },
  }).some((item) => item.code === "PMAX_INCONSISTENT"),
);
assert(
  validateComponent({
    ...module,
    parameters: {
      ...module.parameters,
      pmaxTemperatureCoefficient: {
        ...module.parameters.pmaxTemperatureCoefficient,
        normalizedValue: 0.003,
      },
    },
  }).some((item) => item.code === "PMAX_COEFFICIENT_SIGN"),
);
assert(
  validateComponent({
    ...inverter,
    parameters: {
      ...inverter.parameters,
      mpptMinimumVoltage: inverter.parameters.mpptMaximumVoltage,
      mpptMaximumVoltage: inverter.parameters.mpptMinimumVoltage,
    },
  }).some((item) => item.code === "MPPT_RANGE_INVERTED"),
);
assert(
  validateComponent({
    ...inverter,
    parameters: {
      ...inverter.parameters,
      maximumDcVoltage: { ...inverter.parameters.maximumDcVoltage, normalizedValue: 900 },
    },
  }).some((item) => item.code === "DC_VOLTAGE_BELOW_MPPT_MAX"),
);
assert(
  validateComponent({
    ...inverter,
    parameters: { ...inverter.parameters, mpptTrackers: undefined },
  }).some((item) => item.code === "MPPT_TOPOLOGY_UNVERIFIED"),
);
const original = structuredClone(module.originalImportedRecord);
assert.deepEqual(module.originalImportedRecord, original);

let reviewed = transitionComponent(module, "reviewed") as PvModuleRecord;
assert.equal(reviewed.reviewStatus, "reviewed");
reviewed = transitionComponent(reviewed, "approved") as PvModuleRecord;
assert.equal(reviewed.reviewStatus, "approved-for-current-project");
reviewed = transitionComponent(reviewed, "approval-revoked") as PvModuleRecord;
assert.equal(reviewed.reviewStatus, "reviewed");
assert.equal(transitionComponent(reviewed, "excluded").reviewStatus, "excluded");
assert.throws(() => transitionComponent(module, "approved"));

const serialized = serializeComponentLibrary([module, inverter]);
const parsed = parseComponentLibraryJson(serialized);
assert.equal(parsed.length, 2);
assert.equal(serialized, serializeComponentLibrary([inverter, module]));
assert.throws(() => parseComponentLibraryJson("{bad"));
assert.throws(() =>
  parseComponentLibraryJson(
    '{"schemaName":"draflio-component-library","schemaVersion":"2","records":[]}',
  ),
);
assert.throws(() =>
  parseComponentLibraryJson(
    '{"schemaName":"draflio-component-library","schemaVersion":"1.0","records":[{"componentType":"battery"}]}',
  ),
);

const csvRow = (columns: readonly string[], values: Record<string, string>) =>
  columns.map((column) => values[column] ?? "").join(",");
const moduleValues = {
  schema_version: "1.0",
  manufacturer: "Traceable Energy",
  model: "M-550",
  rated_power: "550",
  rated_power_unit: "W",
  vmp_v: "41.5",
  imp_a: "13.25",
  voc_v: "49.8",
  isc_a: "14.1",
  pmax_temp_coefficient: "-0.29",
  voc_temp_coefficient: "-0.25",
  vmp_temp_coefficient: "-0.31",
  isc_temp_coefficient: "0.05",
  temp_coefficient_unit: "percent/C",
  length: "2278",
  length_unit: "mm",
  width: "1134",
  width_unit: "mm",
  efficiency: "21.3",
  efficiency_unit: "percent",
};
const inverterValues = {
  schema_version: "1.0",
  manufacturer: "Traceable Energy",
  model: "INV-100K",
  maximum_dc_voltage_v: "1100",
  mppt_minimum_voltage_v: "200",
  mppt_maximum_voltage_v: "1000",
  maximum_input_current_a: "300",
  maximum_short_circuit_current_a: "450",
  mppt_trackers: "10",
  total_dc_inputs: "20",
  rated_ac_power: "100",
  rated_ac_power_unit: "kW",
  nominal_ac_voltage_v: "400",
  maximum_efficiency: "98.6",
  efficiency_unit: "percent",
};
const moduleCsv = `${csvTemplate("pv-module")}${csvRow(MODULE_CSV_COLUMNS, moduleValues)}\n`;
const inverterCsv = `${csvTemplate("inverter")}${csvRow(INVERTER_CSV_COLUMNS, inverterValues)}\n`;
assert.equal(parseComponentCsv(moduleCsv, "pv-module").records.length, 1);
assert.equal(parseComponentCsv(inverterCsv, "inverter").records.length, 1);
assert.equal(
  parseComponentCsv(
    `${csvTemplate("pv-module").replace(/,/g, ";")}${csvRow(MODULE_CSV_COLUMNS, moduleValues).replace(/,/g, ";")}\n`,
    "pv-module",
  ).records.length,
  1,
);
assert.equal(
  parseComponentCsv(
    `${csvTemplate("inverter").replace(/,/g, "\t")}${csvRow(INVERTER_CSV_COLUMNS, { ...inverterValues, manufacturer: "Énergie UTF-8" }).replace(/,/g, "\t")}\n`,
    "inverter",
  ).records.length,
  1,
);
assert.throws(() => parseComponentCsv("bad", "pv-module"));
assert.throws(() => parseComponentCsv("schema_version,manufacturer\n1.0,A", "pv-module"));
const duplicateCsv = `${moduleCsv}${csvRow(MODULE_CSV_COLUMNS, { ...moduleValues, rated_power: "560" })}\n`;
assert.equal(
  parseComponentCsv(duplicateCsv, "pv-module").duplicateGroups[0].conflict,
  "conflicting",
);
assert.equal(
  findDuplicateComponents([module, { ...module, recordId: "copy" }])[0].conflict,
  "duplicate",
);
assert.equal(parseComponentJson(JSON.stringify(module)).length, 1);

const approvedModule = transitionComponent(
  transitionComponent(module, "reviewed"),
  "approved",
) as PvModuleRecord;
const approvedInverter = transitionComponent(
  transitionComponent(inverter, "reviewed"),
  "approved",
) as InverterRecord;
const assumptions = {
  minimumCellTemperatureC: -10,
  maximumCellTemperatureC: 70,
  modulesPerString: 20,
  parallelStrings: 2,
  stringsPerMppt: 2,
  designMarginFraction: 0,
};
const compatibility = compatibilityReview(approvedModule, approvedInverter, assumptions);
assert.equal(compatibility.find((item) => item.code === "MAX_DC_VOLTAGE")?.status, "pass");
assert(compatibility.find((item) => item.code === "MPPT_LOWER")?.calculatedValue);
assert.match(compatibility.find((item) => item.code === "MPPT_LOWER")?.method ?? "", /βVmp/);
assert.equal(compatibility.find((item) => item.code === "INPUT_CURRENT")?.status, "pass");
assert(compatibility.find((item) => item.code === "DC_AC_RATIO")?.calculatedValue);
assert.deepEqual(compatibility, compatibilityReview(approvedModule, approvedInverter, assumptions));
assert.throws(() =>
  compatibilityReview(approvedModule, approvedInverter, { ...assumptions, modulesPerString: 0 }),
);
assert.equal(module.parameters.voc.normalizedValue, 49.8);
const missingVmpCoefficient = compatibilityReview(
  {
    ...approvedModule,
    parameters: { ...approvedModule.parameters, vmpTemperatureCoefficient: undefined },
  },
  approvedInverter,
  assumptions,
);
assert.equal(
  missingVmpCoefficient.find((item) => item.code === "MPPT_LOWER")?.status,
  "not-evaluated",
);
assert.equal(
  missingVmpCoefficient.find((item) => item.code === "MPPT_UPPER")?.status,
  "not-evaluated",
);
assert(
  validateComponent({
    ...module,
    parameters: {
      ...module.parameters,
      vmpTemperatureCoefficient: {
        ...module.parameters.vmpTemperatureCoefficient!,
        normalizedValue: 0.001,
      },
    },
  }).some((item) => item.code === "VMP_COEFFICIENT_SUSPICIOUS"),
);
const missing = compatibilityReview(
  approvedModule,
  {
    ...approvedInverter,
    parameters: {
      ...approvedInverter.parameters,
      mpptMinimumVoltage: undefined,
      maximumShortCircuitCurrent: undefined,
    },
  },
  assumptions,
);
assert.equal(missing.find((item) => item.code === "MPPT_LOWER")?.status, "not-evaluated");
assert.equal(
  missing.find((item) => item.code === "SHORT_CIRCUIT_CURRENT")?.status,
  "not-evaluated",
);

const rows = Array.from({ length: 1_000 }, (_, index) =>
  csvRow(MODULE_CSV_COLUMNS, { ...moduleValues, manufacturer: "Maker", model: `Model-${index}` }),
);
const largeCsv = `${csvTemplate("pv-module")}${rows.join("\n")}\n`;
const started = performance.now();
const large = parseComponentCsv(largeCsv, "pv-module");
const importMs = performance.now() - started;
assert.equal(large.records.length, 1_000);
assert(importMs < 3_000);
const serializeStarted = performance.now();
serializeComponentLibrary(large.records);
const serializationMs = performance.now() - serializeStarted;
assert(serializationMs < 3_000);
const inverterRows = Array.from({ length: 1_000 }, (_, index) =>
  csvRow(INVERTER_CSV_COLUMNS, {
    ...inverterValues,
    manufacturer: "Maker",
    model: `Inverter-${index}`,
  }),
);
const inverterStarted = performance.now();
assert.equal(
  parseComponentCsv(`${csvTemplate("inverter")}${inverterRows.join("\n")}\n`, "inverter").records
    .length,
  1_000,
);
const inverterImportMs = performance.now() - inverterStarted;
const maximumRows = Array.from({ length: 5_000 }, (_, index) =>
  csvRow(MODULE_CSV_COLUMNS, { ...moduleValues, manufacturer: "Maximum", model: `M-${index}` }),
);
const maximumStarted = performance.now();
assert.equal(
  parseComponentCsv(`${csvTemplate("pv-module")}${maximumRows.join("\n")}\n`, "pv-module").records
    .length,
  5_000,
);
const maximumImportMs = performance.now() - maximumStarted;
assert.throws(() =>
  parseComponentCsv(
    `${csvTemplate("pv-module")}${[...maximumRows, maximumRows[0]].join("\n")}\n`,
    "pv-module",
  ),
);
const normalizationStarted = performance.now();
for (let index = 0; index < 10_000; index += 1)
  engineeringValue(index + 1, "kW", "power", module.parameters.vmp.source);
const normalizationMs = performance.now() - normalizationStarted;
const duplicatesStarted = performance.now();
findDuplicateComponents(large.records);
const duplicateMs = performance.now() - duplicatesStarted;
const comparisonStarted = performance.now();
large.records.slice(0, 8).map((record) => ({
  id: record.recordId,
  parameters: Object.entries(record.parameters),
}));
const comparisonMs = performance.now() - comparisonStarted;
const compatibilityStarted = performance.now();
for (let index = 0; index < 100; index += 1)
  compatibilityReview(approvedModule, approvedInverter, {
    ...assumptions,
    maximumCellTemperatureC: 50 + index / 100,
  });
const compatibilityMs = performance.now() - compatibilityStarted;
console.log(
  `Component schema, units, validation, CSV/JSON, review, compatibility, and performance passed; 1,000 modules ${importMs.toFixed(1)} ms; 1,000 inverters ${inverterImportMs.toFixed(1)} ms; 5,000 modules ${maximumImportMs.toFixed(1)} ms; serialization ${serializationMs.toFixed(1)} ms; 10,000 normalizations ${normalizationMs.toFixed(1)} ms; 1,000-record duplicate scan ${duplicateMs.toFixed(1)} ms; 8-record comparison preparation ${comparisonMs.toFixed(1)} ms; 100 compatibility calculations ${compatibilityMs.toFixed(1)} ms.`,
);
