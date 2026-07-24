export const DRAFLIO_SCENE_SCHEMA_VERSION = "1.0" as const;

export const SCENE_LIMITS = {
  maxJsonBytes: 10 * 1024 * 1024,
  maxSceneNameLength: 150,
  maxObjects: 50_000,
  maxSourceDocuments: 100,
  maxSourceReferencesPerObject: 100,
  maxWarningsPerObject: 100,
  maxMetadataKeys: 50,
  maxMetadataKeyLength: 64,
  maxMetadataStringLength: 1_000,
  maxVerticesPerGeometry: 1_000_000,
  maxTrianglesPerMesh: 2_000_000,
  maxRevisions: 1_000,
  maxTextLength: 2_000,
  maxAnnotationLength: 5_000,
  maxIssues: 500,
  maxCoordinateMagnitude: 100_000_000,
  maxPageCount: 1_000_000,
} as const;

export type Vector3 = { x: number; y: number; z: number };
export type Bounds3 = { minimum: Vector3; maximum: Vector3 };
export type ReviewStatus = "unreviewed" | "needs-review" | "approved" | "rejected";
export type SceneReviewStatus = "unreviewed" | "in-review" | "approved" | "rejected";
export type ExtractionMethod =
  "vector" | "ocr" | "computer-vision" | "component-library" | "manual" | "imported" | "unknown";

export type PointGeometry = { type: "point"; position: Vector3 };
export type PolylineGeometry = { type: "polyline"; points: Vector3[]; closed: boolean };
export type PolygonGeometry = { type: "polygon"; outerRing: Vector3[]; holes: Vector3[][] };
export type MeshGeometry = {
  type: "mesh";
  vertices: Vector3[];
  triangles: [number, number, number][];
};
export type BoxGeometry = { type: "box"; width: number; depth: number; height: number };
export type OrientedBoxGeometry = {
  type: "oriented-box";
  center: Vector3;
  dimensions: { width: number; depth: number; height: number };
  rotationDegrees: Vector3;
};
export type SceneGeometry =
  | PointGeometry
  | PolylineGeometry
  | PolygonGeometry
  | MeshGeometry
  | BoxGeometry
  | OrientedBoxGeometry;

export interface SourceReference {
  sourceDocumentId: string;
  pageNumber?: number;
  extractionMethod: ExtractionMethod;
  sourceBounds?: { x: number; y: number; width: number; height: number };
  note?: string;
  extractionScore?: number;
}

export interface SceneWarning {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  sourceReference?: SourceReference;
}

export interface SourceDocument {
  id: string;
  displayName: string;
  mediaType: string;
  sha256?: string;
  pageCount?: number;
  importedAt: string;
}

export interface SceneRevision {
  id: string;
  revisionNumber: number;
  label: string;
  createdAt: string;
  sourceDocumentIds: string[];
  summary?: string;
}

type Metadata = Record<string, string | number | boolean | null>;
type Transform = { translation: Vector3; rotationDegrees: Vector3; scale: Vector3 };
interface ObjectBase<G extends SceneGeometry, K extends string> {
  id: string;
  kind: K;
  name: string;
  visible: boolean;
  reviewStatus: ReviewStatus;
  geometry: G;
  transform: Transform;
  sourceReferences: SourceReference[];
  warnings: SceneWarning[];
  metadata: Metadata;
  createdAt: string;
  updatedAt: string;
}

export type TerrainSurface = ObjectBase<MeshGeometry, "terrain-surface"> & {
  elevationRange: { minimum: number; maximum: number };
  sourceType: "geotiff" | "xyz" | "csv" | "dxf" | "survey" | "drawing" | "manual";
  verticalDatum?: string;
  interpolationMethod?: string;
};
export type SiteBoundary = ObjectBase<PolygonGeometry, "site-boundary"> & {
  boundaryPurpose: "project" | "lease" | "construction" | "analysis";
};
export type ExclusionZone = ObjectBase<PolygonGeometry, "exclusion-zone"> & {
  exclusionReason:
    | "environmental"
    | "slope"
    | "access"
    | "drainage"
    | "utility"
    | "setback"
    | "user-defined"
    | "unknown";
};
export type Road = ObjectBase<PolylineGeometry | PolygonGeometry, "road"> & {
  roadType: "existing" | "proposed" | "temporary" | "access" | "internal";
  nominalWidthMeters?: number;
};
export type Building = ObjectBase<
  PolygonGeometry | BoxGeometry | OrientedBoxGeometry,
  "building"
> & {
  heightMeters?: number;
  roofType?: "flat" | "pitched" | "unknown";
};
export type Obstruction = ObjectBase<
  PointGeometry | PolygonGeometry | BoxGeometry | OrientedBoxGeometry,
  "obstruction"
> & {
  obstructionType: "vegetation" | "pole" | "tower" | "wall" | "equipment" | "unknown";
  heightMeters?: number;
};
export type PvArray = ObjectBase<
  PolygonGeometry | BoxGeometry | OrientedBoxGeometry,
  "pv-array"
> & {
  mountingType: "fixed-tilt" | "single-axis-tracker" | "dual-axis-tracker" | "rooftop" | "unknown";
  tiltDegrees?: number;
  azimuthDegrees?: number;
  tableCount?: number;
  moduleCount?: number;
  moduleComponentId?: string;
  stringingStatus: "undefined" | "draft" | "reviewed";
};
export type ElectricalEquipment = ObjectBase<
  PointGeometry | PolygonGeometry | BoxGeometry | OrientedBoxGeometry,
  "electrical-equipment"
> & {
  equipmentType:
    | "inverter"
    | "transformer"
    | "switchgear"
    | "combiner"
    | "meter"
    | "substation"
    | "battery"
    | "other";
  componentId?: string;
  equipmentTag?: string;
};
export type CableRoute = ObjectBase<PolylineGeometry, "cable-route"> & {
  cableSystem: "dc" | "ac-lv" | "ac-mv" | "ac-hv" | "communication" | "earthing" | "unknown";
  circuitId?: string;
  conductorCount?: number;
};
export type Annotation = ObjectBase<
  PointGeometry | PolylineGeometry | PolygonGeometry,
  "annotation"
> & {
  text: string;
  annotationType: "note" | "dimension" | "unresolved-label" | "review-comment";
};

export type DraflioSceneObject =
  | TerrainSurface
  | SiteBoundary
  | ExclusionZone
  | Road
  | Building
  | Obstruction
  | PvArray
  | ElectricalEquipment
  | CableRoute
  | Annotation;

export interface DraflioScene {
  schemaVersion: typeof DRAFLIO_SCENE_SCHEMA_VERSION;
  sceneId: string;
  name: string;
  sector: "solar";
  createdAt: string;
  updatedAt: string;
  units: { length: "m"; area: "m2"; angle: "deg"; elevation: "m" };
  coordinateSystem: {
    type: "local" | "projected" | "geographic";
    epsgCode?: number;
    name?: string;
    origin?: Vector3;
  };
  bounds?: Bounds3;
  objects: DraflioSceneObject[];
  sourceDocuments: SourceDocument[];
  revisions: SceneRevision[];
  reviewSummary: {
    status: SceneReviewStatus;
    unresolvedObjectCount: number;
    warningCount: number;
    lastReviewedAt?: string;
  };
}

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
}
export interface SceneValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
