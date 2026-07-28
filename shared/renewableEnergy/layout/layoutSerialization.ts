import type {
  Annotation,
  DraflioScene,
  ExclusionZone as SceneExclusionZone,
  PvArray,
  DraflioSceneObject,
  SiteBoundary,
} from "../draflioSceneTypes";
import { createDefaultTransform } from "../draflioSceneGeometry";
import { createEmptyDraflioScene } from "../draflioSceneSerialization";
import { validateDraflioScene } from "../draflioSceneValidation";
import {
  LAYOUT_ALGORITHM_VERSION,
  LAYOUT_LIMITS,
  LAYOUT_SCHEMA_NAME,
  LAYOUT_SCHEMA_VERSION,
  type LayoutFinding,
  type LayoutReview,
} from "./layoutTypes";

function deterministic(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deterministic);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, deterministic(child)]),
    );
  return value;
}
export function serializeLayoutReview(review: LayoutReview) {
  return bounded(`${JSON.stringify(deterministic(review), null, 2)}\n`);
}
export function parseLayoutReview(text: string): LayoutReview {
  if (!text || new TextEncoder().encode(text).byteLength > LAYOUT_LIMITS.maxSceneBytes)
    throw new Error("Layout review is empty or excessive.");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Layout review JSON is malformed.");
  }
  if (
    !value ||
    typeof value !== "object" ||
    !("schemaName" in value) ||
    value.schemaName !== LAYOUT_SCHEMA_NAME ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== LAYOUT_SCHEMA_VERSION
  )
    throw new Error("Layout review schema is unsupported.");
  const candidate = value as Partial<LayoutReview>;
  if (
    !Array.isArray(candidate.exclusions) ||
    candidate.exclusions.length > LAYOUT_LIMITS.maxExclusions ||
    !Array.isArray(candidate.arrayAreas) ||
    candidate.arrayAreas.length > LAYOUT_LIMITS.maxArrayAreas ||
    !Array.isArray(candidate.tables) ||
    candidate.tables.length > LAYOUT_LIMITS.maxTables ||
    !Array.isArray(candidate.tableDefinitions) ||
    candidate.tableDefinitions.length > LAYOUT_LIMITS.maxTableTypes
  )
    throw new Error("Layout review arrays are malformed or exceed declared limits.");
  const identifiers = [
    ...candidate.exclusions.map((item) => item.id),
    ...candidate.arrayAreas.map((item) => item.id),
    ...candidate.tables.map((item) => item.id),
  ];
  if (
    identifiers.some((identifier) => typeof identifier !== "string") ||
    new Set(identifiers).size !== identifiers.length
  )
    throw new Error("Layout review contains invalid or conflicting object identifiers.");
  for (const polygon of [
    ...(candidate.siteBoundary ? [candidate.siteBoundary.geometry] : []),
    ...candidate.exclusions.map((item) => item.geometry),
    ...candidate.arrayAreas.map((item) => item.geometry),
    ...candidate.tables.map((item) => item.footprint),
  ]) {
    if (
      !polygon ||
      !Array.isArray(polygon.vertices) ||
      polygon.vertices.length > LAYOUT_LIMITS.maxVerticesPerPolygon ||
      polygon.vertices.some(
        (point) =>
          !Number.isFinite(point?.x) ||
          !Number.isFinite(point?.y) ||
          Math.abs(point.x) > LAYOUT_LIMITS.maxCoordinateMagnitude ||
          Math.abs(point.y) > LAYOUT_LIMITS.maxCoordinateMagnitude,
      )
    )
      throw new Error("Layout review contains malformed or excessive polygon geometry.");
  }
  return structuredClone(candidate) as LayoutReview;
}
export function layoutToDraflioScene(review: LayoutReview): DraflioScene {
  if (!review.registration?.active || !review.siteBoundary)
    throw new Error("Active registration and reviewed boundary are required for scene export.");
  const scene = createEmptyDraflioScene(review.projectName || "Solar layout");
  scene.sceneId = stableUuid(`scene-${serializeLayoutReview(review)}`);
  scene.coordinateSystem = { type: "local", name: "Registered local metric layout" };
  scene.createdAt = "2000-01-01T00:00:00.000Z";
  scene.updatedAt = scene.createdAt;
  const arrays: PvArray[] = review.tables
    .filter(
      (table) =>
        table.reviewStatus === "reviewed" ||
        table.reviewStatus === "approved-for-preliminary-draflio-workflow",
    )
    .map((table) => ({
      id: stableUuid(table.id),
      kind: "pv-array",
      name: table.id,
      visible: true,
      reviewStatus: "approved",
      geometry: {
        type: "polygon",
        outerRing: table.footprint.vertices.map((point) => ({ x: point.x, y: point.y, z: 0 })),
        holes: [],
      },
      transform: createDefaultTransform(),
      sourceReferences: [],
      warnings: table.findings
        .filter((finding) => finding.status !== "pass")
        .slice(0, 100)
        .map((finding) => ({
          code: finding.code,
          severity: finding.status === "fail" ? "error" : "warning",
          message: finding.explanation,
        })),
      metadata: {
        layoutSchema: LAYOUT_SCHEMA_VERSION,
        layoutTableId: table.id,
        algorithmVersion: LAYOUT_ALGORITHM_VERSION,
        moduleRecordId: table.moduleRecordId,
        dcPowerWatts: table.dcPowerWatts,
        registrationScale: review.registration?.scale ?? 1,
        registrationRotationDegrees: review.registration?.rotationDegrees ?? 0,
        declaredLimitations: review.limitations.join("; ").slice(0, 1_000),
      },
      createdAt: scene.createdAt,
      updatedAt: scene.updatedAt,
      mountingType: "fixed-tilt",
      tiltDegrees: table.tiltDegrees,
      azimuthDegrees: table.azimuthDegrees,
      tableCount: 1,
      moduleCount: table.moduleCount,
      moduleComponentId: table.moduleRecordId,
      stringingStatus: "undefined",
    }));
  const boundary: SiteBoundary = {
    id: stableUuid(`boundary-${review.siteBoundary.id}`),
    kind: "site-boundary",
    name: review.siteBoundary.name,
    visible: true,
    reviewStatus: "approved",
    geometry: {
      type: "polygon",
      outerRing: review.siteBoundary.geometry.vertices.map((point) => ({
        ...point,
        z: 0,
      })),
      holes: [],
    },
    transform: createDefaultTransform(),
    sourceReferences: [],
    warnings: review.siteBoundary.warnings.map((message) => ({
      code: "LAYOUT_BOUNDARY_WARNING",
      severity: "warning",
      message,
    })),
    metadata: {
      source: review.siteBoundary.source,
      sourceReference: review.siteBoundary.sourceReference,
      registrationAlgorithm: review.registration.algorithmVersion,
      transformDirection: review.registration.transformDirection,
    },
    createdAt: scene.createdAt,
    updatedAt: scene.updatedAt,
    boundaryPurpose: "analysis",
  };
  const exclusionObjects: SceneExclusionZone[] = review.exclusions.map((zone) => ({
    id: stableUuid(`exclusion-${zone.id}`),
    kind: "exclusion-zone",
    name: zone.name,
    visible: true,
    reviewStatus: "approved",
    geometry: {
      type: "polygon",
      outerRing: zone.effectiveGeometry.vertices.map((point) => ({ ...point, z: 0 })),
      holes: [],
    },
    transform: createDefaultTransform(),
    sourceReferences: [],
    warnings: zone.warnings.map((message) => ({
      code: "LAYOUT_EXCLUSION_WARNING",
      severity: "warning",
      message,
    })),
    metadata: {
      source: zone.source,
      sourceReference: zone.sourceReference,
      category: zone.category,
      reason: zone.reason,
      setbackMeters: zone.setbackMeters ?? null,
    },
    createdAt: scene.createdAt,
    updatedAt: scene.updatedAt,
    exclusionReason: "user-defined",
  }));
  const areaObjects: Annotation[] = review.arrayAreas.map((area) => ({
    id: stableUuid(`array-area-${area.id}`),
    kind: "annotation",
    name: area.name,
    visible: true,
    reviewStatus: "approved",
    geometry: {
      type: "polyline",
      points: area.geometry.vertices.map((point) => ({ ...point, z: 0 })),
      closed: true,
    },
    transform: createDefaultTransform(),
    sourceReferences: [],
    warnings: area.warnings.map((message) => ({
      code: "LAYOUT_ARRAY_AREA_WARNING",
      severity: "warning",
      message,
    })),
    metadata: {
      layoutRole: "array-area",
      source: area.source,
      sourceReference: area.sourceReference,
      boundarySetbackMeters: area.boundarySetbackMeters,
      setbackAlgorithmVersion: area.setbackAlgorithmVersion,
    },
    createdAt: scene.createdAt,
    updatedAt: scene.updatedAt,
    text: `Reviewed array area ${area.id}`,
    annotationType: "review-comment",
  }));
  const objects: DraflioSceneObject[] = [boundary, ...exclusionObjects, ...areaObjects, ...arrays];
  scene.objects = objects;
  scene.reviewSummary = {
    status: "in-review",
    unresolvedObjectCount: review.tables.filter((table) => table.reviewStatus !== "reviewed")
      .length,
    warningCount: objects.reduce((sum, object) => sum + object.warnings.length, 0),
  };
  const validation = validateDraflioScene(scene);
  if (!validation.valid)
    throw new Error(`Layout DraflioScene export is invalid: ${validation.errors[0]?.message}`);
  return scene;
}
export function findingsCsv(findings: readonly LayoutFinding[]) {
  return `code,status,affected_object,explanation,unit,limit,calculated_value,margin,rule_version\n${findings
    .map((finding) =>
      [
        finding.code,
        finding.status,
        finding.affectedObjectId,
        finding.explanation,
        finding.unit ?? "",
        finding.limit ?? "",
        finding.calculatedValue ?? "",
        finding.margin ?? "",
        finding.ruleVersion,
      ]
        .map(csv)
        .join(","),
    )
    .join("\n")}\n`;
}
export function tableScheduleCsv(review: LayoutReview) {
  return `table_id,array_area,table_type,module_record,module_count,dc_power_w,status,azimuth_deg,tilt_deg,center_x_m,center_y_m\n${review.tables
    .map((table) =>
      [
        table.id,
        table.arrayAreaId,
        table.tableTypeId,
        table.moduleRecordId,
        table.moduleCount,
        table.dcPowerWatts,
        table.reviewStatus,
        table.azimuthDegrees,
        table.tiltDegrees,
        table.center.x,
        table.center.y,
      ]
        .map(csv)
        .join(","),
    )
    .join("\n")}\n`;
}
function csv(value: unknown) {
  const text = String(value).replace(/"/g, '""');
  return `"${text}"`;
}
function bounded(text: string) {
  if (new TextEncoder().encode(text).byteLength > LAYOUT_LIMITS.maxExportBytes)
    throw new Error("Layout export exceeds the 20 MB limit.");
  return text;
}
function hash(text: string) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0).toString(16).padStart(8, "0");
}
function stableUuid(text: string) {
  const first = hash(text);
  const second = hash(`${text}\u001fsecondary`);
  return `${first}-${second.slice(0, 4)}-4${second.slice(4, 7)}-8${first.slice(1, 4)}-${second}${first.slice(0, 4)}`;
}
