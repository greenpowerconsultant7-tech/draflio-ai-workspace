import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  calculateBoq,
  calculateFindings,
  clampRectangle,
  classifyEvidence,
  detectEquipmentType,
  detectPageEquipment,
  extractRatings,
  groupTextFragments,
  hasPdfSignature,
  normalizeEquipmentId,
  safeBaseName,
  validatePageCount,
} from "../src/features/engineering/electrical/electricalInspectorCore";
import {
  createJsonModel,
  createWorkbookBytes,
  protectSpreadsheetValue,
} from "../src/features/engineering/electrical/electricalExports";
import {
  EQUIPMENT_TYPES,
  emptyRatings,
  type EquipmentRecord,
  type InspectionResult,
  type TextFragment,
} from "../src/features/engineering/electrical/electricalInspectorTypes";

assert.equal(hasPdfSignature(new TextEncoder().encode("%PDF-1.7")), true);
assert.equal(hasPdfSignature(new TextEncoder().encode("hello")), false);
assert.match(validatePageCount(21) ?? "", /20 pages/);
assert.equal(validatePageCount(2), null);
assert.equal(safeBaseName("../../bad =name.pdf"), "bad--name");

assert.equal(classifyEvidence(10, 20, 0), "native-vector-searchable");
assert.equal(classifyEvidence(10, 2, 0), "searchable-low-vector");
assert.equal(classifyEvidence(10, 20, 2), "mixed-content");
assert.equal(classifyEvidence(0, 0, 2), "image-only");
assert.equal(classifyEvidence(0, 0, 0), "empty-or-unsupported");

assert.deepEqual(clampRectangle({ x: -1, y: 0.5, width: 2, height: 2 }), {
  x: 0,
  y: 0.5,
  width: 1,
  height: 0.5,
});
assert.equal(clampRectangle({ x: 0, y: 0, width: 0, height: 1 }), null);
assert.equal(clampRectangle({ x: Number.NaN, y: 0, width: 1, height: 1 }), null);

const fragments: TextFragment[] = [
  { value: "TR-01", pageIndex: 0, rectangle: { x: 0.1, y: 0.1, width: 0.05, height: 0.02 } },
  { value: "33/11 kV", pageIndex: 0, rectangle: { x: 0.16, y: 0.1, width: 0.08, height: 0.02 } },
  { value: "10 MVA", pageIndex: 0, rectangle: { x: 0.1, y: 0.14, width: 0.07, height: 0.02 } },
  {
    value: "ordinary prose about a project",
    pageIndex: 0,
    rectangle: { x: 0.1, y: 0.7, width: 0.2, height: 0.02 },
  },
];
assert.equal(groupTextFragments(fragments).length, 3);
const detected = detectPageEquipment(fragments);
assert.equal(detected.length, 1);
assert.equal(detected[0]?.equipmentType, "power-transformer");
assert.equal(detected[0]?.voltageRatio, "33/11 kV");
assert.equal(detected[0]?.apparentPower, "10 MVA");

const rotatedFragments: TextFragment[] = [
  {
    value: "TR-01",
    pageIndex: 1,
    rectangle: { x: 0.1, y: 0.1, width: 0.02, height: 0.06 },
  },
  {
    value: "12.5 MVA",
    pageIndex: 1,
    rectangle: { x: 0.2, y: 0.1, width: 0.02, height: 0.09 },
  },
  {
    value: "CB-02",
    pageIndex: 1,
    rectangle: { x: 0.3, y: 0.1, width: 0.02, height: 0.06 },
  },
  {
    value: "20 kA",
    pageIndex: 1,
    rectangle: { x: 0.4, y: 0.1, width: 0.02, height: 0.05 },
  },
];
const rotatedDetected = detectPageEquipment(rotatedFragments);
assert.deepEqual(
  rotatedDetected.map((record) => record.equipmentId),
  ["TR-01", "CB-02"],
);
assert.equal(rotatedDetected[0]?.apparentPower, "12.5 MVA");
assert.equal(rotatedDetected[1]?.interruptingCurrent, "20 kA");

const examples: Record<(typeof EQUIPMENT_TYPES)[number], string> = {
  "power-transformer": "TR-01",
  "circuit-breaker": "CB-01",
  "disconnector-isolator": "DS-01",
  "current-transformer": "CT-01",
  "potential-transformer": "PT-01",
  "capacitive-voltage-transformer": "CVT-01",
  "protective-relay": "RELAY-01",
  inverter: "INV-01",
  busbar: "BUS-01",
  feeder: "FDR-01",
  cable: "CABLE-01",
  "earth-switch": "ES-01",
  "surge-arrester": "LA-01",
  "unknown-electrical-item": "not detected",
};
for (const type of EQUIPMENT_TYPES.filter((value) => value !== "unknown-electrical-item")) {
  assert.equal(detectEquipmentType(examples[type]), type);
}
assert.equal(detectEquipmentType("T C B R DS ordinary words"), null);
assert.equal(normalizeEquipmentId(" cb — 01 "), "CB-01");

