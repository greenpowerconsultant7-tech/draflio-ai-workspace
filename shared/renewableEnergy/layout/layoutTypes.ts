import type { ComponentRecord, PvModuleRecord } from "../components/componentTypes";
import type { DraflioScene, Vector3 } from "../draflioSceneTypes";

export const LAYOUT_SCHEMA_NAME = "draflio-layout-review" as const;
export const LAYOUT_SCHEMA_VERSION = "1.0" as const;
export const LAYOUT_ALGORITHM_VERSION = "layout-generation-1.0" as const;
export const REGISTRATION_ALGORITHM_VERSION = "similarity-registration-1.0" as const;
export const LAYOUT_RULE_VERSION = "layout-validation-1.0" as const;
export const LAYOUT_LIMITS = {
  maxSceneBytes: 10 * 1024 * 1024,
  maxObjects: 50_000,
  maxTerrainVertices: 250_000,
  maxTerrainTriangles: 500_000,
  maxDrawingVertices: 250_000,
  maxBoundaryVertices: 10_000,
  maxExclusions: 500,
  maxArrayAreas: 100,
  maxVerticesPerPolygon: 10_000,
  maxControlPoints: 100,
  maxTableTypes: 20,
  maxTables: 10_000,
  maxModules: 1_000_000,
  maxFindings: 50_000,
  maxEditHistory: 10_000,
  maxExportBytes: 20 * 1024 * 1024,
  maxCoordinateMagnitude: 100_000_000,
  maxProcessingMilliseconds: 10_000,
  maxDisplayTriangles: 250_000,
} as const;

export type Point2 = { x: number; y: number };
export type Polygon2 = { vertices: Point2[] };
export type LayoutReviewStatus =
  | "draft"
  | "generated-review-required"
  | "valid-with-warnings"
  | "invalid"
  | "unresolved"
  | "excluded"
  | "reviewed"
  | "approved-for-preliminary-draflio-workflow";
export type Readiness = "ready" | "warning" | "missing" | "invalid" | "not-applicable";
export type FindingStatus = "pass" | "fail" | "warning" | "not-evaluated";
export type LayoutFinding = {
  code: string;
  status: FindingStatus;
  affectedObjectId: string;
  explanation: string;
  inputs: string;
  unit?: string;
  limit?: number;
  calculatedValue?: number;
  margin?: number;
  assumptionSource: "engineer-entered" | "imported-reviewed-source" | "derived-geometry";
  ruleVersion: typeof LAYOUT_RULE_VERSION;
};
export type ControlPair = {
  id: string;
  drawing: Point2;
  terrain: Point2;
};
export type RegistrationResult = {
  method: "already-aligned" | "two-point" | "least-squares";
  active: boolean;
  confirmed: boolean;
  pointCount: number;
  translation: Point2;
  rotationDegrees: number;
  scale: number;
  rmsResidual: number;
  maximumResidual: number;
  residuals: { controlId: string; distance: number }[];
  transformDirection: "drawing-to-terrain";
  warningThresholdMeters: number;
  warnings: string[];
  algorithmVersion: typeof REGISTRATION_ALGORITHM_VERSION;
};
export type ReviewedPolygon = {
  id: string;
  name: string;
  geometry: Polygon2;
  originalGeometry: Readonly<Polygon2>;
  source: "drawing" | "manual" | "layout-review";
  sourceReference: string;
  reviewStatus: LayoutReviewStatus;
  areaSquareMeters: number;
  warnings: string[];
};
export type ExclusionCategory =
  | "statutory-setback"
  | "access-restriction"
  | "environmental-exclusion"
  | "water-body"
  | "building"
  | "road-reserve"
  | "electrical-clearance"
  | "terrain-restriction"
  | "temporary-exclusion"
  | "other-reviewed-exclusion";
