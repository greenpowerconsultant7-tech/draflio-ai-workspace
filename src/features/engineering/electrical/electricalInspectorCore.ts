import {
  MAX_FILE_BYTES,
  MAX_PAGES,
  type BoqRow,
  type DocumentClassification,
  type EquipmentRecord,
  type EquipmentType,
  type Finding,
  type NormalizedRectangle,
  type PageEvidence,
  type RatingFields,
  type TextFragment,
  emptyRatings,
} from "./electricalInspectorTypes";

export function validateFileBasics(file: File): string | null {
  if (file.size === 0) return "Choose a non-empty PDF file.";
  if (file.size > MAX_FILE_BYTES) return "Choose a PDF no larger than 20 MB.";
  if (!file.name.toLowerCase().endsWith(".pdf")) return "Choose a file with a .pdf extension.";
  if (file.type && file.type !== "application/pdf" && file.type !== "application/octet-stream") {
    return "Choose a PDF-compatible file.";
  }
  return null;
}

export function hasPdfSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && new TextDecoder("ascii").decode(bytes.subarray(0, 5)) === "%PDF-";
}

export function validatePageCount(pageCount: number): string | null {
  if (!Number.isInteger(pageCount) || pageCount < 1) return "The PDF has no inspectable pages.";
  if (pageCount > MAX_PAGES) return "Choose a PDF with no more than 20 pages.";
  return null;
}

export function safeBaseName(name: string): string {
  const base = name
    .replace(/\.pdf$/i, "")
    .replace(/[^\p{L}\p{N}._ -]+/gu, "-")
    .trim();
  return (
    base
      .replace(/\s+/g, "-")
      .replace(/^[.-]+|[.-]+$/g, "")
      .slice(0, 80) || "drawing"
  );
}

export function classifyEvidence(
  text: number,
  vectors: number,
  images: number,
): DocumentClassification {
  if (text > 0 && vectors >= 8 && images > 0 && vectors >= images * 2) return "mixed-content";
  if (text > 0 && vectors >= 8 && vectors > images * 2) return "native-vector-searchable";
  if (text > 0) return "searchable-low-vector";
  if (images > 0) return "image-only";
  return "empty-or-unsupported";
}

export function combineClassification(pages: PageEvidence[]): DocumentClassification {
  const text = pages.reduce((sum, page) => sum + page.textItemCount, 0);
  const vectors = pages.reduce((sum, page) => sum + page.vectorOperationCount, 0);
  const images = pages.reduce((sum, page) => sum + page.imageOperationCount, 0);
  return classifyEvidence(text, vectors, images);
}

