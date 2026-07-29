import type { LayoutReview } from "../layout/layoutTypes";
import type { TerrainMesh } from "../terrain/terrainTypes";
import {
  SHADING_LIMITS,
  SHADING_SCHEMA_VERSION,
  type HorizonPoint,
  type Obstruction,
  type ShadingFinding,
  type ShadingReview,
  type TimeRangeRequest,
  type TimeRangeResponse,
} from "./shadingTypes";
import {
  buildTerrainSpatialIndex,
  normalizeHorizon,
  summarizeTimeRange,
  validateObstruction,
  validateProject,
} from "./shadingCore";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function validateLayoutReview(value: unknown): LayoutReview {
  if (
    !record(value) ||
    value.schemaName !== "draflio-layout-review" ||
    value.schemaVersion !== "1.0"
  )
    throw new Error("Unsupported layout-review schema.");
  if (value.coordinateSystem !== "registered-local-metric")
    throw new Error("Layout coordinate system must be registered local metric.");
  if (typeof value.projectName !== "string" || !value.projectName.trim())
    throw new Error("Layout project reference is required.");
  if (!Array.isArray(value.tables) || value.tables.length > SHADING_LIMITS.maxTables)
    throw new Error("Layout table collection is invalid or excessive.");
  const ids = new Set<string>();
  for (const item of value.tables) {
    if (!record(item) || typeof item.id !== "string" || !item.id)
      throw new Error("Table ID is invalid.");
    if (ids.has(item.id)) throw new Error(`Duplicate table ID ${item.id}.`);
    ids.add(item.id);
    if (
      !record(item.footprint) ||
      !Array.isArray(item.footprint.vertices) ||
      item.footprint.vertices.length < 3
    )
      throw new Error(`Table ${item.id} footprint is missing.`);
    for (const point of item.footprint.vertices)
      if (!record(point) || !Number.isFinite(point.x) || !Number.isFinite(point.y))
        throw new Error(`Table ${item.id} contains non-finite geometry.`);
  }
  if (
    !["reviewed", "valid-with-warnings", "approved-for-preliminary-draflio-workflow"].includes(
      String(value.reviewStatus),
    )
  )
    throw new Error("Layout review state is not authoritative for shading.");
  return structuredClone(value) as LayoutReview;
}

export function validateTerrainMesh(value: unknown): TerrainMesh {
  if (!record(value) || !Array.isArray(value.vertices) || !Array.isArray(value.triangles))
    throw new Error("Terrain mesh is malformed.");
  if (
    value.vertices.length > SHADING_LIMITS.maxTerrainVertices ||
    value.triangles.length > SHADING_LIMITS.maxTerrainTriangles
  )
    throw new Error("Terrain mesh exceeds the declared vertex or triangle limit.");
  const mesh = structuredClone(value) as unknown as TerrainMesh;
  buildTerrainSpatialIndex(mesh);
  return mesh;
}

export function validateHorizonProfile(value: unknown): HorizonPoint[] {
  if (!Array.isArray(value)) throw new Error("Horizon profile must be an array.");
  return normalizeHorizon(structuredClone(value) as HorizonPoint[]);
}

export function validateObstructions(value: unknown): Obstruction[] {
  if (!Array.isArray(value) || value.length > SHADING_LIMITS.maxObstructions)
    throw new Error("Obstruction collection is invalid or excessive.");
  const items = structuredClone(value) as Obstruction[];
  const ids = new Set<string>();
  for (const item of items) {
    validateObstruction(item);
    if (ids.has(item.id)) throw new Error(`Duplicate obstruction ID ${item.id}.`);
    ids.add(item.id);
  }
  return items;
}

export function validateTimeRangeRequest(value: unknown): TimeRangeRequest {
  if (!record(value) || value.type !== "analyse" || value.schemaVersion !== SHADING_SCHEMA_VERSION)
    throw new Error("Unsupported worker request.");
  const request = value as unknown as TimeRangeRequest;
  if (!Number.isSafeInteger(request.generation) || request.generation < 0)
    throw new Error("Worker generation is invalid.");
  validateProject(request.inputs.project);
  validateLayoutReview(request.inputs.layout);
  validateHorizonProfile(request.inputs.horizon);
  validateObstructions(request.inputs.obstructions);
  if (
    !Array.isArray(request.selectedTableIds) ||
    request.selectedTableIds.length > SHADING_LIMITS.maxSelectedTables
  )
    throw new Error("Worker table selection is invalid or excessive.");
  if (!Number.isInteger(request.stepMinutes) || request.stepMinutes < 1)
    throw new Error("Worker time step is invalid.");
  return structuredClone(request);
}