const ratings = extractRatings(
  "33/11 kV 10 MVA 250 kVA 1 MW 1000 kW 400/1 A 25 kA 50 Hz Dyn11 4 x 240 mm² XLPE 50 51N",
);
assert.equal(ratings.voltageRatio, "33/11 kV");
assert.equal(ratings.apparentPower, "10 MVA");
assert.equal(ratings.activePower, "1 MW");
assert.equal(ratings.ratio, "400/1 A");
assert.equal(ratings.interruptingCurrent, "25 kA");
assert.equal(ratings.frequency, "50 Hz");
assert.equal(ratings.vectorGroup, "Dyn11");
assert.match(ratings.cableSpecification, /XLPE/i);
assert.deepEqual(ratings.protectionFunctions, ["50", "51N"]);
assert.equal(extractRatings("bare 12345").voltage, "");

function record(
  id: string,
  equipmentId: string,
  apparentPower: string,
  pageIndex: number,
  status: EquipmentRecord["status"] = "accepted",
): EquipmentRecord {
  return {
    id,
    source: "detected",
    status,
    pageIndex,
    equipmentType: "power-transformer",
    equipmentId,
    normalizedEquipmentId: normalizeEquipmentId(equipmentId),
    description: id === "record-1" ? "Transformer" : "=unsafe",
    ...emptyRatings(),
    apparentPower,
    confidence: "high",
    confidenceReasons: ["Recognized equipment tag"],
    notes: " @formula",
    order: Number(id.replace(/\D/g, "")),
  };
}
const records = [
  record("record-1", "TR-01", "10 MVA", 0),
  record("record-2", "TR-01", "12.5 MVA", 1),
  record("record-3", "CB-01", "25 kA", 0, "rejected"),
];
const findings = calculateFindings(records);
assert.ok(findings.some((finding) => finding.category === "duplicate-id"));
assert.ok(findings.some((finding) => finding.category === "conflicting-rating"));
assert.ok(findings.some((finding) => finding.category === "rejected-exclusion"));
assert.ok(!findings.some((finding) => /unsafe|compliance|under.?rated/i.test(finding.message)));
const boq = calculateBoq(records);
assert.equal(
  boq.reduce((sum, row) => sum + row.quantity, 0),
  2,
);
assert.equal(calculateBoq(records.map((item) => ({ ...item, status: "review" }))).length, 0);
assert.equal(protectSpreadsheetValue("  =2+2"), "'  =2+2");
assert.equal(protectSpreadsheetValue("+SUM(A1)"), "'+SUM(A1)");

const result: InspectionResult = {
  pageCount: 2,
  classification: "native-vector-searchable",
  pages: [
    {
      pageIndex: 0,
      width: 612,
      height: 792,
      rotation: 0,
      textItemCount: 12,
      vectorOperationCount: 20,
      imageOperationCount: 0,
      classification: "native-vector-searchable",
    },
    {
      pageIndex: 1,
      width: 792,
      height: 612,
      rotation: 90,
      textItemCount: 10,
      vectorOperationCount: 18,
      imageOperationCount: 0,
      classification: "native-vector-searchable",
    },
  ],
  equipment: records,
};
const model = createJsonModel(result, records, boq, findings);
assert.equal(model.equipment.length, 2);
const serialized = JSON.stringify(model);
for (const forbidden of [
  "pdfBytes",
  "rawPageText",
  "operatorList",
  "AbortController",
  "parserError",
]) {
  assert.ok(!serialized.includes(forbidden));
}

const workbookBytes = await createWorkbookBytes(records, boq, findings, result.pages);
assert.ok(workbookBytes.byteLength > 1_000);
assert.deepEqual([...workbookBytes.slice(0, 2)], [0x50, 0x4b]);
const reopened = XLSX.read(workbookBytes, { type: "array" });
assert.deepEqual(reopened.SheetNames, ["Equipment", "BOQ", "Findings", "Pages", "Read Me"]);
const equipmentRows = XLSX.utils.sheet_to_json<Record<string, string>>(reopened.Sheets.Equipment!);
assert.equal(equipmentRows.length, 2);
assert.match(equipmentRows[1]?.Description ?? "", /^'/);
assert.match(equipmentRows[1]?.Notes ?? "", /^'/);
assert.equal(XLSX.utils.sheet_to_json(reopened.Sheets.BOQ!).length, 2);
assert.equal(XLSX.utils.sheet_to_json(reopened.Sheets.Pages!).length, 2);
for (const sheet of reopened.SheetNames) {
  const cells = reopened.Sheets[sheet]!;
  for (const cell of Object.values(cells)) {
    if (typeof cell === "object" && cell && "f" in cell)
      assert.fail("Workbook must contain no formulas");
  }
}

process.stdout.write("Electrical inspector pure tests passed.\n");
