import {
  createTerrainSampler,
  generateTables,
  layoutStatistics,
  revalidateLayoutTables,
} from "../../../../shared/renewableEnergy/layout/layoutCore";
import type {
  ArrayArea,
  ExclusionZone,
  ReviewedPolygon,
  TableDefinition,
  TerrainLimits,
} from "../../../../shared/renewableEnergy/layout/layoutTypes";
import type { DraflioScene } from "../../../../shared/renewableEnergy/draflioSceneTypes";

export type LayoutWorkerRequest = {
  type: "generate";
  generation: number;
  areas: ArrayArea[];
  table: TableDefinition;
  boundary: ReviewedPolygon;
  exclusions: ExclusionZone[];
  terrainLimits: TerrainLimits;
  terrainScene: DraflioScene;
};

self.onmessage = (event: MessageEvent<unknown>) => {
  const message = event.data;
  if (!validRequest(message)) {
    postMessage({
      type: "error",
      generation: -1,
      message: "Malformed layout-worker request was rejected.",
    });
    return;
  }
  try {
    const terrainSampler = createTerrainSampler(message.terrainScene);
    const generated = message.areas.flatMap((area, areaIndex) =>
      generateTables({
        area,
        table: message.table,
        boundary: message.boundary,
        exclusions: message.exclusions,
        terrainLimits: message.terrainLimits,
        terrainSampler,
        progress: (progress) =>
          postMessage({
            type: "progress",
            generation: message.generation,
            progress: {
              ...progress,
              percent: Math.round((areaIndex * 100 + progress.percent) / message.areas.length),
            },
          }),
      }),
    );
    const tables = revalidateLayoutTables(
      generated,
      message.areas,
      message.boundary,
      message.exclusions,
      message.terrainLimits,
      terrainSampler,
    );
    postMessage({
      type: "progress",
      generation: message.generation,
      progress: {
        stage: "calculating-statistics",
        percent: 90,
        completed: tables.length,
        total: tables.length,
      },
    });
    const statistics = layoutStatistics(
      message.boundary,
      message.exclusions,
      message.areas,
      tables,
    );
    postMessage({
      type: "progress",
      generation: message.generation,
      progress: {
        stage: "serializing-result",
        percent: 100,
        completed: tables.length,
        total: tables.length,
      },
    });
    postMessage({ type: "result", generation: message.generation, tables, statistics });
  } catch (error) {
    postMessage({
      type: "error",
      generation: message.generation,
      message: error instanceof Error ? error.message : "Layout generation failed safely.",
    });
  }
};

function validRequest(value: unknown): value is LayoutWorkerRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<LayoutWorkerRequest>;
  return (
    request.type === "generate" &&
    Number.isSafeInteger(request.generation) &&
    Array.isArray(request.areas) &&
    request.areas.length > 0 &&
    Boolean(request.table) &&
    Boolean(request.boundary) &&
    Array.isArray(request.exclusions) &&
    Boolean(request.terrainLimits) &&
    Boolean(request.terrainScene)
  );
}
