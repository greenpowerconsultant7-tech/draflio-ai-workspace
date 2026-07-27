export const TERRAIN_LIMITS = {
  maxFileBytes: 25 * 1024 * 1024,
  maxPoints: 250_000,
  maxLines: 300_000,
  maxColumns: 50,
  maxSampleRows: 100,
  maxGridRows: 500,
  maxGridColumns: 500,
  maxGridCells: 250_000,
  maxContourSegments: 500_000,
  maxCoordinateMagnitude: 100_000_000,
  maxRejectionRate: 0.1,
} as const;

export type TerrainDelimiter = "comma" | "semicolon" | "tab" | "whitespace";
export type TerrainUnit = "m" | "ft";
export type TerrainCoordinateType = "local" | "projected" | "geographic";
export type ConflictResolution = "reject" | "first" | "last" | "average";
export type TerrainPoint = { x: number; y: number; z: number; sourceIndex: number };
export interface TerrainMapping {
  x: number;
  y: number;
  z: number;
}
export interface TerrainSample {
  delimiter: TerrainDelimiter;
  hasHeader: boolean;
  columns: string[];
  rows: string[][];
  lineCount: number;
}
export interface TerrainImportOptions {
  delimiter: TerrainDelimiter;
  hasHeader: boolean;
  mapping: TerrainMapping;
  unit: TerrainUnit;
  coordinateSystem: { type: TerrainCoordinateType; epsgCode?: number; name?: string };
  conflictResolution: ConflictResolution;
}
export interface TerrainParseResult {
  points: TerrainPoint[];
  acceptedRows: number;
  rejectedRows: number;
  exactDuplicateCount: number;
  conflictingDuplicateCount: number;
  originalBounds: TerrainBounds;
  localOrigin: { x: number; y: number; z: number };
  excludedSourceIndices: number[];
}
export interface TerrainBounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}
export interface TerrainGrid {
  originX: number;
  originY: number;
  spacing: number;
  rows: number;
  columns: number;
  elevations: Array<number | null>;
  interpolated: boolean;
  filledCells: number;
  noDataCells: number;
}
export interface TerrainQuality {
  pointCount: number;
  duplicateCount: number;
  conflictingDuplicateCount: number;
  isolatedPointIndices: number[];
  spikePointIndices: number[];
  coordinateOutlierIndices: number[];
  medianSpacing: number | null;
  density: number;
  likelyRegularGrid: boolean;
  missingCellEstimate: number;
}
export interface TerrainMesh {
  vertices: { x: number; y: number; z: number }[];
  triangles: [number, number, number][];
}
export interface TerrainContour {
  elevation: number;
  segments: [[number, number], [number, number]][];
}
export interface TerrainAnalysis {
  grid: TerrainGrid;
  mesh: TerrainMesh;
  contours: TerrainContour[];
  slopes: Array<number | null>;
  aspects: Array<number | null>;
  buildability: Array<"preferred" | "review-required" | "excluded-by-slope" | "no-data">;
  quality: TerrainQuality;
  durationMs: number;
}
export interface TerrainConfig {
  gridSpacing: number;
  idwPower: number;
  searchRadius: number;
  minNeighbours: number;
  maxNeighbours: number;
  contourInterval: number;
  preferredSlope: number;
  reviewSlope: number;
}
export type TerrainProgressStage =
  | "parsing"
  | "validating-points"
  | "checking-quality"
  | "detecting-grid"
  | "building-spatial-index"
  | "interpolating"
  | "building-mesh"
  | "calculating-contours"
  | "calculating-slope-aspect"
  | "screening-buildability"
  | "preparing-scene"
  | "ready"
  | "cancelled"
  | "failed";

export type TerrainProgressReporter = (stage: TerrainProgressStage) => void;
