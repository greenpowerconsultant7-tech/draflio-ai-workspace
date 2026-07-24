import {
  DRAFLIO_SCENE_SCHEMA_VERSION,
  SCENE_LIMITS,
  type DraflioScene,
  type SceneValidationResult,
  type ValidationIssue,
} from "./draflioSceneTypes";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const forbiddenKeys = new Set(["__proto__", "prototype", "constructor"]);
const kinds = new Set([
  "terrain-surface",
  "site-boundary",
  "exclusion-zone",
  "road",
  "building",
  "obstruction",
  "pv-array",
  "electrical-equipment",
  "cable-route",
  "annotation",
]);
const reviewStatuses = new Set(["unreviewed", "needs-review", "approved", "rejected"]);
const extractionMethods = new Set([
  "vector",
  "ocr",
  "computer-vision",
  "component-library",
  "manual",
  "imported",
  "unknown",
]);
const plain = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
const hasUnsafeControlCharacter = (value: string) =>
  [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 && code !== 9 && code !== 10 && code !== 13;
  });
const text = (value: unknown, max: number = SCENE_LIMITS.maxTextLength) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= max &&
  !hasUnsafeControlCharacter(value);

export function validateDraflioScene(value: unknown): SceneValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const issue = (code: string, path: string, message: string, warning = false) => {
    const target = warning ? warnings : errors;
    if (errors.length + warnings.length < SCENE_LIMITS.maxIssues)
      target.push({ code, path, message });
  };
  const vector = (v: unknown, path: string) => {
    if (
      !plain(v) ||
      !["x", "y", "z"].every(
        (key) => finite(v[key]) && Math.abs(v[key]) <= SCENE_LIMITS.maxCoordinateMagnitude,
      )
    )
      issue(
        "INVALID_COORDINATE",
        path,
        "Coordinate components must be finite and within the supported range.",
      );
  };
  const reference = (ref: unknown, path: string, sourceIds: Set<string>) => {
    if (!plain(ref))
      return issue("INVALID_SOURCE_DOCUMENT", path, "Source reference must be a plain object.");
    if (typeof ref.sourceDocumentId !== "string" || !sourceIds.has(ref.sourceDocumentId))
      issue(
        "UNKNOWN_SOURCE_REFERENCE",
        `${path}.sourceDocumentId`,
        "Referenced source document does not exist.",
      );
    if (!extractionMethods.has(String(ref.extractionMethod)))
      issue(
        "INVALID_EXTRACTION_METADATA",
        `${path}.extractionMethod`,
        "Extraction method is not supported.",
      );
    if (
      ref.pageNumber !== undefined &&
      (!Number.isInteger(ref.pageNumber) || Number(ref.pageNumber) < 1)
    )
      issue(
        "INVALID_PAGE_REFERENCE",
        `${path}.pageNumber`,
        "Page number must be a positive one-based integer.",
      );
    if (
      ref.extractionScore !== undefined &&
      (!finite(ref.extractionScore) || ref.extractionScore < 0 || ref.extractionScore > 1)
    )
      issue(
        "INVALID_EXTRACTION_METADATA",
        `${path}.extractionScore`,
        "Heuristic extraction score must be between zero and one.",
      );
    if (ref.note !== undefined && !text(ref.note))
      issue("INVALID_EXTRACTION_METADATA", `${path}.note`, "Source note is invalid or too long.");
    if (ref.sourceBounds !== undefined) {
      const b = ref.sourceBounds;
      if (
        !plain(b) ||
        !finite(b.x) ||
        !finite(b.y) ||
        !finite(b.width) ||
        !finite(b.height) ||
        b.width < 0 ||
        b.height < 0
      )
        issue(
          "INVALID_PAGE_REFERENCE",
          `${path}.sourceBounds`,
          "Source bounds must contain finite, non-negative dimensions.",
        );
    }
  };
  const geometry = (g: unknown, path: string) => {
    if (!plain(g) || typeof g.type !== "string")
      return issue("INVALID_GEOMETRY", path, "Geometry must be a supported plain object.");
    if (g.type === "point") vector(g.position, `${path}.position`);
    else if (g.type === "polyline") {
      if (
        !Array.isArray(g.points) ||
        g.points.length < 2 ||
        g.points.length > SCENE_LIMITS.maxVerticesPerGeometry
      )
        issue(
          "INVALID_GEOMETRY",
          `${path}.points`,
          "Polyline requires a bounded list of at least two points.",
        );
      else g.points.forEach((p, i) => vector(p, `${path}.points[${i}]`));
      if (typeof g.closed !== "boolean")
        issue("INVALID_GEOMETRY", `${path}.closed`, "Polyline closed flag must be boolean.");
    } else if (g.type === "polygon") {
      if (
        !Array.isArray(g.outerRing) ||
        g.outerRing.length < 3 ||
        g.outerRing.length > SCENE_LIMITS.maxVerticesPerGeometry
      )
        issue(
          "INVALID_POLYGON",
          `${path}.outerRing`,
          "Polygon outer ring requires a bounded list of at least three points.",
        );
      else g.outerRing.forEach((p, i) => vector(p, `${path}.outerRing[${i}]`));
      if (!Array.isArray(g.holes))
        issue("INVALID_POLYGON", `${path}.holes`, "Polygon holes must be an array.");
      else
        g.holes.forEach((ring, i) => {
          if (!Array.isArray(ring) || ring.length < 3)
            issue(
              "INVALID_POLYGON",
              `${path}.holes[${i}]`,
              "Polygon hole requires at least three points.",
            );
          else ring.forEach((p, j) => vector(p, `${path}.holes[${i}][${j}]`));
        });
    } else if (g.type === "mesh") {
      if (!Array.isArray(g.vertices) || g.vertices.length > SCENE_LIMITS.maxVerticesPerGeometry)
        issue("INVALID_MESH", `${path}.vertices`, "Mesh vertices exceed the supported limit.");
      else g.vertices.forEach((p, i) => vector(p, `${path}.vertices[${i}]`));
      if (!Array.isArray(g.triangles) || g.triangles.length > SCENE_LIMITS.maxTrianglesPerMesh)
        issue("INVALID_MESH", `${path}.triangles`, "Mesh triangles exceed the supported limit.");
      else
        g.triangles.forEach((face, i) => {
          const count = Array.isArray(g.vertices) ? g.vertices.length : 0;
          if (
            !Array.isArray(face) ||
            face.length !== 3 ||
            face.some((n) => !Number.isInteger(n) || n < 0 || n >= count) ||
            new Set(face).size !== 3
          )
            issue(
              "INVALID_MESH",
              `${path}.triangles[${i}]`,
              "Triangle must contain three distinct valid vertex indices.",
            );
        });
    } else if (g.type === "box") dimensions(g, path);
    else if (g.type === "oriented-box") {
      vector(g.center, `${path}.center`);
      dimensions(g.dimensions, `${path}.dimensions`);
      vector(g.rotationDegrees, `${path}.rotationDegrees`);
    } else issue("INVALID_GEOMETRY", `${path}.type`, "Geometry type is not supported.");
  };
  const dimensions = (d: unknown, path: string) => {
    if (!plain(d) || !["width", "depth", "height"].every((key) => finite(d[key]) && d[key] >= 0))
      issue("INVALID_GEOMETRY", path, "Dimensions must be finite and non-negative.");
  };

  if (!plain(value)) {
    issue("INVALID_OBJECT", "$", "Scene must be a plain JSON object.");
    return { valid: false, errors, warnings };
  }
  if (value.schemaVersion !== DRAFLIO_SCENE_SCHEMA_VERSION)
    issue("INVALID_SCHEMA_VERSION", "$.schemaVersion", "Schema version is not supported.");
  if (typeof value.sceneId !== "string" || !UUID.test(value.sceneId))
    issue("INVALID_SCENE_ID", "$.sceneId", "Scene ID must be a UUID.");
  if (!text(value.name, SCENE_LIMITS.maxSceneNameLength))
    issue("INVALID_SCENE_NAME", "$.name", "Scene name is required and exceeds no supported limit.");
  if (value.sector !== "solar") issue("INVALID_OBJECT", "$.sector", "Scene sector must be solar.");
  if (!date(value.createdAt))
    issue("INVALID_DATE", "$.createdAt", "Created date must be a valid ISO-compatible date.");
  if (!date(value.updatedAt))
    issue("INVALID_DATE", "$.updatedAt", "Updated date must be a valid ISO-compatible date.");
  if (
    !plain(value.units) ||
    value.units.length !== "m" ||
    value.units.area !== "m2" ||
    value.units.angle !== "deg" ||
    value.units.elevation !== "m"
  )
    issue("INVALID_UNITS", "$.units", "Scene units must use the canonical metric unit set.");
  if (
    !plain(value.coordinateSystem) ||
    !["local", "projected", "geographic"].includes(String(value.coordinateSystem.type))
  )
    issue("INVALID_COORDINATE_SYSTEM", "$.coordinateSystem", "Coordinate system type is invalid.");
  else {
    if (
      value.coordinateSystem.type === "projected" &&
      (!Number.isInteger(value.coordinateSystem.epsgCode) ||
        Number(value.coordinateSystem.epsgCode) <= 0)
    )
      issue(
        "INVALID_COORDINATE_SYSTEM",
        "$.coordinateSystem.epsgCode",
        "Projected coordinates require a positive EPSG code.",
      );
    if (value.coordinateSystem.origin !== undefined)
      vector(value.coordinateSystem.origin, "$.coordinateSystem.origin");
    if (value.coordinateSystem.type === "geographic")
      issue(
        "GEOGRAPHIC_COORDINATES_REQUIRE_PROJECTION",
        "$.coordinateSystem",
        "Geographic coordinates require projection before metric geometry operations.",
        true,
      );
  }
  if (value.bounds === undefined)
    issue("MISSING_BOUNDS", "$.bounds", "Scene bounds have not been supplied.", true);
  else if (!plain(value.bounds))
    issue("INVALID_BOUNDS", "$.bounds", "Scene bounds must be a plain object.");
  else {
    const bounds = value.bounds;
    vector(bounds.minimum, "$.bounds.minimum");
    vector(bounds.maximum, "$.bounds.maximum");
    const minimum = bounds.minimum;
    const maximum = bounds.maximum;
    if (
      plain(minimum) &&
      plain(maximum) &&
      ["x", "y", "z"].some(
        (k) => finite(minimum[k]) && finite(maximum[k]) && minimum[k] > maximum[k],
      )
    )
      issue("INVALID_BOUNDS", "$.bounds", "Minimum bounds must not exceed maximum bounds.");
  }
  const sourceIds = new Set<string>();
  if (
    !Array.isArray(value.sourceDocuments) ||
    value.sourceDocuments.length > SCENE_LIMITS.maxSourceDocuments
  )
    issue("SCENE_LIMIT_EXCEEDED", "$.sourceDocuments", "Source-document limit exceeded.");
  else
    value.sourceDocuments.forEach((source, i) => {
      const path = `$.sourceDocuments[${i}]`;
      if (!plain(source))
        return issue("INVALID_SOURCE_DOCUMENT", path, "Source document must be a plain object.");
      if (typeof source.id !== "string" || !UUID.test(source.id))
        issue("INVALID_SOURCE_DOCUMENT", `${path}.id`, "Source-document ID must be a UUID.");
      else if (sourceIds.has(source.id))
        issue("DUPLICATE_SOURCE_DOCUMENT_ID", `${path}.id`, "Source-document ID is duplicated.");
      else sourceIds.add(source.id);
      if (
        !text(source.displayName, SCENE_LIMITS.maxSceneNameLength) ||
        /(?:[a-z]:\\|\/home\/|blob:|data:)/i.test(String(source.displayName))
      )
        issue("INVALID_SOURCE_DOCUMENT", `${path}.displayName`, "Source display name is invalid.");
      if (!text(source.mediaType, 100) || !String(source.mediaType).includes("/"))
        issue("INVALID_SOURCE_DOCUMENT", `${path}.mediaType`, "Media type is invalid.");
      if (
        source.sha256 !== undefined &&
        (typeof source.sha256 !== "string" || !SHA256.test(source.sha256))
      )
        issue(
          "INVALID_SOURCE_DOCUMENT",
          `${path}.sha256`,
          "SHA-256 value must contain 64 hexadecimal characters.",
        );
      if (
        source.pageCount !== undefined &&
        (!Number.isInteger(source.pageCount) ||
          Number(source.pageCount) < 1 ||
          Number(source.pageCount) > SCENE_LIMITS.maxPageCount)
      )
        issue(
          "INVALID_SOURCE_DOCUMENT",
          `${path}.pageCount`,
          "Page count must be a bounded positive integer.",
        );
      if (!date(source.importedAt))
        issue("INVALID_DATE", `${path}.importedAt`, "Import date is invalid.");
      if (source.sha256 === undefined)
        issue(
          "SOURCE_WITHOUT_HASH",
          `${path}.sha256`,
          "Source document has no content hash.",
          true,
        );
    });
  const objectIds = new Set<string>();
  if (!Array.isArray(value.objects) || value.objects.length > SCENE_LIMITS.maxObjects)
    issue("SCENE_LIMIT_EXCEEDED", "$.objects", "Scene object limit exceeded.");
  else
    value.objects.forEach((object, i) => {
      const path = `$.objects[${i}]`;
      if (!plain(object))
        return issue("INVALID_OBJECT", path, "Scene object must be a plain object.");
      if (typeof object.id !== "string" || !UUID.test(object.id))
        issue("INVALID_OBJECT", `${path}.id`, "Object ID must be a UUID.");
      else if (objectIds.has(object.id))
        issue("DUPLICATE_OBJECT_ID", `${path}.id`, "Object ID is duplicated.");
      else objectIds.add(object.id);
      if (!kinds.has(String(object.kind)))
        issue("INVALID_OBJECT", `${path}.kind`, "Object kind is not supported.");
      if (!text(object.name, SCENE_LIMITS.maxSceneNameLength))
        issue("INVALID_OBJECT", `${path}.name`, "Object name is invalid.");
      if (typeof object.visible !== "boolean")
        issue("INVALID_OBJECT", `${path}.visible`, "Object visibility must be boolean.");
      if (!reviewStatuses.has(String(object.reviewStatus)))
        issue("INVALID_REVIEW_STATUS", `${path}.reviewStatus`, "Object review status is invalid.");
      if (!date(object.createdAt) || !date(object.updatedAt))
        issue("INVALID_DATE", path, "Object dates are invalid.");
      geometry(object.geometry, `${path}.geometry`);
      if (!plain(object.transform))
        issue("INVALID_OBJECT", `${path}.transform`, "Transform must be a plain object.");
      else {
        const transform = object.transform;
        vector(transform.translation, `${path}.transform.translation`);
        vector(transform.rotationDegrees, `${path}.transform.rotationDegrees`);
        vector(transform.scale, `${path}.transform.scale`);
        const scale = transform.scale;
        if (plain(scale) && ["x", "y", "z"].some((k) => !finite(scale[k]) || scale[k] <= 0))
          issue("INVALID_OBJECT", `${path}.transform.scale`, "Scale components must be positive.");
      }
      if (
        !Array.isArray(object.sourceReferences) ||
        object.sourceReferences.length > SCENE_LIMITS.maxSourceReferencesPerObject
      )
        issue(
          "SCENE_LIMIT_EXCEEDED",
          `${path}.sourceReferences`,
          "Source-reference limit exceeded.",
        );
      else {
        object.sourceReferences.forEach((ref, j) =>
          reference(ref, `${path}.sourceReferences[${j}]`, sourceIds),
        );
        if (object.sourceReferences.length === 0)
          issue(
            "OBJECT_WITHOUT_SOURCE_REFERENCE",
            `${path}.sourceReferences`,
            "Object has no source reference.",
            true,
          );
      }
      if (
        !Array.isArray(object.warnings) ||
        object.warnings.length > SCENE_LIMITS.maxWarningsPerObject
      )
        issue("SCENE_LIMIT_EXCEEDED", `${path}.warnings`, "Object-warning limit exceeded.");
      if (
        !plain(object.metadata) ||
        Object.keys(object.metadata).length > SCENE_LIMITS.maxMetadataKeys
      )
        issue("INVALID_OBJECT", `${path}.metadata`, "Metadata must be a bounded plain object.");
      else
        Object.entries(object.metadata).forEach(([key, item]) => {
          if (
            forbiddenKeys.has(key) ||
            key.length > SCENE_LIMITS.maxMetadataKeyLength ||
            (typeof item === "string" && item.length > SCENE_LIMITS.maxMetadataStringLength) ||
            (typeof item === "number" && !finite(item)) ||
            (item !== null && !["string", "number", "boolean"].includes(typeof item))
          )
            issue(
              "INVALID_OBJECT",
              `${path}.metadata`,
              "Metadata contains an unsupported key or value.",
            );
        });
      validateObjectSpecific(object, path, issue);
    });
  if (Array.isArray(value.objects) && value.objects.length === 0)
    issue("EMPTY_SCENE", "$.objects", "Scene contains no engineering objects.", true);
  const revisionIds = new Set<string>(),
    revisionNumbers = new Set<number>();
  if (!Array.isArray(value.revisions) || value.revisions.length > SCENE_LIMITS.maxRevisions)
    issue("SCENE_LIMIT_EXCEEDED", "$.revisions", "Revision limit exceeded.");
  else
    value.revisions.forEach((revision, i) => {
      const path = `$.revisions[${i}]`;
      if (
        !plain(revision) ||
        typeof revision.id !== "string" ||
        !UUID.test(revision.id) ||
        !Number.isInteger(revision.revisionNumber) ||
        Number(revision.revisionNumber) < 1 ||
        !text(revision.label) ||
        !date(revision.createdAt) ||
        !Array.isArray(revision.sourceDocumentIds)
      )
        return issue("INVALID_REVISION", path, "Revision record is invalid.");
      if (revisionIds.has(revision.id) || revisionNumbers.has(Number(revision.revisionNumber)))
        issue("INVALID_REVISION", path, "Revision ID or number is duplicated.");
      revisionIds.add(revision.id);
      revisionNumbers.add(Number(revision.revisionNumber));
      if (revision.sourceDocumentIds.some((id) => typeof id !== "string" || !sourceIds.has(id)))
        issue(
          "UNKNOWN_SOURCE_REFERENCE",
          `${path}.sourceDocumentIds`,
          "Revision references an unknown source document.",
        );
      if (revision.summary !== undefined && !text(revision.summary))
        issue("INVALID_REVISION", `${path}.summary`, "Revision summary is invalid.");
    });
  if (
    !plain(value.reviewSummary) ||
    !["unreviewed", "in-review", "approved", "rejected"].includes(
      String(value.reviewSummary.status),
    ) ||
    !Number.isInteger(value.reviewSummary.unresolvedObjectCount) ||
    Number(value.reviewSummary.unresolvedObjectCount) < 0 ||
    !Number.isInteger(value.reviewSummary.warningCount) ||
    Number(value.reviewSummary.warningCount) < 0 ||
    (value.reviewSummary.lastReviewedAt !== undefined && !date(value.reviewSummary.lastReviewedAt))
  )
    issue("INVALID_REVIEW_STATUS", "$.reviewSummary", "Scene review summary is invalid.");
  return { valid: errors.length === 0, errors, warnings };
}

