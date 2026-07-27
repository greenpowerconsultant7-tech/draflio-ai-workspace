export const DRAWING_LIMITS = {
  maxFileBytes: 25 * 1024 * 1024,
  maxPages: 100,
  maxSelectedPages: 20,
  maxOperatorsPerPage: 150_000,
  maxTotalOperators: 500_000,
  maxPaths: 50_000,
  maxSegments: 250_000,
  maxCurves: 25_000,
  maxTextRecords: 25_000,
  maxObjects: 50_000,
  maxPreviewDimension: 2_048,
  maxCoordinateMagnitude: 10_000_000,
  maxCalibrationMetersPerPoint: 100_000,
  minCalibrationMetersPerPoint: 1e-8,
  tinySegmentPoints: 0.25,
  maxSelfIntersectionSegments: 1_000,
  maxCollinearToleranceDegrees: 5,
  maxCollinearGapPoints: 10,
} as const;

export type PageClassification = "vector" | "raster" | "mixed" | "empty" | "unsupported";
export type ReviewState =
  "extracted-review-required" | "accepted" | "excluded" | "unresolved" | "unsupported";
export type ManualClassification =
  | "unclassified"
  | "site-boundary-candidate"
  | "exclusion-zone-candidate"
  | "road-candidate"
  | "building-candidate"
  | "array-area-candidate"
  | "equipment-candidate"
  | "annotation"
  | "reference-geometry";
export type DrawingPoint = { x: number; y: number };
export type DrawingPath = {
  id: string;
  pageNumber: number;
  points: DrawingPoint[];
  closed: boolean;
  sourceBounds: { x: number; y: number; width: number; height: number };
  lineWidth: number;
  reviewState: ReviewState;
  classification: ManualClassification;
  findings: string[];
};
export type PageRecord = {
  pageNumber: number;
  width: number;
  height: number;
  rotation: number;
  vectorOperations: number;
  imageOperations: number;
  textOperations: number;
  operatorCount: number;
  classification: PageClassification;
  explanation: string;
};
export type Calibration = {
  pageNumber: number;
  first: DrawingPoint;
  second: DrawingPoint;
  enteredDistance: number;
  unit: "m" | "ft" | "mm";
  distanceMeters: number;
  metresPerPoint: number;
  method: "manual";
  confirmed: boolean;
  revision: number;
};
export type DrawingFinding = {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  objectId?: string;
  pageNumber?: number;
};
export type DrawingExtraction = {
  algorithmVersion: "drawing-vector-1.0";
  pages: PageRecord[];
  originalPaths: DrawingPath[];
  paths: DrawingPath[];
  findings: DrawingFinding[];
  cleanup: {
    collinearMergeEnabled: boolean;
    angularToleranceDegrees: number;
    gapTolerancePoints: number;
    beforeSegmentCount: number;
    afterSegmentCount: number;
    merges: { objectId: string; removedPointIndex: number }[];
  };
};
