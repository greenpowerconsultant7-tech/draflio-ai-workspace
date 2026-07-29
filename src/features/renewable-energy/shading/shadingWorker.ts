/// <reference lib="webworker" />
import {
  calculateSunPosition,
  buildObstructionShadowIndex,
  buildTableSpatialIndex,
  buildTerrainSpatialIndex,
  combineDomainFindings,
  evaluateHorizon,
  evaluateIndexedObstructions,
  evaluateIndexedRowShading,
  evaluateTerrainShading,
  summarizeTimeRange,
} from "../../../../shared/renewableEnergy/shading/shadingCore";
import {
  SHADING_LIMITS,
  type TimeRangeRequest,
  type TimeRangeResponse,
} from "../../../../shared/renewableEnergy/shading/shadingTypes";
import { validateTimeRangeRequest } from "../../../../shared/renewableEnergy/shading/shadingValidation";

const worker = self as DedicatedWorkerGlobalScope;
worker.onmessage = (event: MessageEvent<unknown>) => {
  const request = event.data;
  if (
    !request ||
    typeof request !== "object" ||
    !("type" in request) ||
    (request as { type?: unknown }).type !== "analyse"
  )
    return;
  try {
    const typed = validateTimeRangeRequest(request),
      start = new Date(typed.startIso),
      end = new Date(typed.endIso);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start)
      throw new Error("Invalid analysis interval.");
    if (!Number.isInteger(typed.stepMinutes) || typed.stepMinutes < 1)
      throw new Error("Time step must be a positive whole minute.");
    const count = Math.floor((end.getTime() - start.getTime()) / (typed.stepMinutes * 60_000)) + 1;
    if (count > SHADING_LIMITS.maxTimestamps) throw new Error("Timestamp limit exceeded.");
    const selected = typed.inputs.layout.tables.filter((table) =>
      typed.selectedTableIds.includes(table.id),
    );
    const domains = typed.inputs.enabledDomains ?? {
      rowToRow: true,
      terrain: true,
      horizon: true,
      obstruction: true,
    };
    const tableIndex = buildTableSpatialIndex(typed.inputs.layout.tables);
    const terrainIndex = typed.inputs.terrain
      ? buildTerrainSpatialIndex(typed.inputs.terrain)
      : undefined;
    if (selected.length > SHADING_LIMITS.maxSelectedTables)
      throw new Error("Selected table limit exceeded.");
    const findings = [];
    post({
      type: "progress",
      generation: typed.generation,
      stage: "validating-inputs",
      percent: 5,
    });
    for (let index = 0; index < count; index += 1) {
      const sun = calculateSunPosition(
        new Date(start.getTime() + index * typed.stepMinutes * 60_000),
        typed.inputs.project,
      );
      const obstructionIndex = buildObstructionShadowIndex(
        typed.inputs.obstructions,
        sun,
        typed.inputs.project.projectNorthDegrees,
      );
      for (const receiver of selected) {
        const domainFindings = [];
        if (domains.horizon)
          domainFindings.push(evaluateHorizon(typed.inputs.horizon, receiver.id, sun));
        if (domains.terrain && typed.inputs.terrain && terrainIndex)
          domainFindings.push(
            evaluateTerrainShading(typed.inputs.terrain, terrainIndex, receiver, sun),
          );
        if (domains.obstruction)
          domainFindings.push(
            ...evaluateIndexedObstructions(
              obstructionIndex,
              receiver,
              sun,
              typed.inputs.project.projectNorthDegrees,
            ),
          );
        if (domains.rowToRow)
          for (const source of typed.inputs.layout.tables)
            if (source.id !== receiver.id)
              domainFindings.push(
                ...evaluateIndexedRowShading(
                  source,
                  tableIndex,
                  sun,
                  typed.inputs.project.projectNorthDegrees,
                ).filter((finding) => finding.receiverObjectId === receiver.id),
              );
        findings.push(...domainFindings, combineDomainFindings(receiver.id, sun, domainFindings));
      }
      if (index % Math.max(1, Math.floor(count / 20)) === 0)
        post({
          type: "progress",
          generation: typed.generation,
          stage: "evaluating-geometric-domains",
          percent: 10 + Math.round((index / count) * 85),
        });
      if (findings.length > SHADING_LIMITS.maxFindings) throw new Error("Finding limit exceeded.");
    }
    findings.sort(
      (a, b) =>
        a.timestamp.localeCompare(b.timestamp) ||
        a.receiverObjectId.localeCompare(b.receiverObjectId) ||
        a.domain.localeCompare(b.domain) ||
        a.sourceObjectId.localeCompare(b.sourceObjectId),
    );
    post({
      type: "success",
      generation: typed.generation,
      findings,
      summary: summarizeTimeRange(findings, count),
    });
  } catch (error) {
    post({
      type: "error",
      generation: (request as { generation?: number }).generation ?? -1,
      message: error instanceof Error ? error.message : "Worker analysis failed.",
    });
  }
};
function post(message: TimeRangeResponse) {
  worker.postMessage(message);
}
