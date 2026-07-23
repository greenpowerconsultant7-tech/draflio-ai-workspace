export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_PAGES = 20;
export const MAX_PAGE_TEXT_ITEMS = 50_000;
export const MAX_TOTAL_TEXT_ITEMS = 200_000;
export const MAX_PAGE_OPERATIONS = 100_000;
export const MAX_TOTAL_OPERATIONS = 300_000;
export const MAX_EQUIPMENT_RECORDS = 1_000;

export type DocumentClassification =
  | "native-vector-searchable"
  | "searchable-low-vector"
  | "mixed-content"
  | "image-only"
  | "empty-or-unsupported";

export type EquipmentType =
  | "power-transformer"
  | "circuit-breaker"
  | "disconnector-isolator"
  | "current-transformer"
  | "potential-transformer"
  | "capacitive-voltage-transformer"
  | "protective-relay"
  | "inverter"
  | "busbar"
  | "feeder"
  | "cable"
  | "earth-switch"
  | "surge-arrester"
  | "unknown-electrical-item";

export const EQUIPMENT_TYPES: readonly EquipmentType[] = [
  "power-transformer",
  "circuit-breaker",
  "disconnector-isolator",
  "current-transformer",
  "potential-transformer",
  "capacitive-voltage-transformer",
  "protective-relay",
  "inverter",
  "busbar",
  "feeder",
  "cable",
  "earth-switch",
  "surge-arrester",
  "unknown-electrical-item",
];

export type NormalizedRectangle = { x: number; y: number; width: number; height: number };
export type Confidence = "high" | "medium" | "low";
export type ReviewStatus = "review" | "accepted" | "rejected";

export type PageEvidence = {
  pageIndex: number;
  width: number;
  height: number;
  rotation: number;
  textItemCount: number;
  vectorOperationCount: number;
  imageOperationCount: number;
  classification: DocumentClassification;
};

export type TextFragment = {
  value: string;
  pageIndex: number;
  rectangle: NormalizedRectangle;
};

export type RatingFields = {
  voltage: string;
  voltageRatio: string;
  apparentPower: string;
  activePower: string;
  current: string;
  interruptingCurrent: string;
  ratio: string;
  frequency: string;
  vectorGroup: string;
  cableSpecification: string;
  protectionFunctions: string[];
  additionalRatings: string[];
};

export type EquipmentRecord = RatingFields & {
  id: string;
  source: "detected" | "manual";
  status: ReviewStatus;
  pageIndex: number;
  normalizedRectangle?: NormalizedRectangle;
  equipmentType: EquipmentType;
  equipmentId: string;
  normalizedEquipmentId: string;
  description: string;
  confidence: Confidence;
  confidenceReasons: string[];
  notes: string;
  order: number;
};

export type Finding = {
  id: string;
  category:
    | "duplicate-id"
    | "conflicting-type"
    | "conflicting-rating"
    | "missing-id"
    | "rating-not-detected"
    | "low-confidence"
    | "rejected-exclusion";
  severity: "info" | "review" | "warning";
  pages: number[];
  relatedRecordIds: string[];
  message: string;
};

export type BoqRow = {
  equipmentType: EquipmentType;
  ratingSummary: string;
  quantity: number;
  sourcePages: number[];
  reviewBasis: "Accepted records" | "Accepted and unreviewed records";
};

export type InspectionResult = {
  pageCount: number;
  classification: DocumentClassification;
  pages: PageEvidence[];
  equipment: EquipmentRecord[];
};

export function emptyRatings(): RatingFields {
  return {
    voltage: "",
    voltageRatio: "",
    apparentPower: "",
    activePower: "",
    current: "",
    interruptingCurrent: "",
    ratio: "",
    frequency: "",
    vectorGroup: "",
    cableSpecification: "",
    protectionFunctions: [],
    additionalRatings: [],
  };
}