export function validateTimeRangeResponse(
  value: unknown,
  context?: {
    generation?: number;
    tableIds?: ReadonlySet<string>;
    obstructionIds?: ReadonlySet<string>;
  },
): TimeRangeResponse {
  if (!record(value) || !Number.isSafeInteger(value.generation))
    throw new Error("Malformed worker response.");
  if (context?.generation !== undefined && value.generation !== context.generation)
    throw new Error("Worker generation does not match the active calculation.");
  if (value.type === "progress") {
    if (
      typeof value.stage !== "string" ||
      !Number.isFinite(value.percent) ||
      Number(value.percent) < 0 ||
      Number(value.percent) > 100
    )
      throw new Error("Malformed worker progress.");
  } else if (value.type === "success") {
    if (!Array.isArray(value.findings) || value.findings.length > SHADING_LIMITS.maxFindings)
      throw new Error("Malformed worker success.");
    const findingIds = new Set<string>();
    for (const finding of value.findings) {
      validateFinding(finding, context);
      if (findingIds.has(finding.id as string)) throw new Error("Duplicate worker finding ID.");
      findingIds.add(finding.id as string);
    }
    if (
      !record(value.summary) ||
      !Number.isSafeInteger(value.summary.requestedTimestamps) ||
      !Number.isSafeInteger(value.summary.evaluatedTimestamps) ||
      Number(value.summary.requestedTimestamps) < Number(value.summary.evaluatedTimestamps) ||
      !Array.isArray(value.summary.tables) ||
      !Array.isArray(value.summary.domainOccurrences)
    )
      throw new Error("Malformed worker time-range summary.");
    const expected = summarizeTimeRange(
      value.findings as ShadingFinding[],
      Number(value.summary.requestedTimestamps),
    );
    for (const key of [
      "evaluatedTimestamps",
      "belowHorizonTimestamps",
      "clearTimestamps",
      "shadedTimestamps",
      "notEvaluatedTimestamps",
      "invalidTimestamps",
    ] as const)
      if (value.summary[key] !== expected[key])
        throw new Error(`Worker summary ${key} does not reconcile with findings.`);
    if (
      JSON.stringify(value.summary.tables) !== JSON.stringify(expected.tables) ||
      JSON.stringify(value.summary.domainOccurrences) !== JSON.stringify(expected.domainOccurrences)
    )
      throw new Error("Worker table or domain summaries do not reconcile with findings.");
  } else if (value.type === "error") {
    if (typeof value.message !== "string" || !value.message)
      throw new Error("Malformed worker error.");
  } else throw new Error("Unknown worker response type.");
  return structuredClone(value) as TimeRangeResponse;
}

export function validateShadingReview(value: unknown): ShadingReview {
  if (
    !record(value) ||
    value.schemaName !== "draflio-shading-review" ||
    value.schemaVersion !== SHADING_SCHEMA_VERSION ||
    typeof value.sourceLayoutReference !== "string" ||
    !record(value.inputs) ||
    !Array.isArray(value.findings)
  )
    throw new Error("Shading review is malformed or unsupported.");
  const review = value as unknown as ShadingReview;
  validateProject(review.inputs.project);
  validateLayoutReview(review.inputs.layout);
  validateHorizonProfile(review.inputs.horizon);
  validateObstructions(review.inputs.obstructions);
  if (review.findings.length > SHADING_LIMITS.maxFindings)
    throw new Error("Shading review finding limit exceeded.");
  const ids = new Set<string>();
  for (const finding of review.findings) {
    validateFinding(finding, {
      tableIds: new Set(review.inputs.layout.tables.map((table) => table.id)),
      obstructionIds: new Set(review.inputs.obstructions.map((item) => item.id)),
    });
    if (ids.has(finding.id)) throw new Error("Duplicate shading-review finding ID.");
    ids.add(finding.id);
  }
  return structuredClone(review);
}

