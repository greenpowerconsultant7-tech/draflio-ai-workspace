import {
  DRAFLIO_SCENE_SCHEMA_VERSION,
  SCENE_LIMITS,
  type DraflioScene,
  type DraflioSceneObject,
  type SceneGeometry,
  type SourceReference,
} from "./draflioSceneTypes";
import { normalizeVector } from "./draflioSceneGeometry";
import { validateDraflioScene } from "./draflioSceneValidation";

export type SceneParseResult =
  | { ok: true; scene: DraflioScene; validation: ReturnType<typeof validateDraflioScene> }
  | {
      ok: false;
      code: "EMPTY_JSON" | "JSON_SIZE_LIMIT_EXCEEDED" | "MALFORMED_JSON" | "INVALID_SCENE";
      validation?: ReturnType<typeof validateDraflioScene>;
    };

export function parseDraflioSceneJson(text: string): SceneParseResult {
  if (text.length === 0) return { ok: false, code: "EMPTY_JSON" };
  if (new TextEncoder().encode(text).byteLength > SCENE_LIMITS.maxJsonBytes)
    return { ok: false, code: "JSON_SIZE_LIMIT_EXCEEDED" };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, code: "MALFORMED_JSON" };
  }
  const validation = validateDraflioScene(value);
  return validation.valid
    ? { ok: true, scene: value as DraflioScene, validation }
    : { ok: false, code: "INVALID_SCENE", validation };
}

const trim = (value: string) => value.replace(/\r\n?/g, "\n").trim();
const normalizeReference = (reference: SourceReference): SourceReference => ({
  ...reference,
  note: reference.note === undefined ? undefined : trim(reference.note),
  sourceBounds: reference.sourceBounds
    ? {
        x: Object.is(reference.sourceBounds.x, -0) ? 0 : reference.sourceBounds.x,
        y: Object.is(reference.sourceBounds.y, -0) ? 0 : reference.sourceBounds.y,
        width: Object.is(reference.sourceBounds.width, -0) ? 0 : reference.sourceBounds.width,
        height: Object.is(reference.sourceBounds.height, -0) ? 0 : reference.sourceBounds.height,
      }
    : undefined,
});
const normalizeGeometry = (geometry: SceneGeometry): SceneGeometry => {
  if (geometry.type === "point")
    return { ...geometry, position: normalizeVector(geometry.position) };
  if (geometry.type === "polyline")
    return { ...geometry, points: geometry.points.map(normalizeVector) };
  if (geometry.type === "polygon")
    return {
      ...geometry,
      outerRing: geometry.outerRing.map(normalizeVector),
      holes: geometry.holes.map((ring) => ring.map(normalizeVector)),
    };
  if (geometry.type === "mesh")
    return {
      ...geometry,
      vertices: geometry.vertices.map(normalizeVector),
      triangles: geometry.triangles.map((triangle) => [...triangle]),
    };
  if (geometry.type === "box")
    return {
      ...geometry,
      width: Object.is(geometry.width, -0) ? 0 : geometry.width,
      depth: Object.is(geometry.depth, -0) ? 0 : geometry.depth,
      height: Object.is(geometry.height, -0) ? 0 : geometry.height,
    };
  return {
    ...geometry,
    center: normalizeVector(geometry.center),
    rotationDegrees: normalizeVector(geometry.rotationDegrees),
    dimensions: { ...geometry.dimensions },
  };
};

export function normalizeDraflioScene(scene: DraflioScene): DraflioScene {
  const normalizeObject = (object: DraflioSceneObject): DraflioSceneObject =>
    ({
      ...object,
      name: trim(object.name),
      geometry: normalizeGeometry(object.geometry),
      transform: {
        translation: normalizeVector(object.transform.translation),
        rotationDegrees: normalizeVector(object.transform.rotationDegrees),
        scale: normalizeVector(object.transform.scale),
      },
      sourceReferences: object.sourceReferences
        .map(normalizeReference)
        .sort((a, b) =>
          `${a.sourceDocumentId}:${a.pageNumber ?? 0}:${a.extractionMethod}`.localeCompare(
            `${b.sourceDocumentId}:${b.pageNumber ?? 0}:${b.extractionMethod}`,
          ),
        ),
      warnings: [...object.warnings]
        .map((warning) => ({ ...warning, message: trim(warning.message) }))
        .sort((a, b) =>
          `${a.severity}:${a.code}:${a.message}`.localeCompare(
            `${b.severity}:${b.code}:${b.message}`,
          ),
        ),
      metadata: Object.fromEntries(
        Object.entries(object.metadata)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => [trim(key), typeof value === "string" ? trim(value) : value]),
      ),
    }) as DraflioSceneObject;
  return {
    ...scene,
    name: trim(scene.name),
    coordinateSystem: {
      ...scene.coordinateSystem,
      name:
        scene.coordinateSystem.name === undefined ? undefined : trim(scene.coordinateSystem.name),
      origin: scene.coordinateSystem.origin
        ? normalizeVector(scene.coordinateSystem.origin)
        : undefined,
    },
    bounds: scene.bounds
      ? {
          minimum: normalizeVector(scene.bounds.minimum),
          maximum: normalizeVector(scene.bounds.maximum),
        }
      : undefined,
    objects: scene.objects.map(normalizeObject),
    sourceDocuments: scene.sourceDocuments.map((source) => ({
      ...source,
      displayName: trim(source.displayName),
    })),
    revisions: scene.revisions.map((revision) => ({
      ...revision,
      label: trim(revision.label),
      summary: revision.summary === undefined ? undefined : trim(revision.summary),
      sourceDocumentIds: [...new Set(revision.sourceDocumentIds)].sort(),
    })),
  };
}

export function serializeDraflioScene(scene: DraflioScene): string {
  const validation = validateDraflioScene(scene);
  if (!validation.valid) throw new Error("Scene must be valid before serialization.");
  return `${JSON.stringify(normalizeDraflioScene(scene), null, 2)}\n`;
}

export function createEmptyDraflioScene(name = "Untitled scene"): DraflioScene {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function")
    throw new Error("Secure UUID generation is unavailable.");
  const now = new Date().toISOString();
  return {
    schemaVersion: DRAFLIO_SCENE_SCHEMA_VERSION,
    sceneId: crypto.randomUUID(),
    name: trim(name).slice(0, SCENE_LIMITS.maxSceneNameLength) || "Untitled scene",
    sector: "solar",
    createdAt: now,
    updatedAt: now,
    units: { length: "m", area: "m2", angle: "deg", elevation: "m" },
    coordinateSystem: { type: "local", origin: { x: 0, y: 0, z: 0 } },
    objects: [],
    sourceDocuments: [],
    revisions: [],
    reviewSummary: { status: "unreviewed", unresolvedObjectCount: 0, warningCount: 0 },
  };
}

export function safeSceneFilename(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "draflio-scene"}.draflio-scene.json`;
}