export type ExclusionZone = ReviewedPolygon & {
  category: ExclusionCategory;
  reason: string;
  setbackMeters?: number;
  effectiveGeometry: Polygon2;
};
export type TerrainLimits = {
  maximumSlopeDegrees?: number;
  maximumCrossTableElevationDifferenceMeters?: number;
  maximumRowElevationChangeMeters?: number;
  minimumTerrainCoverageFraction?: number;
  minimumNoDataDistanceMeters?: number;
};
export type TableDefinition = {
  id: string;
  name: string;
  moduleRecordId: string;
  orientation: "portrait" | "landscape";
  modulesAcross: number;
  modulesHigh: number;
  horizontalGapMeters: number;
  verticalGapMeters: number;
  edgeAllowanceMeters: number;
  tiltDegrees: number;
  azimuthDegrees: number;
  minimumGroundClearanceMeters: number;
  maximumGroundClearanceMeters?: number;
  widthMeters: number;
  slopeLengthMeters: number;
  projectedDepthMeters: number;
  moduleCount: number;
  dcPowerWatts: number;
};
export type ArrayArea = ReviewedPolygon & {
  priority: number;
  tableTypeId: string;
  azimuthDegrees: number;
  rowPitchMeters: number;
  columnSpacingMeters: number;
  boundarySetbackMeters: number;
  effectivePlacementRegions: Polygon2[];
  setbackAlgorithmVersion: string;
  minimumTableSpacingMeters: number;
  origin: Point2;
  generationDirection: "positive-x" | "negative-x";
  maximumTableCount: number;
};
export type TerrainSample = { point: Point2; elevation?: number };
export type GeneratedTable = {
  id: string;
  arrayAreaId: string;
  tableTypeId: string;
  moduleRecordId: string;
  moduleCount: number;
  dcPowerWatts: number;
  footprint: Polygon2;
  center: Point2;
  azimuthDegrees: number;
  tiltDegrees: number;
  rowIndex: number;
  columnIndex: number;
  terrainSamples: TerrainSample[];
  reviewStatus: LayoutReviewStatus;
  findings: LayoutFinding[];
  exclusionReason?: string;
  algorithmVersion: typeof LAYOUT_ALGORITHM_VERSION;
  generationAssumptions: string;
  editHistory: { sequence: number; action: string; detail: string }[];
};
export type LayoutStatistics = {
  siteAreaSquareMeters: number;
  siteAreaHectares: number;
  usableArrayAreaSquareMeters: number;
  exclusionAreaSquareMeters: number;
  generatedTableCount: number;
  acceptedTableCount: number;
  excludedTableCount: number;
  unresolvedTableCount: number;
  moduleCount: number;
  dcCapacityWatts: number;
  groundCoverageRatio: number;
  groundCoverageMethod: string;
  terrainCoverageFraction?: number;
  findingCounts: Record<FindingStatus, number>;
};
export type LayoutInputs = {
  terrainScene?: Readonly<DraflioScene>;
  drawingScene?: Readonly<DraflioScene>;
  module?: Readonly<PvModuleRecord>;
  inverter?: Readonly<ComponentRecord>;
};
export type LayoutReview = {
  schemaName: typeof LAYOUT_SCHEMA_NAME;
  schemaVersion: typeof LAYOUT_SCHEMA_VERSION;
  projectName: string;
  coordinateSystem: "registered-local-metric";
  inputs: LayoutInputs;
  inverterCapacityContext?: {
    inverterRecordId: string;
    quantity: number;
    ratedAcPowerWatts: number;
    totalAcPowerWatts: number;
    layoutDcAcRatio: number;
    assumptionSource: "engineer-entered";
    limitation: string;
  };
  registration?: RegistrationResult;
  siteBoundary?: ReviewedPolygon;
  exclusions: ExclusionZone[];
  terrainLimits: TerrainLimits;
  tableDefinitions: TableDefinition[];
  arrayAreas: ArrayArea[];
  tables: GeneratedTable[];
  findings: LayoutFinding[];
  statistics?: LayoutStatistics;
  reviewStatus: LayoutReviewStatus;
  limitations: string[];
  algorithmVersions: string[];
};
export type TerrainSampler = (point: Point2) => {
  elevation?: number;
  slopeDegrees?: number;
  distanceToNoDataMeters?: number;
};
export type GenerationCancellation = { cancelled: boolean };
export type LayoutGenerationStage =
  | "validating-inputs"
  | "preparing-generation-grid"
  | "generating-candidate-tables"
  | "evaluating-boundary-exclusions"
  | "sampling-terrain"
  | "evaluating-table-relationships"
  | "calculating-statistics"
  | "serializing-result";
export type LayoutGenerationProgress = {
  stage: LayoutGenerationStage;
  percent: number;
  completed: number;
  total: number;
};
export type SceneReference = { sceneId: string; bounds?: { minimum: Vector3; maximum: Vector3 } };
