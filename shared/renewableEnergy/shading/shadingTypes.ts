import type { GeneratedTable, LayoutReview, Point2 } from "../layout/layoutTypes";
import type { DraflioScene } from "../draflioSceneTypes";
import type { TerrainMesh } from "../terrain/terrainTypes";

export const SHADING_SCHEMA_NAME = "draflio-shading-review" as const;
export const SHADING_SCHEMA_VERSION = "1.0" as const;
export const SHADING_RULE_VERSION = "re7a-geometric-shading-1.0" as const;
export const SHADING_COMPANION_SCHEMA = "draflio-scene-shading-companion" as const;
export const SHADING_COMPANION_VERSION = "1.0" as const;
export const SUN_METHOD = "NOAA Solar Calculator equations (Meeus), revision 2026-07" as const;
export const SHADING_LIMITS = {
  maxSceneBytes: 10 * 1024 * 1024,
  maxTables: 10_000,
  maxSelectedTables: 1_000,
  maxTerrainTriangles: 500_000,
  maxTerrainVertices: 250_000,
  maxObstructions: 500,
  maxObstructionVertices: 1_000,
  maxHorizonPoints: 720,
  maxSamplesPerTable: 81,
  maxTimestamps: 10_000,
  maxShadowPolygons: 50_000,
  maxFindings: 100_000,
  maxWorkerMessageBytes: 20 * 1024 * 1024,
  maxExportBytes: 20 * 1024 * 1024,
  max2DVertices: 250_000,
  max3DTriangles: 250_000,
  maxNeighborDistanceMeters: 500,
  maxTerrainIndexCells: 250_000,
  maxTrianglesPerTerrainCell: 2_048,
  maxRayTraversalCells: 4_096,
  maxRayCandidateTriangles: 25_000,
  maxTableIndexCells: 100_000,
  maxTablesPerCell: 2_048,
  maxRowShadowCandidates: 5_000,
  maxObstructionIndexCells: 100_000,
  maxObstructionsPerCell: 1_024,
  maxObstructionCandidates: 500,
  maxImportPolygonVertices: 100_000,
} as const;

export type DraflioShadingSource = {
  sourceType: "draflio-scene-authoritative-layout";
  schemaVersion: "1.0";
  calculationVersion: typeof SHADING_RULE_VERSION;
  projectReference: string;
  sourceSceneReference: string;
  coordinateSystem: "registered-local-metric";
  units: "metres";
  registrationState: "confirmed";
  sourceReviewState: "reviewed" | "approved";
  terrainRequired: boolean;
  scene: DraflioScene;
  layoutReview: LayoutReview;
  terrain?: {
    reviewState: "verified";
    provenance: string;
    mesh: TerrainMesh;
    noDataGeometry?: {
      id: string;
      vertices: Point2[];
      provenance: string;
      method: string;
      methodVersion: string;
    }[];
  };
  provenance: string;
};

export type DraflioSourceImportSummary = {
  sourceType: DraflioShadingSource["sourceType"];
  sceneSchema: string;
  sceneVersion: string;
  calculationVersion: string;
  sourceSceneReference: string;
  projectReference: string;
  coordinateSystem: string;
  units: string;
  registrationState: string;
  sourceReviewState: string;
  tableCount: number;
  terrainVertexCount: number;
  terrainTriangleCount: number;
  siteBoundaryCount: number;
  exclusionCount: number;
  effectiveArrayAreaCount: number;
  acceptedRecords: number;
  rejectedRecords: number;
  warnings: string[];
  incompatibilities: string[];
  geometryLimitStatus: "within-limits" | "exceeded";
};

export type TableSamplingMethod =
  "centre" | "corners" | "footprint-corners-and-centre" | "module-grid";
export type TableSpatialIndex = {
  cellSizeMeters: number;
  originX: number;
  originY: number;
  cells: ReadonlyMap<string, readonly string[]>;
  tables: ReadonlyMap<string, GeneratedTable>;
};
export type ObstructionShadowIndex = {
  cellSizeMeters: number;
  originX: number;
  originY: number;
  cells: ReadonlyMap<string, readonly string[]>;
  obstructions: ReadonlyMap<string, Obstruction>;
};

