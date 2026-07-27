import { analyzeTerrain } from "../../../../shared/renewableEnergy/terrain/terrainCore";
import { parseTerrainPoints } from "../../../../shared/renewableEnergy/terrain/terrainParsing";
import type {
  TerrainConfig,
  TerrainImportOptions,
  TerrainProgressStage,
} from "../../../../shared/renewableEnergy/terrain/terrainTypes";

type Request = {
  type: "process";
  generation: number;
  text: string;
  options: TerrainImportOptions;
  config: TerrainConfig;
  excludedSourceIndices: number[];
};
const progress = (generation: number, stage: TerrainProgressStage) =>
  postMessage({ type: "progress", generation, stage });

self.onmessage = (event: MessageEvent<unknown>) => {
  const message = event.data;
  if (!message || typeof message !== "object" || !("type" in message) || message.type !== "process")
    return;
  const request = message as Request;
  if (!Number.isInteger(request.generation) || typeof request.text !== "string") return;
  try {
    progress(request.generation, "parsing");
    const parsed = parseTerrainPoints(request.text, request.options);
    progress(request.generation, "validating-points");
    const excluded = new Set(
      Array.isArray(request.excludedSourceIndices)
        ? request.excludedSourceIndices.filter((value) => Number.isInteger(value) && value >= 0)
        : [],
    );
    parsed.points = parsed.points.filter((point) => !excluded.has(point.sourceIndex));
    parsed.excludedSourceIndices = [...excluded].sort((a, b) => a - b);
    if (parsed.points.length < 3)
      throw new Error("At least three retained terrain points are required.");
    const analysis = analyzeTerrain(
      parsed.points,
      request.config,
      parsed.exactDuplicateCount,
      parsed.conflictingDuplicateCount,
      () => false,
      (stage) => progress(request.generation, stage),
    );
    progress(request.generation, "preparing-scene");
    postMessage({ type: "result", generation: request.generation, parsed, analysis });
  } catch (error) {
    postMessage({
      type: "error",
      generation: request.generation,
      message: error instanceof Error ? error.message : "Terrain processing failed.",
    });
  }
};
