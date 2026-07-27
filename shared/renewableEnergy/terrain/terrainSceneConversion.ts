import { createDefaultTransform } from "../draflioSceneGeometry";
import { createEmptyDraflioScene } from "../draflioSceneSerialization";
import type { DraflioScene, SourceDocument, TerrainSurface } from "../draflioSceneTypes";
import { validateDraflioScene } from "../draflioSceneValidation";
import type { TerrainAnalysis, TerrainImportOptions, TerrainParseResult } from "./terrainTypes";

export interface TerrainSceneInput {
  sourceName: string;
  sourceMediaType: string;
  sourceHash?: string;
  sourceType: "csv" | "xyz" | "survey" | "manual";
  importedAt: string;
  parsed: TerrainParseResult;
  analysis: TerrainAnalysis;
  options: TerrainImportOptions;
}

export function terrainToDraflioScene(input: TerrainSceneInput): DraflioScene {
  const scene = createEmptyDraflioScene(
    input.sourceName.replace(/\.[^.]+$/, "") || "Terrain scene",
  );
  const sourceId = crypto.randomUUID();
  const objectId = crypto.randomUUID();
  const source: SourceDocument = {
    id: sourceId,
    displayName: input.sourceName.replace(/[\\/]/g, "-").slice(0, 150),
    mediaType: input.sourceMediaType || "text/plain",
    sha256: input.sourceHash,
    importedAt: input.importedAt,
  };
  const elevations = input.analysis.mesh.vertices.map((vertex) => vertex.z);
  const terrain: TerrainSurface = {
    id: objectId,
    kind: "terrain-surface",
    name: "Imported terrain surface",
    visible: true,
    reviewStatus: "needs-review",
    geometry: {
      type: "mesh",
      vertices: input.analysis.mesh.vertices.map((vertex) => ({ ...vertex })),
      triangles: input.analysis.mesh.triangles.map((triangle) => [...triangle]),
    },
    transform: createDefaultTransform(),
    sourceReferences: [{ sourceDocumentId: sourceId, extractionMethod: "imported" }],
    warnings: [
      {
        code: "ENGINEERING_REVIEW_REQUIRED",
        severity: "warning",
        message: "Imported terrain and derived screening require engineering review.",
      },
    ],
    metadata: {
      interpolationMethod: input.analysis.grid.interpolated ? "idw-1.0" : "regular-grid-1.0",
      slopeAspectAlgorithm: "central-difference-1.0",
      originalUnit: input.options.unit,
      conflictResolution: input.options.conflictResolution,
      gridSpacingMeters: input.analysis.grid.spacing,
      rejectedRows: input.parsed.rejectedRows,
      excludedScreenedPoints: input.parsed.excludedSourceIndices.length,
    },
    createdAt: input.importedAt,
    updatedAt: input.importedAt,
    elevationRange: { minimum: Math.min(...elevations), maximum: Math.max(...elevations) },
    sourceType: input.sourceType,
  };
  scene.coordinateSystem = {
    type: input.options.coordinateSystem.type,
    epsgCode: input.options.coordinateSystem.epsgCode,
    name: input.options.coordinateSystem.name,
    origin: {
      x: input.parsed.localOrigin.x,
      y: input.parsed.localOrigin.y,
      z: input.parsed.localOrigin.z,
    },
  };
  scene.bounds = {
    minimum: {
      x: input.analysis.grid.originX,
      y: input.analysis.grid.originY,
      z: terrain.elevationRange.minimum,
    },
    maximum: {
      x:
        input.analysis.grid.originX +
        (input.analysis.grid.columns - 1) * input.analysis.grid.spacing,
      y: input.analysis.grid.originY + (input.analysis.grid.rows - 1) * input.analysis.grid.spacing,
      z: terrain.elevationRange.maximum,
    },
  };
  scene.objects = [terrain];
  scene.sourceDocuments = [source];
  scene.reviewSummary = {
    status: "in-review",
    unresolvedObjectCount: 1,
    warningCount: terrain.warnings.length,
  };
  const validation = validateDraflioScene(scene);
  if (!validation.valid) throw new Error("Generated terrain scene failed schema validation.");
  return scene;
}