export type TerrainSpatialIndex = {
  cellSizeMeters: number;
  originX: number;
  originY: number;
  cells: ReadonlyMap<string, readonly number[]>;
  triangleBounds: readonly {
    minimumX: number;
    minimumY: number;
    maximumX: number;
    maximumY: number;
  }[];
};
export type TerrainCoverage =
  | { state: "covered"; triangleIndex: number; elevationMeters: number }
  | { state: "outside-coverage" | "no-data" };
export type TerrainRayResult =
  | {
      state: "blocked";
      triangleIndex: number;
      distanceMeters: number;
      blockingPoint: { x: number; y: number; z: number };
    }
  | { state: "clear" }
  | { state: "not-evaluated"; reason: string };

export type ReviewStatus =
  | "draft"
  | "calculated-review-required"
  | "valid-with-warnings"
  | "invalid"
  | "not-evaluated"
  | "reviewed"
  | "approved-for-preliminary-draflio-workflow"
  | "excluded"
  | "restored";
export type ReviewTransition = {
  sequence: number;
  from: ReviewStatus;
  to: ReviewStatus;
  action: string;
  timestamp: string;
};
export type ShadingDomain =
  "row-to-row" | "terrain" | "horizon-profile" | "obstruction" | "combined";
export type ResultState =
  | "clear"
  | "shaded"
  | "partially-shaded"
  | "fully-shaded"
  | "blocked"
  | "below-horizon"
  | "not-evaluated"
  | "invalid";
