import { validateDraflioScene } from "../draflioSceneValidation";
import { DRAFLIO_SCENE_SCHEMA_VERSION } from "../draflioSceneTypes";
import { validatePolygon } from "../layout/layoutCore";
import {
  LAYOUT_ALGORITHM_VERSION,
  LAYOUT_SCHEMA_VERSION,
  type LayoutReview,
  type Point2,
} from "../layout/layoutTypes";
import {
  SHADING_LIMITS,
  SHADING_RULE_VERSION,
  type DraflioShadingSource,
  type DraflioSourceImportSummary,
  type DrawingObstructionSource,
  type Obstruction,
} from "./shadingTypes";
import { validateLayoutReview, validateTerrainMesh } from "./shadingValidation";

export type DraflioSourceImportReview = {
  state: "confirmation-required";
  summary: DraflioSourceImportSummary;
  source: Readonly<DraflioShadingSource>;
};

export class ShadingImportError extends Error {
  constructor(
    readonly category: string,
    message: string,
  ) {
    super(message);
    this.name = "ShadingImportError";
  }
}

function reject(category: string, message: string): never {
  throw new ShadingImportError(category, message);
}

const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function clone<T>(value: T): T {
  return structuredClone(value);
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 2_000)
    reject("MISSING_OR_MALFORMED_TEXT", `${label} is missing or malformed.`);
  return value;
}

function assertClosedPolygon(
  vertices: readonly Point2[],
  label: string,
  explicitClosureRequired = true,
) {
  if (vertices.length > SHADING_LIMITS.maxImportPolygonVertices)
    reject("POLYGON_VERTEX_LIMIT", `${label} exceeds the declared polygon vertex limit.`);
  const duplicate = vertices
    .slice(1)
    .some((point, index) => point.x === vertices[index].x && point.y === vertices[index].y);
  if (duplicate)
    reject("DUPLICATE_CONSECUTIVE_VERTEX", `${label} contains duplicate consecutive vertices.`);
  const explicitlyClosed =
    vertices.length > 1 &&
    vertices[0].x === vertices[vertices.length - 1].x &&
    vertices[0].y === vertices[vertices.length - 1].y;
  const validationVertices =
    explicitlyClosed || explicitClosureRequired ? [...vertices] : [...vertices, { ...vertices[0] }];
  const issues = validatePolygon({ vertices: validationVertices });
  if (issues.length) reject("INVALID_POLYGON", `${label} is invalid: ${issues.join(" ")}`);
}

function assertLayoutGeometry(layout: LayoutReview) {
  if (
    !layout.registration?.active ||
    !layout.registration.confirmed ||
    layout.registration.transformDirection !== "drawing-to-terrain"
  )
    throw new Error("Source registration is not confirmed.");
  if (!["reviewed", "approved-for-preliminary-draflio-workflow"].includes(layout.reviewStatus))
    throw new Error("Layout source is not authoritative/reviewed.");
  const ids = new Set<string>();
  for (const table of layout.tables) {
    if (ids.has(table.id)) throw new Error(`Duplicate table ID ${table.id}.`);
    ids.add(table.id);
    assertClosedPolygon(table.footprint.vertices, `Table ${table.id}`, false);
    if (
      !Number.isFinite(table.center.x) ||
      !Number.isFinite(table.center.y) ||
      !Number.isFinite(table.azimuthDegrees) ||
      table.azimuthDegrees < 0 ||
      table.azimuthDegrees >= 360 ||
      !Number.isFinite(table.tiltDegrees) ||
      table.tiltDegrees < 0 ||
      table.tiltDegrees > 90 ||
      table.algorithmVersion !== LAYOUT_ALGORITHM_VERSION
    )
      throw new Error(`Table ${table.id} geometry or orientation is invalid.`);
  }
  const engineeringIds = [
    ...(layout.siteBoundary ? [layout.siteBoundary.id] : []),
    ...layout.exclusions.map((item) => item.id),
    ...layout.arrayAreas.map((item) => item.id),
  ];
  if (new Set(engineeringIds).size !== engineeringIds.length)
    reject(
      "DUPLICATE_ENGINEERING_POLYGON_ID",
      "Engineering polygons contain duplicate identifiers.",
    );
  if (layout.siteBoundary)
    assertClosedPolygon(layout.siteBoundary.geometry.vertices, "Site boundary");
  for (const zone of layout.exclusions)
    assertClosedPolygon(zone.effectiveGeometry.vertices, `Exclusion ${zone.id}`);
  for (const area of layout.arrayAreas)
    assertClosedPolygon(area.geometry.vertices, `Array area ${area.id}`);
}

