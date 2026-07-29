import {
  SHADING_LIMITS,
  SHADING_COMPANION_SCHEMA,
  SHADING_COMPANION_VERSION,
  SHADING_RULE_VERSION,
  type ShadingSceneCompanion,
  SHADING_SCHEMA_NAME,
  SHADING_SCHEMA_VERSION,
  type ShadingReview,
  type TimeRangeSummary,
} from "./shadingTypes";
import { validateShadingReview } from "./shadingValidation";

function stable(value: unknown, ancestors = new WeakSet<object>()): unknown {
  if (value && typeof value === "object") {
    if (ancestors.has(value)) throw new Error("Circular values cannot be serialized.");
    ancestors.add(value);
    const result = Array.isArray(value)
      ? value.map((item) => stable(item, ancestors))
      : Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, stable(item, ancestors)]),
        );
    ancestors.delete(value);
    return result;
  }
  return value;
}
export function serializeShadingReview(review: ShadingReview) {
  const validated = validateShadingReview(review);
  const text = JSON.stringify(stable(validated), null, 2);
  if (new TextEncoder().encode(text).length > SHADING_LIMITS.maxExportBytes)
    throw new Error("Export size limit exceeded.");
  return `${text}\n`;
}
const csvCell = (value: string | number) => {
  const raw = String(value);
  const protectedValue = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${protectedValue.replaceAll('"', '""')}"`;
};
export function findingsCsv(review: ShadingReview) {
  const rows = [
    [
      "timestamp",
      "domain",
      "source",
      "receiver",
      "state",
      "samples",
      "shaded",
      "geometric_fraction",
      "warnings",
    ],
    ...review.findings.map((finding) => [
      finding.timestamp,
      finding.domain,
      finding.sourceObjectId,
      finding.receiverObjectId,
      finding.state,
      finding.sampleCount,
      finding.shadedCount,
      finding.geometricShadedFraction ?? "",
      finding.warnings.join("; "),
    ]),
  ];
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
export function timeRangeSummaryCsv(summary: TimeRangeSummary) {
  const rows: (string | number)[][] = [
    [
      "table_id",
      "evaluated_timestamps",
      "clear",
      "geometrically_shaded",
      "not_evaluated",
      "invalid",
    ],
    ...summary.tables.map((table) => [
      table.tableId,
      table.evaluated,
      table.clear,
      table.shaded,
      table.notEvaluated,
      table.invalid,
    ]),
  ];
  const text = `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
  if (new TextEncoder().encode(text).length > SHADING_LIMITS.maxExportBytes)
    throw new Error("Summary CSV export size limit exceeded.");
  return text;
}

export function createShadingSceneCompanion(
  review: ShadingReview,
  summary?: TimeRangeSummary,
): ShadingSceneCompanion {
  const validated = validateShadingReview(review);
  return {
    schemaName: SHADING_COMPANION_SCHEMA,
    schemaVersion: SHADING_COMPANION_VERSION,
    calculationVersion: SHADING_RULE_VERSION,
    projectReference: validated.inputs.layout.projectName,
    sourceLayoutReference: validated.sourceLayoutReference,
    coordinateSystem: "registered-local-metric",
    units: "metres",
    review: validated,
    timeRangeSummary: summary ? structuredClone(summary) : undefined,
  };
}

export function serializeShadingSceneCompanion(companion: ShadingSceneCompanion) {
  if (
    companion.schemaName !== SHADING_COMPANION_SCHEMA ||
    companion.schemaVersion !== SHADING_COMPANION_VERSION ||
    companion.calculationVersion !== SHADING_RULE_VERSION ||
    companion.coordinateSystem !== "registered-local-metric" ||
    companion.units !== "metres" ||
    companion.projectReference !== companion.review.inputs.layout.projectName
  )
    throw new Error("Shading scene companion is incompatible.");
  validateShadingReview(companion.review);
  const text = `${JSON.stringify(stable(companion), null, 2)}\n`;
  if (new TextEncoder().encode(text).length > SHADING_LIMITS.maxExportBytes)
    throw new Error("Companion export size limit exceeded.");
  return text;
}
export function safeShadingFilename(name: string, extension: "json" | "csv") {
  const base =
    name
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "shading-review";
  return `${base}.${extension}`;
}
