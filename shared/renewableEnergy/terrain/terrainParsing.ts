import {
  TERRAIN_LIMITS,
  type TerrainDelimiter,
  type TerrainImportOptions,
  type TerrainParseResult,
  type TerrainPoint,
  type TerrainSample,
} from "./terrainTypes";

const separators: Record<TerrainDelimiter, RegExp> = {
  comma: /,/,
  semicolon: /;/,
  tab: /\t/,
  whitespace: /\s+/,
};
const split = (line: string, delimiter: TerrainDelimiter) => {
  if (delimiter === "whitespace") return line.trim().split(separators.whitespace);
  const separator = delimiter === "comma" ? "," : delimiter === "semicolon" ? ";" : "\t";
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === separator && !quoted) {
      cells.push(current.trim());
      current = "";
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
};
const numeric = (value: string) => value.trim() !== "" && Number.isFinite(Number(value));

export function detectTerrainSample(text: string): TerrainSample {
  if (!text || text.includes("\0"))
    throw new Error("Terrain file is empty or contains binary data.");
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim() && !line.trimStart().startsWith("#"));
  if (lines.length < 3 || lines.length > TERRAIN_LIMITS.maxLines)
    throw new Error("Terrain file has an unsupported line count.");
  const candidates: TerrainDelimiter[] = ["comma", "semicolon", "tab", "whitespace"];
  const scored = candidates
    .map((delimiter) => {
      const widths = lines.slice(0, 20).map((line) => split(line, delimiter).length);
      const width = Math.max(...widths);
      return {
        delimiter,
        score: width >= 3 ? widths.filter((item) => item === width).length * width : 0,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score || candidates.indexOf(a.delimiter) - candidates.indexOf(b.delimiter),
    );
  const delimiter = scored[0].delimiter;
  const rows = lines.slice(0, TERRAIN_LIMITS.maxSampleRows).map((line) => split(line, delimiter));
  const columnCount = Math.max(...rows.map((row) => row.length));
  if (columnCount > TERRAIN_LIMITS.maxColumns)
    throw new Error("Terrain file has too many columns.");
  const hasHeader =
    rows[0].some((value) => !numeric(value)) &&
    rows.slice(1, 4).every((row) => row.slice(0, 3).every(numeric));
  const columns = hasHeader
    ? rows[0].map((value, index) => value.trim() || `Column ${index + 1}`)
    : Array.from({ length: columnCount }, (_, index) => `Column ${index + 1}`);
  return {
    delimiter,
    hasHeader,
    columns,
    rows: hasHeader ? rows.slice(1) : rows,
    lineCount: lines.length,
  };
}

export function parseTerrainPoints(
  text: string,
  options: TerrainImportOptions,
): TerrainParseResult {
  const mapping = options.mapping;
  if (
    new Set([mapping.x, mapping.y, mapping.z]).size !== 3 ||
    [mapping.x, mapping.y, mapping.z].some(
      (i) => !Number.isInteger(i) || i < 0 || i >= TERRAIN_LIMITS.maxColumns,
    )
  )
    throw new Error("X, Y, and Z mappings must be unique valid columns.");
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim() && !line.trimStart().startsWith("#"));
  const data = options.hasHeader ? lines.slice(1) : lines;
  const factor = options.unit === "ft" ? 0.3048 : 1;
  const parsed: TerrainPoint[] = [];
  let rejectedRows = 0;
  for (let index = 0; index < data.length; index++) {
    const row = split(data[index], options.delimiter);
    const values = [mapping.x, mapping.y, mapping.z].map((column) => Number(row[column]));
    if (
      row.length > TERRAIN_LIMITS.maxColumns ||
      values.some(
        (value) =>
          !Number.isFinite(value) || Math.abs(value) > TERRAIN_LIMITS.maxCoordinateMagnitude,
      )
    ) {
      rejectedRows++;
      continue;
    }
    parsed.push({
      x: values[0] * factor,
      y: values[1] * factor,
      z: values[2] * factor,
      sourceIndex: index,
    });
    if (parsed.length > TERRAIN_LIMITS.maxPoints) throw new Error("Terrain point limit exceeded.");
  }
  if (parsed.length < 3 || rejectedRows / data.length > TERRAIN_LIMITS.maxRejectionRate)
    throw new Error("Terrain data has insufficient usable points or too many malformed rows.");
  const groups = new Map<string, TerrainPoint[]>();
  for (const point of parsed) {
    const key = `${point.x}|${point.y}`;
    const list = groups.get(key) ?? [];
    list.push(point);
    groups.set(key, list);
  }
  const points: TerrainPoint[] = [];
  let exactDuplicateCount = 0;
  let conflictingDuplicateCount = 0;
  for (const list of groups.values()) {
    const elevations = [...new Set(list.map((point) => point.z))];
    if (elevations.length === 1) {
      points.push(list[0]);
      exactDuplicateCount += list.length - 1;
      continue;
    }
    conflictingDuplicateCount += list.length - 1;
    if (options.conflictResolution === "reject")
      throw new Error(
        "Conflicting elevations share the same XY coordinate and require explicit resolution.",
      );
    if (options.conflictResolution === "first") points.push(list[0]);
    else if (options.conflictResolution === "last") points.push(list[list.length - 1]);
    else
      points.push({ ...list[0], z: list.reduce((sum, point) => sum + point.z, 0) / list.length });
  }
  const originalBounds = {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    minZ: Math.min(...points.map((p) => p.z)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
    maxZ: Math.max(...points.map((p) => p.z)),
  };
  const localOrigin = { x: originalBounds.minX, y: originalBounds.minY, z: 0 };
  return {
    points: points.map((p) => ({ ...p, x: p.x - localOrigin.x, y: p.y - localOrigin.y })),
    acceptedRows: points.length,
    rejectedRows,
    exactDuplicateCount,
    conflictingDuplicateCount,
    originalBounds,
    localOrigin,
    excludedSourceIndices: [],
  };
}