function validateObjectSpecific(
  object: Record<string, unknown>,
  path: string,
  issue: (code: string, path: string, message: string) => void,
) {
  const geometryType = (object.geometry as Record<string, unknown> | undefined)?.type;
  const allowed: Record<string, string[]> = {
    "terrain-surface": ["mesh"],
    "site-boundary": ["polygon"],
    "exclusion-zone": ["polygon"],
    road: ["polyline", "polygon"],
    building: ["polygon", "box", "oriented-box"],
    obstruction: ["point", "polygon", "box", "oriented-box"],
    "pv-array": ["polygon", "box", "oriented-box"],
    "electrical-equipment": ["point", "polygon", "box", "oriented-box"],
    "cable-route": ["polyline"],
    annotation: ["point", "polyline", "polygon"],
  };
  if (
    typeof object.kind === "string" &&
    allowed[object.kind] &&
    !allowed[object.kind]?.includes(String(geometryType))
  )
    issue(
      "INVALID_GEOMETRY",
      `${path}.geometry`,
      "Geometry type is not supported for this object kind.",
    );
  const nonnegative = [
    "nominalWidthMeters",
    "heightMeters",
    "tiltDegrees",
    "azimuthDegrees",
    "tableCount",
    "moduleCount",
    "conductorCount",
  ];
  for (const key of nonnegative)
    if (
      object[key] !== undefined &&
      (!finite(object[key]) ||
        object[key] < 0 ||
        (["tableCount", "moduleCount", "conductorCount"].includes(key) &&
          !Number.isInteger(object[key])))
    )
      issue("INVALID_OBJECT", `${path}.${key}`, "Object-specific numeric value is invalid.");
  if (object.kind === "annotation" && !text(object.text, SCENE_LIMITS.maxAnnotationLength))
    issue("INVALID_OBJECT", `${path}.text`, "Annotation text is invalid or too long.");
}

export function isDraflioScene(value: unknown): value is DraflioScene {
  return validateDraflioScene(value).valid;
}