export type ProjectTime = {
  latitudeDegrees: number;
  longitudeDegrees: number;
  timezone: string;
  fixedOffsetMinutes?: number;
  daylightSaving: "iana-rules" | "not-applicable-fixed-offset";
  projectNorthDegrees: number;
};
export type SunPosition = {
  timestamp: string;
  azimuthDegrees: number;
  elevationDegrees: number;
  zenithDegrees: number;
  belowHorizon: boolean;
  solarNoonMinutes: number;
  sunriseMinutes: number | null;
  sunsetMinutes: number | null;
  polarState: "none" | "polar-day" | "polar-night";
  equationOfTimeMinutes: number;
  declinationDegrees: number;
  localSolarTimeMinutes: number;
  method: typeof SUN_METHOD;
};
export type HorizonPoint = {
  azimuthDegrees: number;
  elevationDegrees: number;
  source: string;
  notes: string;
  reviewStatus: "reviewed" | "draft" | "excluded";
};
export type Obstruction = {
  id: string;
  classification:
    "building-box" | "wall" | "equipment-envelope" | "tree-envelope" | "generic-reviewed";
  footprint: Point2[];
  baseElevationMeters: number;
  heightMeters: number;
  source: string;
  notes: string;
  reviewStatus: "reviewed" | "draft" | "excluded" | "restored" | "invalid";
  uncertaintyMeters: number;
  provenance: string;
  drawingProvenance?: {
    schemaVersion: string;
    projectReference: string;
    drawingReference: string;
    pageReference: number;
    sourceObjectReference: string;
    coordinateSystem: "registered-local-metric";
    units: "metres";
    registrationState: "confirmed";
    sourceReviewState: "reviewed";
    baseElevationBasis: "explicit" | "verified-terrain-reference";
    terrainReference?: string;
    originalId: string;
  };
  creationMethod: "manual" | "reviewed-drawing";
  lifecycleHistory: {
    sequence: number;
    action: "created" | "edited" | "duplicated" | "reviewed" | "excluded" | "restored";
    detail: string;
  }[];
};
export type DrawingObstructionSource = {
  sourceType: "drawing-to-scene-obstructions";
  schemaVersion: "1.0";
  projectReference: string;
  drawingReference: string;
  coordinateSystem: "registered-local-metric";
  units: "metres";
  registrationState: "confirmed";
  sourceReviewState: "reviewed";
  provenance: string;
  records: {
    id: string;
    pageReference: number;
    sourceObjectReference: string;
    footprint: Point2[];
    heightMeters: number;
    baseElevationMeters: number;
    baseElevationBasis: "explicit" | "verified-terrain-reference";
    terrainReference?: string;
    classification: Obstruction["classification"];
    uncertaintyMeters: number;
    provenance: string;
    creationMethod: "reviewed-drawing";
  }[];
};
export type ShadingFinding = {
  id: string;
  sourceObjectId: string;
  receiverObjectId: string;
  domain: ShadingDomain;
  state: ResultState;
  sunPosition: SunPosition;
  timestamp: string;
  calculationMethod: string;
  sampleCount: number;
  shadedCount: number;
  clearCount?: number;
  notEvaluatedCount?: number;
  invalidCount?: number;
  samplingMethod?: TableSamplingMethod;
  samplingVersion?: "re7a-table-sampling-1.0";
  geometricShadedFraction?: number;
  blockingReference?: string;
  blockingPoint?: Point2 & { z?: number };
  shadowPolygon?: Point2[];
  sampleEvidence?: {
    tableId: string;
    sampleId: string;
    sampleMethod: TableSamplingMethod;
    sampleMethodVersion: "re7a-table-sampling-1.0";
    point: Point2;
    receiverElevationMeters?: number;
    domain: ShadingDomain;
    state: "clear" | "shaded" | "unavailable" | "invalid";
    blockerReference?: string;
    blockingPoint?: Point2 & { z?: number };
    warning?: string;
  }[];
  warnings: string[];
  limitations: string[];
  ruleVersion: typeof SHADING_RULE_VERSION;
};
export type ShadingInputs = {
  project: ProjectTime;
  layout: Readonly<LayoutReview>;
  terrain?: Readonly<TerrainMesh>;
  horizon: readonly HorizonPoint[];
  obstructions: readonly Obstruction[];
  sampling: TableSamplingMethod;
  samplesPerTable: number;
  enabledDomains?: {
    rowToRow: boolean;
    terrain: boolean;
    horizon: boolean;
    obstruction: boolean;
  };
};
export type ShadingReview = {
  schemaName: typeof SHADING_SCHEMA_NAME;
  schemaVersion: typeof SHADING_SCHEMA_VERSION;
  createdAt: string;
  sourceLayoutReference: string;
  inputs: ShadingInputs;
  findings: ShadingFinding[];
  reviewStatus: ReviewStatus;
  assumptions: string[];
  limitations: string[];
  excludedHistory: string[];
  reviewHistory?: ReviewTransition[];
};
export type TimeRangeRequest = {
  type: "analyse";
  schemaVersion: typeof SHADING_SCHEMA_VERSION;
  generation: number;
  startIso: string;
  endIso: string;
  stepMinutes: number;
  inputs: ShadingInputs;
  selectedTableIds: string[];
};
export type TimeRangeProgress = {
  type: "progress";
  generation: number;
  stage: string;
  percent: number;
};
export type TimeRangeResponse =
  | TimeRangeProgress
  | {
      type: "success";
      generation: number;
      findings: ShadingFinding[];
      summary: TimeRangeSummary;
    }
  | { type: "error"; generation: number; message: string };
export type TimeRangeSummary = {
  requestedTimestamps: number;
  evaluatedTimestamps: number;
  belowHorizonTimestamps: number;
  clearTimestamps: number;
  shadedTimestamps: number;
  notEvaluatedTimestamps: number;
  invalidTimestamps: number;
  domainOccurrences: { domain: ShadingDomain; count: number }[];
  tables: {
    tableId: string;
    evaluated: number;
    clear: number;
    shaded: number;
    notEvaluated: number;
    invalid: number;
  }[];
  warnings: string[];
  limitations: string[];
};
export type ShadingSceneCompanion = {
  schemaName: typeof SHADING_COMPANION_SCHEMA;
  schemaVersion: typeof SHADING_COMPANION_VERSION;
  calculationVersion: typeof SHADING_RULE_VERSION;
  projectReference: string;
  sourceLayoutReference: string;
  coordinateSystem: "registered-local-metric";
  units: "metres";
  review: ShadingReview;
  timeRangeSummary?: TimeRangeSummary;
};

export function tableElevation(table: GeneratedTable): number | undefined {
  const values = table.terrainSamples
    .map((sample) => sample.elevation)
    .filter((value): value is number => Number.isFinite(value));
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
}
