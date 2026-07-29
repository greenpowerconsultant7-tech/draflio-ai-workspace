import type { LayoutReview, Point2 } from "../layout/layoutTypes";
import type { TerrainMesh } from "../terrain/terrainTypes";
import { SHADING_LIMITS, type Obstruction, type ShadingFinding } from "./shadingTypes";

export type Shading3DSceneData = {
  bounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };
  terrain: TerrainMesh;
  siteBoundary?: Point2[];
  exclusions: Point2[][];
  arrayAreas: Point2[][];
  tables: { id: string; footprint: Point2[]; elevation: number }[];
  obstructions: Obstruction[];
  shadows: { id: string; points: Point2[] }[];
  samples: NonNullable<ShadingFinding["sampleEvidence"]>;
  blockingPoints: { id: string; x: number; y: number; z: number }[];
};

export function prepareShading3DSceneData(
  layout: LayoutReview,
  terrain: TerrainMesh | undefined,
  obstructions: readonly Obstruction[],
  findings: readonly ShadingFinding[],
): Shading3DSceneData {
  if (terrain && terrain.triangles.length > SHADING_LIMITS.max3DTriangles)
    throw new Error(
      `3D terrain exceeds the ${SHADING_LIMITS.max3DTriangles} triangle display limit.`,
    );
  const active = obstructions.filter((item) => item.reviewStatus === "reviewed");
  if (active.length > SHADING_LIMITS.maxObstructions)
    throw new Error("3D obstruction display limit exceeded.");
  const emptyTerrain: TerrainMesh = { vertices: [], triangles: [] };
  const points = [
    ...layout.tables.flatMap((item) =>
      item.footprint.vertices.map((point) => ({ ...point, z: 0 })),
    ),
    ...(layout.siteBoundary?.geometry.vertices.map((point) => ({ ...point, z: 0 })) ?? []),
    ...(terrain?.vertices ?? []),
    ...active.flatMap((item) =>
      item.footprint.map((point) => ({
        ...point,
        z: item.baseElevationMeters + item.heightMeters,
      })),
    ),
  ];
  if (!points.length) throw new Error("3D scene has no authoritative geometry.");
  const bounds = points.reduce(
    (current, point) => ({
      minX: Math.min(current.minX, point.x),
      minY: Math.min(current.minY, point.y),
      minZ: Math.min(current.minZ, point.z),
      maxX: Math.max(current.maxX, point.x),
      maxY: Math.max(current.maxY, point.y),
      maxZ: Math.max(current.maxZ, point.z),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    },
  );
  return {
    bounds,
    terrain: terrain ? structuredClone(terrain) : emptyTerrain,
    siteBoundary: layout.siteBoundary?.geometry.vertices.map((point) => ({ ...point })),
    exclusions: layout.exclusions.map((item) =>
      item.effectiveGeometry.vertices.map((point) => ({ ...point })),
    ),
    arrayAreas: layout.arrayAreas.flatMap((item) =>
      item.effectivePlacementRegions.map((region) =>
        region.vertices.map((point) => ({ ...point })),
      ),
    ),
    tables: layout.tables.map((item) => ({
      id: item.id,
      footprint: item.footprint.vertices.map((point) => ({ ...point })),
      elevation:
        item.terrainSamples
          .map((sample) => sample.elevation)
          .filter((value): value is number => Number.isFinite(value))
          .reduce((sum, value, _, values) => sum + value / values.length, 0) || 0,
    })),
    obstructions: structuredClone(active),
    shadows: findings
      .filter((item) => item.shadowPolygon?.length)
      .map((item) => ({ id: item.id, points: structuredClone(item.shadowPolygon!) })),
    samples: structuredClone(findings.flatMap((item) => item.sampleEvidence ?? [])).slice(
      0,
      SHADING_LIMITS.maxFindings,
    ),
    blockingPoints: findings
      .filter((item) => item.blockingPoint)
      .map((item) => ({
        id: item.id,
        x: item.blockingPoint!.x,
        y: item.blockingPoint!.y,
        z: item.blockingPoint!.z ?? 0,
      })),
  };
}

export function cameraTarget(data: Shading3DSceneData) {
  return {
    x: (data.bounds.minX + data.bounds.maxX) / 2,
    y: (data.bounds.minY + data.bounds.maxY) / 2,
    z: (data.bounds.minZ + data.bounds.maxZ) / 2,
  };
}

export function cameraDistance(data: Shading3DSceneData) {
  return (
    Math.max(
      data.bounds.maxX - data.bounds.minX,
      data.bounds.maxY - data.bounds.minY,
      data.bounds.maxZ - data.bounds.minZ,
      10,
    ) * 1.6
  );
}