export function clampRectangle(rectangle: NormalizedRectangle): NormalizedRectangle | null {
  const values = [rectangle.x, rectangle.y, rectangle.width, rectangle.height];
  if (!values.every(Number.isFinite)) return null;
  const x = Math.min(1, Math.max(0, rectangle.x));
  const y = Math.min(1, Math.max(0, rectangle.y));
  const width = Math.min(1 - x, Math.max(0, rectangle.width));
  const height = Math.min(1 - y, Math.max(0, rectangle.height));
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

export function groupTextFragments(fragments: TextFragment[]): TextFragment[] {
  const sorted = [...fragments].sort(
    (a, b) => a.rectangle.y - b.rectangle.y || a.rectangle.x - b.rectangle.x,
  );
  const groups: TextFragment[] = [];
  for (const fragment of sorted) {
    const previous = groups.at(-1);
    const sameLine =
      previous &&
      Math.abs(previous.rectangle.y - fragment.rectangle.y) <=
        Math.max(previous.rectangle.height, fragment.rectangle.height) * 0.65;
    const gap = previous
      ? fragment.rectangle.x - (previous.rectangle.x + previous.rectangle.width)
      : 1;
    if (
      previous &&
      sameLine &&
      gap >= -0.01 &&
      gap <= Math.max(0.035, previous.rectangle.height * 2.5)
    ) {
      const right = Math.max(
        previous.rectangle.x + previous.rectangle.width,
        fragment.rectangle.x + fragment.rectangle.width,
      );
      const bottom = Math.max(
        previous.rectangle.y + previous.rectangle.height,
        fragment.rectangle.y + fragment.rectangle.height,
      );
      previous.value = `${previous.value} ${fragment.value}`.replace(/\s+/g, " ").trim();
      previous.rectangle.width = right - previous.rectangle.x;
      previous.rectangle.height = bottom - previous.rectangle.y;
    } else {
      groups.push({ ...fragment, rectangle: { ...fragment.rectangle } });
    }
  }
  return groups;
}

const rules: readonly [EquipmentType, RegExp][] = [
  ["capacitive-voltage-transformer", /\b(?:CVT[-\s]?\d+|CAPACITIVE\s+VOLTAGE\s+TRANSFORMER)\b/i],
  ["power-transformer", /\b(?:TR|XFMR|T)[-\s]?\d+\b|\bPOWER\s+TRANSFORMER\b|\bTRANSFORMER\b/i],
  ["circuit-breaker", /\bCB[-\s]?\d+\b|\bC\.?B\.?\b|\b(?:CIRCUIT\s+BREAKER|VCB|ACB|SF6\s+CB)\b/i],
  ["disconnector-isolator", /\bDS[-\s]?\d+\b|\b(?:ISOLATOR|DISCONNECTOR|DISCONNECT\s+SWITCH)\b/i],
  ["current-transformer", /\bCT[-\s]?\d+\b|\bCURRENT\s+TRANSFORMER\b/i],
  ["potential-transformer", /\b(?:PT|VT)[-\s]?\d+\b|\b(?:POTENTIAL|VOLTAGE)\s+TRANSFORMER\b/i],
  ["protective-relay", /\b(?:RY|RELAY)[-\s]?\d+\b|\bPROTECTION\s+RELAY\b/i],
  ["inverter", /\b(?:INV|INVERTER|PCS)[-\s]?\d+\b|\bPOWER\s+CONVERSION\s+SYSTEM\b/i],
  ["busbar", /\bBUS[-\s]?\d+\b|\b(?:BUSBAR|MAIN\s+BUS)\b/i],
  ["feeder", /\b(?:FDR|FEEDER)[-\s]?\d+\b|\b(?:OUTGOING|INCOMING)\s+FEEDER\b/i],
  ["cable", /\bCABLE[-\s]?\d+\b/i],
  ["earth-switch", /\bES[-\s]?\d+\b|\b(?:EARTH|GROUND)\s+SWITCH\b/i],
  ["surge-arrester", /\b(?:LA|SA)[-\s]?\d+\b|\b(?:LIGHTNING|SURGE)\s+ARRESTER\b/i],
];

export function normalizeEquipmentId(value: string): string {
  return value
    .trim()
    .replace(/\s*[-–—]\s*/g, "-")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function detectEquipmentType(value: string): EquipmentType | null {
  return rules.find(([, pattern]) => pattern.test(value))?.[0] ?? null;
}

export function extractEquipmentId(value: string): string {
  return (
    value
      .match(
        /\b(?:CVT|XFMR|RELAY|INVERTER|FEEDER|CABLE|TR|CB|DS|CT|PT|VT|RY|INV|PCS|BUS|FDR|ES|LA|SA|T)[-\s]\d+\b/i,
      )?.[0]
      ?.trim() ?? ""
  );
}

export function extractRatings(value: string): RatingFields {
  const ratings = emptyRatings();
  const voltageRatio = value.match(/\b\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\s*kV\b/i)?.[0] ?? "";
  const currentRatio = value.match(/\b\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\s*A\b/i)?.[0] ?? "";
  ratings.voltageRatio = voltageRatio;
  ratings.ratio = currentRatio;
  ratings.apparentPower = value.match(/\b\d+(?:\.\d+)?\s*(?:MVA|kVA)\b/i)?.[0] ?? "";
  ratings.activePower = value.match(/\b\d+(?:\.\d+)?\s*(?:MW|kW)\b/i)?.[0] ?? "";
  ratings.interruptingCurrent = value.match(/\b\d+(?:\.\d+)?\s*kA\b/i)?.[0] ?? "";
  ratings.voltage = voltageRatio
    ? ""
    : (value.match(/\b\d+(?:\.\d+)?\s*(?:kV|MV|V)\b/i)?.[0] ?? "");
  ratings.current =
    currentRatio || ratings.interruptingCurrent
      ? ""
      : (value.match(/\b\d+(?:\.\d+)?\s*A\b/i)?.[0] ?? "");
  ratings.frequency = value.match(/\b\d+(?:\.\d+)?\s*Hz\b/i)?.[0] ?? "";
  ratings.vectorGroup = value.match(/\b(?:Dyn|Yyn|YNd|Dd|Yd)\d{1,2}\b/i)?.[0] ?? "";
  ratings.cableSpecification =
    value.match(
      /\b(?:\d+\s*[x×]\s*)?\d+(?:\.\d+)?\s*(?:mm²|mm2|sq\.?\s*mm)\b.*?\bXLPE\b|\bXLPE\b/i,
    )?.[0] ?? "";
  const protectionText = value.replace(/\b\d+(?:\.\d+)?\s*Hz\b/gi, "");
  ratings.protectionFunctions = [
    ...protectionText.matchAll(/\b(?:21|27|32|46|49|50|51|59|67|81|87)(?:N|G|T)?\b/g),
  ].map((match) => match[0]);
  return ratings;
}

function distance(a: NormalizedRectangle, b: NormalizedRectangle): number {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  return Math.hypot(ax - bx, ay - by);
}

export function detectPageEquipment(fragments: TextFragment[], startOrder = 0): EquipmentRecord[] {
  const grouped = groupTextFragments(fragments);
  const candidates = grouped.filter((fragment) => detectEquipmentType(fragment.value));
  return candidates.slice(0, 1_000 - startOrder).map((candidate, index) => {
    const equipmentType = detectEquipmentType(candidate.value) ?? "unknown-electrical-item";
    const nearby = grouped
      .filter(
        (fragment) =>
          fragment !== candidate &&
          fragment.pageIndex === candidate.pageIndex &&
          distance(candidate.rectangle, fragment.rectangle) <= 0.18,
      )
      .sort(
        (a, b) =>
          distance(candidate.rectangle, a.rectangle) - distance(candidate.rectangle, b.rectangle),
      )
      .slice(0, 6);
    const combined = [candidate.value, ...nearby.map((fragment) => fragment.value)].join(" ");
    const rating = extractRatings(combined);
    const equipmentId = extractEquipmentId(candidate.value);
    const ratingCount = Object.values(rating).flat().filter(Boolean).length;
    return {
      id: `record-${startOrder + index + 1}`,
      source: "detected",
      status: "review",
      pageIndex: candidate.pageIndex,
      normalizedRectangle: candidate.rectangle,
      equipmentType,
      equipmentId,
      normalizedEquipmentId: normalizeEquipmentId(equipmentId),
      description: candidate.value.slice(0, 240),
      ...rating,
      confidence: equipmentId && ratingCount ? "high" : equipmentId ? "medium" : "low",
      confidenceReasons: [
        equipmentId ? "Recognized equipment tag" : "Equipment keyword only",
        ratingCount ? "Nearby rating evidence" : "No nearby rating evidence",
      ],
      notes: "",
      order: startOrder + index + 1,
    };
  });
}

const ratingKeys: readonly (keyof Pick<
  EquipmentRecord,
  | "voltage"
  | "voltageRatio"
  | "apparentPower"
  | "current"
  | "interruptingCurrent"
  | "ratio"
  | "vectorGroup"
>)[] = [
  "voltage",
  "voltageRatio",
  "apparentPower",
  "current",
  "interruptingCurrent",
  "ratio",
  "vectorGroup",
];

export function calculateFindings(records: EquipmentRecord[]): Finding[] {
  const active = records.filter((record) => record.status !== "rejected");
  const findings: Finding[] = [];
  let sequence = 1;
  const add = (finding: Omit<Finding, "id">) =>
    findings.push({ id: `finding-${sequence++}`, ...finding });
  const groups = new Map<string, EquipmentRecord[]>();
  for (const record of active) {
    if (!record.normalizedEquipmentId) {
      add({
        category: "missing-id",
        severity: "review",
        pages: [record.pageIndex + 1],
        relatedRecordIds: [record.id],
        message: "Equipment identification requires review.",
      });
    } else {
      groups.set(record.normalizedEquipmentId, [
        ...(groups.get(record.normalizedEquipmentId) ?? []),
        record,
      ]);
    }
    if (record.confidence === "low")
      add({
        category: "low-confidence",
        severity: "review",
        pages: [record.pageIndex + 1],
        relatedRecordIds: [record.id],
        message: "Low-confidence extraction requires manual review.",
      });
    const expectsRating = [
      "power-transformer",
      "circuit-breaker",
      "current-transformer",
      "potential-transformer",
      "capacitive-voltage-transformer",
      "inverter",
      "cable",
    ].includes(record.equipmentType);
    if (expectsRating && !ratingKeys.some((key) => record[key]))
      add({
        category: "rating-not-detected",
        severity: "review",
        pages: [record.pageIndex + 1],
        relatedRecordIds: [record.id],
        message: "Rating information was not detected.",
      });
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const pages = [...new Set(group.map((record) => record.pageIndex + 1))];
    const ids = group.map((record) => record.id);
    add({
      category: "duplicate-id",
      severity: "warning",
      pages,
      relatedRecordIds: ids,
      message: "The same normalized equipment ID appears more than once.",
    });
    if (new Set(group.map((record) => record.equipmentType)).size > 1)
      add({
        category: "conflicting-type",
        severity: "warning",
        pages,
        relatedRecordIds: ids,
        message: "Duplicate equipment records have conflicting suggested types.",
      });
    if (
      ratingKeys.some((key) => new Set(group.map((record) => record[key]).filter(Boolean)).size > 1)
    )
      add({
        category: "conflicting-rating",
        severity: "warning",
        pages,
        relatedRecordIds: ids,
        message: "Duplicate equipment records contain conflicting visible rating text.",
      });
  }
  if (records.some((record) => record.status === "rejected"))
    add({
      category: "rejected-exclusion",
      severity: "info",
      pages: [],
      relatedRecordIds: [],
      message: "Rejected records are excluded from exports and the Draft BOQ.",
    });
  return findings;
}

export function principalRating(record: EquipmentRecord): string {
  return (
    record.apparentPower ||
    record.activePower ||
    record.voltageRatio ||
    record.voltage ||
    record.ratio ||
    record.current ||
    record.interruptingCurrent ||
    "No principal rating"
  );
}

export function calculateBoq(records: EquipmentRecord[], includeReview = false): BoqRow[] {
  const included = records.filter(
    (record) => record.status === "accepted" || (includeReview && record.status === "review"),
  );
  const groups = new Map<string, BoqRow>();
  for (const record of included) {
    const rating = principalRating(record);
    const key = `${record.equipmentType}\u0000${rating.toUpperCase()}`;
    const row = groups.get(key) ?? {
      equipmentType: record.equipmentType,
      ratingSummary: rating,
      quantity: 0,
      sourcePages: [],
      reviewBasis: includeReview ? "Accepted and unreviewed records" : "Accepted records",
    };
    row.quantity += 1;
    row.sourcePages = [...new Set([...row.sourcePages, record.pageIndex + 1])].sort(
      (a, b) => a - b,
    );
    groups.set(key, row);
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.equipmentType.localeCompare(b.equipmentType) ||
      a.ratingSummary.localeCompare(b.ratingSummary),
  );
}