function assertTerrain(source: DraflioShadingSource["terrain"]) {
  if (!source) return;
  if (source.reviewState !== "verified") throw new Error("Terrain review state is not verified.");
  requiredText(source.provenance, "Terrain provenance");
  const mesh = validateTerrainMesh(source.mesh);
  const keys = new Set<string>();
  for (const [index, triangle] of mesh.triangles.entries()) {
    const key = [...triangle].sort((a, b) => a - b).join("|");
    if (keys.has(key)) throw new Error(`Terrain triangle ${index} duplicates another triangle.`);
    keys.add(key);
    const [a, b, c] = triangle.map((vertex) => mesh.vertices[vertex]);
    const twiceArea = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(twiceArea) <= 1e-12) throw new Error(`Terrain triangle ${index} is degenerate.`);
  }
  for (const shape of source.noDataGeometry ?? []) {
    requiredText(shape.id, "No-data geometry ID");
    requiredText(shape.provenance, "No-data provenance");
    requiredText(shape.method, "No-data method");
    requiredText(shape.methodVersion, "No-data method version");
    assertClosedPolygon(shape.vertices, `No-data geometry ${shape.id}`);
  }
}

export function reviewDraflioShadingSource(
  value: unknown,
  expectedProjectReference: string,
): DraflioSourceImportReview {
  if (!object(value)) throw new Error("DraflioScene source must be a JSON object.");
  if (value.sourceType !== "draflio-scene-authoritative-layout" || value.schemaVersion !== "1.0")
    throw new Error("DraflioScene source schema or version is unsupported.");
  if (value.calculationVersion !== SHADING_RULE_VERSION)
    throw new Error("DraflioScene calculation version is incompatible.");
  const projectReference = requiredText(value.projectReference, "Project reference");
  if (projectReference !== expectedProjectReference)
    throw new Error("Cross-project DraflioScene sources are rejected.");
  if (
    value.coordinateSystem !== "registered-local-metric" ||
    value.units !== "metres" ||
    value.registrationState !== "confirmed"
  )
    throw new Error(
      "A confirmed registered local metric coordinate contract in metres is required.",
    );
  if (!["reviewed", "approved"].includes(String(value.sourceReviewState)))
    throw new Error("DraflioScene source review state is unsupported.");
  requiredText(value.provenance, "Source provenance");
  if (!object(value.scene)) throw new Error("DraflioScene record is missing.");
  const sceneValidation = validateDraflioScene(value.scene);
  if (!sceneValidation.valid)
    throw new Error(`DraflioScene is invalid: ${sceneValidation.errors[0]?.message}`);
  const scene = value.scene as unknown as DraflioShadingSource["scene"];
  if (scene.schemaVersion !== DRAFLIO_SCENE_SCHEMA_VERSION)
    throw new Error("DraflioScene version is unsupported.");
  if (
    scene.coordinateSystem.type !== "local" ||
    scene.units.length !== "m" ||
    scene.units.elevation !== "m"
  )
    throw new Error("DraflioScene coordinate system or units are incompatible.");
  const sourceSceneReference = requiredText(value.sourceSceneReference, "Source-scene reference");
  if (sourceSceneReference !== scene.sceneId)
    throw new Error("Source-scene identity does not match the embedded scene.");
  const layout = validateLayoutReview(value.layoutReview);
  if (layout.schemaVersion !== LAYOUT_SCHEMA_VERSION || layout.projectName !== projectReference)
    throw new Error("Layout identity or version is incompatible with this project.");
  assertLayoutGeometry(layout);
  const source = clone(value) as DraflioShadingSource;
  if (typeof source.terrainRequired !== "boolean")
    reject("MISSING_TERRAIN_REQUIREMENT", "Terrain requirement must be explicit.");
  if (source.terrainRequired && !source.terrain)
    reject("MISSING_REQUIRED_TERRAIN", "Verified terrain is required by this source.");
  assertTerrain(source.terrain);
  const objectIds = source.scene.objects.map((item) => item.id);
  if (new Set(objectIds).size !== objectIds.length)
    throw new Error("DraflioScene contains duplicate object identifiers.");
  const sourceDocumentIds = new Set(source.scene.sourceDocuments.map((item) => item.id));
  for (const item of source.scene.objects)
    for (const reference of item.sourceReferences)
      if (!sourceDocumentIds.has(reference.sourceDocumentId))
        throw new Error(`Object ${item.id} references an unknown source document.`);
  const summary: DraflioSourceImportSummary = {
    sourceType: source.sourceType,
    sceneSchema: "DraflioScene",
    sceneVersion: source.scene.schemaVersion,
    calculationVersion: source.calculationVersion,
    sourceSceneReference,
    projectReference,
    coordinateSystem: source.coordinateSystem,
    units: source.units,
    registrationState: source.registrationState,
    sourceReviewState: source.sourceReviewState,
    tableCount: layout.tables.length,
    terrainVertexCount: source.terrain?.mesh.vertices.length ?? 0,
    terrainTriangleCount: source.terrain?.mesh.triangles.length ?? 0,
    siteBoundaryCount: layout.siteBoundary ? 1 : 0,
    exclusionCount: layout.exclusions.length,
    effectiveArrayAreaCount: layout.arrayAreas.length,
    acceptedRecords:
      layout.tables.length +
      (layout.siteBoundary ? 1 : 0) +
      layout.exclusions.length +
      layout.arrayAreas.length +
      (source.terrain ? 1 : 0),
    rejectedRecords: 0,
    warnings: sceneValidation.warnings.map((issue) => issue.message),
    incompatibilities: [],
    geometryLimitStatus: "within-limits",
  };
  return { state: "confirmation-required", summary, source: clone(source) };
}