function validateFinding(
  value: unknown,
  context?: {
    tableIds?: ReadonlySet<string>;
    obstructionIds?: ReadonlySet<string>;
  },
) {
  if (!record(value) || typeof value.id !== "string" || !value.id)
    throw new Error("Worker finding identity is invalid.");
  const domains = ["row-to-row", "terrain", "horizon-profile", "obstruction", "combined"];
  const states = [
    "clear",
    "shaded",
    "partially-shaded",
    "fully-shaded",
    "blocked",
    "below-horizon",
    "not-evaluated",
    "invalid",
  ];
  if (!domains.includes(String(value.domain)) || !states.includes(String(value.state)))
    throw new Error("Worker finding domain or state is invalid.");
  if (typeof value.receiverObjectId !== "string" || !value.receiverObjectId)
    throw new Error("Worker finding receiver is invalid.");
  if (context?.tableIds && !context.tableIds.has(value.receiverObjectId))
    throw new Error("Worker finding references an unknown receiver table.");
  if (typeof value.sourceObjectId !== "string" || !value.sourceObjectId)
    throw new Error("Worker finding source is invalid.");
  if (
    value.domain === "obstruction" &&
    context?.obstructionIds &&
    !context.obstructionIds.has(value.sourceObjectId) &&
    value.sourceObjectId !== "obstruction-unavailable"
  )
    throw new Error("Worker finding references an unknown obstruction.");
  if (
    !Number.isSafeInteger(value.sampleCount) ||
    !Number.isSafeInteger(value.shadedCount) ||
    Number(value.sampleCount) < 0 ||
    Number(value.shadedCount) < 0 ||
    Number(value.shadedCount) > Number(value.sampleCount)
  )
    throw new Error("Worker finding sample counts are inconsistent.");
  if (
    value.geometricShadedFraction !== undefined &&
    (!Number.isFinite(value.geometricShadedFraction) ||
      Number(value.geometricShadedFraction) < 0 ||
      Number(value.geometricShadedFraction) > 1)
  )
    throw new Error("Worker finding geometric fraction is invalid.");
  if (
    !Array.isArray(value.warnings) ||
    !value.warnings.every((item) => typeof item === "string") ||
    !Array.isArray(value.limitations) ||
    !value.limitations.every((item) => typeof item === "string")
  )
    throw new Error("Worker finding warnings or limitations are invalid.");
  if (!record(value.sunPosition) || typeof value.timestamp !== "string")
    throw new Error("Worker finding timestamp or solar position is invalid.");
  const instant = new Date(value.timestamp);
  if (!Number.isFinite(instant.getTime()) || value.sunPosition.timestamp !== value.timestamp)
    throw new Error("Worker finding timestamps are inconsistent.");
  for (const field of ["azimuthDegrees", "elevationDegrees", "zenithDegrees"])
    if (!Number.isFinite(value.sunPosition[field]))
      throw new Error("Worker solar position contains non-finite values.");
  if (Array.isArray(value.shadowPolygon)) {
    if (value.shadowPolygon.length > SHADING_LIMITS.max2DVertices)
      throw new Error("Worker shadow geometry limit exceeded.");
    for (const point of value.shadowPolygon)
      if (!record(point) || !Number.isFinite(point.x) || !Number.isFinite(point.y))
        throw new Error("Worker shadow geometry is non-finite.");
  }
  if (value.sampleEvidence !== undefined) {
    if (
      !Array.isArray(value.sampleEvidence) ||
      value.sampleEvidence.length > SHADING_LIMITS.maxSamplesPerTable
    )
      throw new Error("Worker sample evidence is malformed or excessive.");
    for (const sample of value.sampleEvidence) {
      if (
        !record(sample) ||
        typeof sample.tableId !== "string" ||
        sample.tableId !== value.receiverObjectId ||
        typeof sample.sampleId !== "string" ||
        !record(sample.point) ||
        !Number.isFinite(sample.point.x) ||
        !Number.isFinite(sample.point.y) ||
        !domains.includes(String(sample.domain)) ||
        !["clear", "shaded", "unavailable", "invalid"].includes(String(sample.state)) ||
        sample.sampleMethodVersion !== "re7a-table-sampling-1.0"
      )
        throw new Error("Worker sample evidence is invalid.");
      if (
        sample.receiverElevationMeters !== undefined &&
        !Number.isFinite(sample.receiverElevationMeters)
      )
        throw new Error("Worker sample receiver elevation is non-finite.");
      if (
        sample.blockingPoint !== undefined &&
        (!record(sample.blockingPoint) ||
          !Number.isFinite(sample.blockingPoint.x) ||
          !Number.isFinite(sample.blockingPoint.y))
      )
        throw new Error("Worker sample blocking point is invalid.");
    }
  }
  if (
    value.blockingPoint !== undefined &&
    (!record(value.blockingPoint) ||
      !Number.isFinite(value.blockingPoint.x) ||
      !Number.isFinite(value.blockingPoint.y) ||
      (value.blockingPoint.z !== undefined && !Number.isFinite(value.blockingPoint.z)))
  )
    throw new Error("Worker blocking point is non-finite.");
}
