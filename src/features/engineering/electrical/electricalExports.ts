import type {
  BoqRow,
  EquipmentRecord,
  Finding,
  InspectionResult,
  PageEvidence,
} from "./electricalInspectorTypes";

export function protectSpreadsheetValue(value: string): string {
  return /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
}

const safe = (value: string) => protectSpreadsheetValue(value);

export function createJsonModel(
  result: InspectionResult,
  records: EquipmentRecord[],
  boq: BoqRow[],
  findings: Finding[],
) {
  const equipment = records.filter((record) => record.status !== "rejected");
  return {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    document: {
      pageCount: result.pageCount,
      classification: result.classification,
      pageDimensions: result.pages.map(({ pageIndex, width, height, rotation }) => ({
        pageIndex,
        width,
        height,
        rotation,
      })),
      evidenceCounts: result.pages.map(
        ({ pageIndex, textItemCount, vectorOperationCount, imageOperationCount }) => ({
          pageIndex,
          textItemCount,
          vectorOperationCount,
          imageOperationCount,
        }),
      ),
    },
    reviewSummary: {
      accepted: records.filter((record) => record.status === "accepted").length,
      review: records.filter((record) => record.status === "review").length,
      rejected: records.filter((record) => record.status === "rejected").length,
      manual: records.filter((record) => record.source === "manual").length,
    },
    equipment,
    boq,
    findings,
    limitations: [
      "Browser-local deterministic label extraction requires qualified professional review.",
      "Scanned and image-only regions may not be analyzed.",
      "The output is a reviewable draft, not an engineering approval or compliance assessment.",
    ],
  };
}

function equipmentRows(records: EquipmentRecord[]) {
  return records
    .filter((record) => record.status !== "rejected")
    .map((record, index) => ({
      "Record Number": index + 1,
      Status: safe(record.status),
      Source: safe(record.source),
      Page: record.pageIndex + 1,
      "Equipment Type": safe(record.equipmentType),
      "Equipment ID": safe(record.equipmentId),
      Description: safe(record.description),
      Voltage: safe(record.voltage),
      "Voltage Ratio": safe(record.voltageRatio),
      "Apparent Power": safe(record.apparentPower),
      "Active Power": safe(record.activePower),
      Current: safe(record.current),
      "Interrupting Current": safe(record.interruptingCurrent),
      Ratio: safe(record.ratio),
      Frequency: safe(record.frequency),
      "Vector Group": safe(record.vectorGroup),
      "Cable Specification": safe(record.cableSpecification),
      "Protection Functions": safe(record.protectionFunctions.join(", ")),
      Confidence: safe(record.confidence),
      Notes: safe(record.notes),
    }));
}

export async function createWorkbookBytes(
  records: EquipmentRecord[],
  boq: BoqRow[],
  findings: Finding[],
  pages: PageEvidence[],
): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(equipmentRows(records)),
    "Equipment",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      boq.map((row) => ({
        "Equipment Type": safe(row.equipmentType),
        "Rating Summary": safe(row.ratingSummary),
        Quantity: row.quantity,
        "Source Pages": safe(row.sourcePages.join(", ")),
        "Review Basis": safe(row.reviewBasis),
      })),
    ),
    "BOQ",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      findings.map((finding) => ({
        Severity: safe(finding.severity),
        Category: safe(finding.category),
        Message: safe(finding.message),
        Pages: safe(finding.pages.join(", ")),
        "Related Record Numbers": safe(finding.relatedRecordIds.join(", ")),
      })),
    ),
    "Findings",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      pages.map((page) => ({
        Page: page.pageIndex + 1,
        Width: page.width,
        Height: page.height,
        Rotation: page.rotation,
        "Text Items": page.textItemCount,
        "Vector Operations": page.vectorOperationCount,
        "Image Operations": page.imageOperationCount,
        "Page Classification": safe(page.classification),
      })),
    ),
    "Pages",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(
      [
        ["Draflio Electrical Inspector — Read Me"],
        ["This output is generated from browser-local deterministic extraction."],
        ["Output requires qualified professional review."],
        ["Scanned or image-only regions may not be analyzed."],
        ["This is not a certified BOQ, engineering approval, or compliance assessment."],
        ["Check every value against the source drawings."],
      ].map((row) => row.map(safe)),
    ),
    "Read Me",
  );
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true });
  return new Uint8Array(buffer);
}
