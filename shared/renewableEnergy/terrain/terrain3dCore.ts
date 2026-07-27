import type { TerrainAnalysis, TerrainParseResult } from "./terrainTypes";

export const TERRAIN_3D_LIMITS = {
  maxVertices: 250_000,
  maxTriangles: 500_000,
  maxDisplayTriangles: 200_000,
  maxSourcePoints: 5_000,
  maxContourSegments: 25_000,
  maxDevicePixelRatio: 2,
  minExaggeration: 0.25,
  maxExaggeration: 10,
} as const;

export type Terrain3DLayer = "elevation" | "slope" | "aspect" | "buildability";
export interface TerrainDisplayGeometry {
  positions: Float32Array;
  indices: Uint32Array;
  sourceVertexIndices: Uint32Array;
  triangleStep: number;
  bounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };
}
export type Terrain3DValidation = { valid: true } | { valid: false; code: string; message: string };

export function validateTerrainFor3D(
  analysis: TerrainAnalysis,
  parsed: TerrainParseResult,
  coordinateType: "local" | "projected" | "geographic",
): Terrain3DValidation {
  const { vertices, triangles } = analysis.mesh;
  if (vertices.length === 0 || triangles.length === 0)
    return {
      valid: false,
      code: "EMPTY_TERRAIN",
      message: "Terrain mesh has no renderable faces.",
    };
  if (vertices.length > TERRAIN_3D_LIMITS.maxVertices)
    return {
      valid: false,
      code: "VERTEX_LIMIT",
      message: "Terrain mesh exceeds the 3D vertex limit.",
    };
  if (triangles.length > TERRAIN_3D_LIMITS.maxTriangles)
    return {
      valid: false,
      code: "TRIANGLE_LIMIT",
      message: "Terrain mesh exceeds the 3D triangle limit.",
    };
  if (!["local", "projected"].includes(coordinateType))
    return {
      valid: false,
      code: "UNSUPPORTED_COORDINATES",
      message: "Three-dimensional metric terrain review requires local or projected coordinates.",
    };
  if (!parsed.originalBounds || !parsed.localOrigin)
    return {
      valid: false,
      code: "MISSING_COORDINATES",
      message: "Terrain coordinate metadata is missing.",
    };
  const bounds = parsed.originalBounds;
  if (
    ![bounds.minX, bounds.minY, bounds.minZ, bounds.maxX, bounds.maxY, bounds.maxZ].every(
      Number.isFinite,
    ) ||
    bounds.minX > bounds.maxX ||
    bounds.minY > bounds.maxY ||
    bounds.minZ > bounds.maxZ
  )
    return { valid: false, code: "INVALID_BOUNDS", message: "Terrain bounds are invalid." };
  for (const vertex of vertices)
    if (![vertex.x, vertex.y, vertex.z].every(Number.isFinite))
      return {
        valid: false,
        code: "INVALID_VERTEX",
        message: "Terrain mesh contains a non-finite vertex.",
      };
  for (const triangle of triangles)
    if (
      triangle.length !== 3 ||
      new Set(triangle).size !== 3 ||
      triangle.some((index) => !Number.isInteger(index) || index < 0 || index >= vertices.length)
    )
      return {
        valid: false,
        code: "INVALID_TRIANGLE",
        message: "Terrain mesh contains an invalid triangle index.",
      };
  return { valid: true };
}

export function createTerrainDisplayGeometry(
  analysis: TerrainAnalysis,
  parsed: TerrainParseResult,
  coordinateType: "local" | "projected" | "geographic" = "local",
): TerrainDisplayGeometry {
  const validation = validateTerrainFor3D(analysis, parsed, coordinateType);
  if (!validation.valid) throw new Error(validation.message);
  const vertices = analysis.mesh.vertices;
  const triangleStep = Math.max(
    1,
    Math.ceil(analysis.mesh.triangles.length / TERRAIN_3D_LIMITS.maxDisplayTriangles),
  );
  const selectedTriangles = analysis.mesh.triangles.filter(
    (_, index) => index % triangleStep === 0,
  );
  const used = [...new Set(selectedTriangles.flat())].sort((a, b) => a - b);
  const remap = new Map(used.map((sourceIndex, displayIndex) => [sourceIndex, displayIndex]));
  const minX = Math.min(...vertices.map((vertex) => vertex.x));
  const maxX = Math.max(...vertices.map((vertex) => vertex.x));
  const minY = Math.min(...vertices.map((vertex) => vertex.y));
  const maxY = Math.max(...vertices.map((vertex) => vertex.y));
  const minZ = Math.min(...vertices.map((vertex) => vertex.z));
  const maxZ = Math.max(...vertices.map((vertex) => vertex.z));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const positions = new Float32Array(used.length * 3);
  used.forEach((sourceIndex, index) => {
    const vertex = vertices[sourceIndex];
    positions[index * 3] = vertex.x - centerX;
    positions[index * 3 + 1] = vertex.z;
    positions[index * 3 + 2] = -(vertex.y - centerY);
  });
  const indices = new Uint32Array(selectedTriangles.length * 3);
  selectedTriangles.forEach((triangle, faceIndex) =>
    triangle.forEach((sourceIndex, corner) => {
      const displayIndex = remap.get(sourceIndex);
      if (displayIndex === undefined) throw new Error("Display geometry remapping failed.");
      indices[faceIndex * 3 + corner] = displayIndex;
    }),
  );
  return {
    positions,
    indices,
    sourceVertexIndices: Uint32Array.from(used),
    triangleStep,
    bounds: { minX, minY, minZ, maxX, maxY, maxZ },
  };
}

export function applyVisualExaggeration(
  sourcePositions: Float32Array,
  exaggeration: number,
): Float32Array {
  if (
    !Number.isFinite(exaggeration) ||
    exaggeration < TERRAIN_3D_LIMITS.minExaggeration ||
    exaggeration > TERRAIN_3D_LIMITS.maxExaggeration
  )
    throw new Error("Visual elevation exaggeration is outside supported bounds.");
  const result = new Float32Array(sourcePositions);
  for (let index = 1; index < result.length; index += 3) result[index] *= exaggeration;
  return result;
}

export function sampleOverlayIndices(total: number, maximum: number): number[] {
  if (!Number.isInteger(total) || total < 0 || !Number.isInteger(maximum) || maximum < 1)
    throw new Error("Overlay sampling limits are invalid.");
  const step = Math.max(1, Math.ceil(total / maximum));
  const result: number[] = [];
  for (let index = 0; index < total; index += step) result.push(index);
  return result;
}