export function acceptDraflioShadingSource(
  review: DraflioSourceImportReview,
  engineerConfirmed: boolean,
): DraflioShadingSource {
  if (!engineerConfirmed) throw new Error("Explicit engineer confirmation is required.");
  return clone(review.source);
}

export type DrawingObstructionImportReview = {
  state: "confirmation-required";
  summary: {
    sourceType: DrawingObstructionSource["sourceType"];
    schemaVersion: string;
    projectReference: string;
    drawingReference: string;
    coordinateSystem: string;
    units: string;
    registrationState: string;
    sourceReviewState: string;
    obstructionCount: number;
    acceptedCount: number;
    rejectedCount: number;
    warnings: string[];
    incompatibilities: string[];
    pendingReviewCount: number;
  };
  records: readonly Obstruction[];
};

function collisionSafeId(sourceId: string, existing: Set<string>) {
  const base = `drawing-${sourceId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100) || "object"}`;
  let candidate = base;
  let suffix = 1;
  while (existing.has(candidate)) candidate = `${base}-${suffix++}`;
  existing.add(candidate);
  return candidate;
}

export function reviewDrawingObstructionSource(
  value: unknown,
  expectedProjectReference: string,
  existingIds: readonly string[],
  validTerrainReferences: readonly string[] = [],
): DrawingObstructionImportReview {
  if (!object(value)) throw new Error("Drawing obstruction source must be a JSON object.");
  if (value.sourceType !== "drawing-to-scene-obstructions" || value.schemaVersion !== "1.0")
    throw new Error("Drawing-to-Scene obstruction schema or version is unsupported.");
  const projectReference = requiredText(value.projectReference, "Project reference");
  if (projectReference !== expectedProjectReference)
    throw new Error("Cross-project Drawing-to-Scene records are rejected.");
  const drawingReference = requiredText(value.drawingReference, "Drawing reference");
  if (
    value.coordinateSystem !== "registered-local-metric" ||
    value.units !== "metres" ||
    value.registrationState !== "confirmed"
  )
    throw new Error("Confirmed registered local metric coordinates in metres are required.");
  if (value.sourceReviewState !== "reviewed")
    throw new Error("Drawing source geometry must be reviewed.");
  requiredText(value.provenance, "Drawing provenance");
  if (!Array.isArray(value.records) || value.records.length > SHADING_LIMITS.maxObstructions)
    throw new Error("Drawing obstruction records are malformed or excessive.");
  const sourceIds = new Set<string>();
  const allocated = new Set(existingIds);
  const validTerrain = new Set(validTerrainReferences);
  const records = value.records.map((entry, index): Obstruction => {
    if (!object(entry)) throw new Error(`Obstruction ${index} is malformed.`);
    const sourceId = requiredText(entry.id, `Obstruction ${index} ID`);
    if (sourceIds.has(sourceId)) throw new Error(`Duplicate source obstruction ID ${sourceId}.`);
    sourceIds.add(sourceId);
    if (!Number.isInteger(entry.pageReference) || Number(entry.pageReference) < 1)
      throw new Error(`Obstruction ${sourceId} page reference is invalid.`);
    if (typeof entry.sourceObjectReference !== "string" || !entry.sourceObjectReference.trim())
      reject(
        "MISSING_SOURCE_OBJECT_REFERENCE",
        `Obstruction ${sourceId} source-object provenance is missing.`,
      );
    if (!Array.isArray(entry.footprint))
      throw new Error(`Obstruction ${sourceId} footprint is missing.`);
    const footprint = entry.footprint.map((point) => {
      if (!object(point) || !Number.isFinite(point.x) || !Number.isFinite(point.y))
        throw new Error(`Obstruction ${sourceId} contains a non-finite vertex.`);
      return { x: Number(point.x), y: Number(point.y) };
    });
    if (footprint.length > SHADING_LIMITS.maxObstructionVertices)
      throw new Error(`Obstruction ${sourceId} exceeds the vertex limit.`);
    assertClosedPolygon(footprint, `Obstruction ${sourceId}`);
    if (!Number.isFinite(entry.heightMeters) || Number(entry.heightMeters) <= 0)
      throw new Error(`Obstruction ${sourceId} requires an explicit positive height.`);
    if (!Number.isFinite(entry.baseElevationMeters))
      throw new Error(`Obstruction ${sourceId} base elevation is missing or non-finite.`);
    if (!["explicit", "verified-terrain-reference"].includes(String(entry.baseElevationBasis)))
      throw new Error(`Obstruction ${sourceId} base-elevation basis is invalid.`);
    if (
      entry.baseElevationBasis === "verified-terrain-reference" &&
      (typeof entry.terrainReference !== "string" || !validTerrain.has(entry.terrainReference))
    )
      throw new Error(`Obstruction ${sourceId} terrain reference is invalid.`);
    if (!Number.isFinite(entry.uncertaintyMeters) || Number(entry.uncertaintyMeters) < 0)
      throw new Error(`Obstruction ${sourceId} uncertainty is invalid.`);
    if (
      !["building-box", "wall", "equipment-envelope", "tree-envelope", "generic-reviewed"].includes(
        String(entry.classification),
      )
    )
      throw new Error(`Obstruction ${sourceId} classification is invalid.`);
    if (entry.creationMethod !== "reviewed-drawing")
      throw new Error(`Obstruction ${sourceId} creation method is invalid.`);
    const provenance = requiredText(entry.provenance, `Obstruction ${sourceId} provenance`);
    return {
      id: collisionSafeId(sourceId, allocated),
      classification: entry.classification as Obstruction["classification"],
      footprint,
      baseElevationMeters: Number(entry.baseElevationMeters),
      heightMeters: Number(entry.heightMeters),
      source: `Drawing ${drawingReference}, page ${entry.pageReference}`,
      notes: "Imported geometry is pending RE7A engineer review.",
      reviewStatus: "draft",
      uncertaintyMeters: Number(entry.uncertaintyMeters),
      provenance,
      creationMethod: "reviewed-drawing",
      drawingProvenance: {
        schemaVersion: "1.0",
        projectReference,
        drawingReference,
        pageReference: Number(entry.pageReference),
        sourceObjectReference: entry.sourceObjectReference,
        coordinateSystem: "registered-local-metric",
        units: "metres",
        registrationState: "confirmed",
        sourceReviewState: "reviewed",
        baseElevationBasis: entry.baseElevationBasis as "explicit" | "verified-terrain-reference",
        terrainReference:
          typeof entry.terrainReference === "string" ? entry.terrainReference : undefined,
        originalId: sourceId,
      },
      lifecycleHistory: [
        {
          sequence: 1,
          action: "created",
          detail: "Imported from reviewed Drawing-to-Scene geometry; RE7A review required.",
        },
      ],
    };
  });
  return {
    state: "confirmation-required",
    summary: {
      sourceType: "drawing-to-scene-obstructions",
      schemaVersion: "1.0",
      projectReference,
      drawingReference,
      coordinateSystem: "registered-local-metric",
      units: "metres",
      registrationState: "confirmed",
      sourceReviewState: "reviewed",
      obstructionCount: records.length,
      acceptedCount: records.length,
      rejectedCount: 0,
      warnings: ["All imported records remain draft until reviewed inside RE7A."],
      incompatibilities: [],
      pendingReviewCount: records.length,
    },
    records: clone(records),
  };
}

export function acceptDrawingObstructionSource(
  review: DrawingObstructionImportReview,
  engineerConfirmed: boolean,
): Obstruction[] {
  if (!engineerConfirmed) throw new Error("Explicit engineer confirmation is required.");
  return clone(review.records) as Obstruction[];
}
