import type { GeneratedTable, Point2 } from "../layout/layoutTypes";
import type { TerrainMesh } from "../terrain/terrainTypes";
import {
  SHADING_LIMITS,
  SHADING_RULE_VERSION,
  SUN_METHOD,
  tableElevation,
  type HorizonPoint,
  type Obstruction,
  type ProjectTime,
  type ShadingFinding,
  type SunPosition,
  type TerrainCoverage,
  type TerrainRayResult,
  type TerrainSpatialIndex,
  type TableSamplingMethod,
  type TableSpatialIndex,
  type ObstructionShadowIndex,
  type TimeRangeSummary,
  type ReviewStatus,
  type ReviewTransition,
} from "./shadingTypes";

const radians = (degrees: number) => (degrees * Math.PI) / 180;
const degrees = (value: number) => (value * 180) / Math.PI;
const normal = (value: number) => ((value % 360) + 360) % 360;
const finite = (value: number, label: string) => {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
};

export function validateProject(project: ProjectTime) {
  if (finite(project.latitudeDegrees, "Latitude") < -90 || project.latitudeDegrees > 90)
    throw new Error("Latitude must be between -90 and 90 degrees.");
  if (finite(project.longitudeDegrees, "Longitude") < -180 || project.longitudeDegrees > 180)
    throw new Error("Longitude must be between -180 and 180 degrees.");
  if (
    finite(project.projectNorthDegrees, "Project north") < -360 ||
    project.projectNorthDegrees > 360
  )
    throw new Error("Project north must be between -360 and 360 degrees.");
  if (!project.timezone.trim()) throw new Error("Timezone is required.");
  if (project.fixedOffsetMinutes === undefined) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: project.timezone }).format(new Date(0));
    } catch {
      throw new Error("Timezone must be a valid IANA identifier or a labelled fixed UTC offset.");
    }
  } else if (
    !Number.isInteger(project.fixedOffsetMinutes) ||
    Math.abs(project.fixedOffsetMinutes) > 14 * 60
  ) {
    throw new Error("Fixed UTC offset must be whole minutes between UTC-14 and UTC+14.");
  }
}

export function timezoneOffsetMinutes(timestamp: Date, project: ProjectTime) {
  if (project.fixedOffsetMinutes !== undefined) return project.fixedOffsetMinutes;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: project.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(timestamp);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const localAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((localAsUtc - timestamp.getTime()) / 60_000);
}

/** NOAA General Solar Position Calculations. Geometric elevation: no refraction correction. */
export function calculateSunPosition(timestamp: Date, project: ProjectTime): SunPosition {
  validateProject(project);
  if (!Number.isFinite(timestamp.getTime())) throw new Error("Timestamp is invalid.");
  const jd = timestamp.getTime() / 86_400_000 + 2440587.5;
  const t = (jd - 2451545) / 36525;
  const l0 = normal(280.46646 + t * (36000.76983 + t * 0.0003032));
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c =
    Math.sin(radians(m)) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(radians(2 * m)) * (0.019993 - 0.000101 * t) +
    Math.sin(radians(3 * m)) * 0.000289;
  const trueLongitude = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const lambda = trueLongitude - 0.00569 - 0.00478 * Math.sin(radians(omega));
  const epsilon0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const epsilon = epsilon0 + 0.00256 * Math.cos(radians(omega));
  const declination = Math.asin(Math.sin(radians(epsilon)) * Math.sin(radians(lambda)));
  const y = Math.tan(radians(epsilon / 2)) ** 2;
  const equation =
    4 *
    degrees(
      y * Math.sin(2 * radians(l0)) -
        2 * e * Math.sin(radians(m)) +
        4 * e * y * Math.sin(radians(m)) * Math.cos(2 * radians(l0)) -
        0.5 * y * y * Math.sin(4 * radians(l0)) -
        1.25 * e * e * Math.sin(2 * radians(m)),
    );
  const offset = timezoneOffsetMinutes(timestamp, project);
  const local = new Date(timestamp.getTime() + offset * 60_000);
  const clockMinutes =
    local.getUTCHours() * 60 + local.getUTCMinutes() + local.getUTCSeconds() / 60;
  const solarMinutes =
    (((clockMinutes + equation + 4 * project.longitudeDegrees - offset) % 1440) + 1440) % 1440;
  let hourAngle = solarMinutes / 4 - 180;
  if (hourAngle < -180) hourAngle += 360;
  const latitude = radians(project.latitudeDegrees);
  const ha = radians(hourAngle);
  const cosZenith = Math.min(
    1,
    Math.max(
      -1,
      Math.sin(latitude) * Math.sin(declination) +
        Math.cos(latitude) * Math.cos(declination) * Math.cos(ha),
    ),
  );
  const zenith = Math.acos(cosZenith);
  const azimuth = normal(
    degrees(
      Math.atan2(
        Math.sin(ha),
        Math.cos(ha) * Math.sin(latitude) - Math.tan(declination) * Math.cos(latitude),
      ),
    ) + 180,
  );
  const sunriseArgument =
    Math.cos(radians(90.833)) / (Math.cos(latitude) * Math.cos(declination)) -
    Math.tan(latitude) * Math.tan(declination);
  const solarNoon = 720 - 4 * project.longitudeDegrees - equation + offset;
  const polarState =
    sunriseArgument < -1 ? "polar-day" : sunriseArgument > 1 ? "polar-night" : "none";
  const haSunrise = polarState === "none" ? degrees(Math.acos(sunriseArgument)) : null;
  return {
    timestamp: timestamp.toISOString(),
    azimuthDegrees: azimuth,
    elevationDegrees: 90 - degrees(zenith),
    zenithDegrees: degrees(zenith),
    belowHorizon: 90 - degrees(zenith) <= 0,
    solarNoonMinutes: solarNoon,
    sunriseMinutes: haSunrise === null ? null : solarNoon - 4 * haSunrise,
    sunsetMinutes: haSunrise === null ? null : solarNoon + 4 * haSunrise,
    polarState,
    equationOfTimeMinutes: equation,
    declinationDegrees: degrees(declination),
    localSolarTimeMinutes: solarMinutes,
    method: SUN_METHOD,
  };
}

export function normalizeHorizon(points: readonly HorizonPoint[]) {
  if (points.length > SHADING_LIMITS.maxHorizonPoints)
    throw new Error("Horizon point limit exceeded.");
  const reviewed = points
    .filter((point) => point.reviewStatus === "reviewed")
    .map((point) => {
      finite(point.azimuthDegrees, "Horizon azimuth");
      finite(point.elevationDegrees, "Horizon elevation");
      if (point.elevationDegrees < -90 || point.elevationDegrees > 90)
        throw new Error("Horizon elevation must be between -90 and 90 degrees.");
      if (!point.source.trim()) throw new Error("Horizon source is required.");
      return { ...point, azimuthDegrees: normal(point.azimuthDegrees) };
    })
    .sort((a, b) => a.azimuthDegrees - b.azimuthDegrees || a.source.localeCompare(b.source));
  for (let index = 1; index < reviewed.length; index += 1)
    if (reviewed[index].azimuthDegrees === reviewed[index - 1].azimuthDegrees)
      throw new Error(`Duplicate horizon azimuth ${reviewed[index].azimuthDegrees}.`);
  return reviewed;
}

export function horizonAt(points: readonly HorizonPoint[], azimuth: number, maxGapDegrees = 45) {
  const sorted = normalizeHorizon(points);
  if (sorted.length < 2) return undefined;
  const target = normal(azimuth);
  const extended = [...sorted, { ...sorted[0], azimuthDegrees: sorted[0].azimuthDegrees + 360 }];
  const adjusted = target < sorted[0].azimuthDegrees ? target + 360 : target;
  for (let index = 0; index < extended.length - 1; index += 1) {
    const left = extended[index],
      right = extended[index + 1];
    if (adjusted >= left.azimuthDegrees && adjusted <= right.azimuthDegrees) {
      const gap = right.azimuthDegrees - left.azimuthDegrees;
      if (gap > maxGapDegrees) return undefined;
      const ratio = gap === 0 ? 0 : (adjusted - left.azimuthDegrees) / gap;
      return left.elevationDegrees + ratio * (right.elevationDegrees - left.elevationDegrees);
    }
  }
  return undefined;
}

function polygonArea(points: readonly Point2[]) {
  return (
    Math.abs(
      points.reduce((sum, point, index) => {
        const next = points[(index + 1) % points.length];
        return sum + point.x * next.y - next.x * point.y;
      }, 0),
    ) / 2
  );
}
function pointInPolygon(point: Point2, polygon: readonly Point2[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
export function tableSamples(
  table: GeneratedTable,
  method: TableSamplingMethod = "footprint-corners-and-centre",
  moduleGrid?: { rows: number; columns: number },
) {
  const vertices = table.footprint.vertices;
  validateTableFootprint(table);
  const centre = {
    x: vertices.reduce((sum, point) => sum + point.x, 0) / vertices.length,
    y: vertices.reduce((sum, point) => sum + point.y, 0) / vertices.length,
  };
  if (method === "centre") return [centre];
  if (method === "corners") return [...vertices];
  if (method === "footprint-corners-and-centre") return [...vertices, centre];
  if (vertices.length !== 4) throw new Error("Module-grid sampling requires four table corners.");
  if (
    !moduleGrid ||
    !Number.isInteger(moduleGrid.rows) ||
    !Number.isInteger(moduleGrid.columns) ||
    moduleGrid.rows < 1 ||
    moduleGrid.columns < 1 ||
    moduleGrid.rows * moduleGrid.columns !== table.moduleCount
  )
    throw new Error("Module-grid rows and columns must match the declared module count.");
  const { rows, columns } = moduleGrid;
  if (rows * columns > SHADING_LIMITS.maxSamplesPerTable)
    throw new Error("Module-grid sample limit exceeded.");
  const [a, b, c, d] = vertices;
  const samples: Point2[] = [];
  for (let row = 0; row < rows; row += 1)
    for (let column = 0; column < columns; column += 1) {
      const u = (column + 0.5) / columns,
        v = (row + 0.5) / rows;
      samples.push({
        x: (1 - u) * (1 - v) * a.x + u * (1 - v) * b.x + u * v * c.x + (1 - u) * v * d.x,
        y: (1 - u) * (1 - v) * a.y + u * (1 - v) * b.y + u * v * c.y + (1 - u) * v * d.y,
      });
    }
  return samples;
}

function validateTableFootprint(table: GeneratedTable) {
  const vertices = table.footprint.vertices;
  if (!table.id || vertices.length < 3 || vertices.length > SHADING_LIMITS.max2DVertices)
    throw new Error(`Table ${table.id || "(missing ID)"} has invalid footprint geometry.`);
  vertices.forEach((point) => {
    finite(point.x, `Table ${table.id} x`);
    finite(point.y, `Table ${table.id} y`);
  });
  if (polygonArea(vertices) < 1e-8) throw new Error(`Table ${table.id} footprint is degenerate.`);
}

export function buildTableSpatialIndex(tables: readonly GeneratedTable[]): TableSpatialIndex {
  if (tables.length > SHADING_LIMITS.maxTables) throw new Error("Table limit exceeded.");
  const ordered = [...tables].sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(ordered.map((table) => table.id)).size !== ordered.length)
    throw new Error("Duplicate table ID.");
  ordered.forEach(validateTableFootprint);
  const points = ordered.flatMap((table) => table.footprint.vertices);
  const originX = Math.min(...points.map((point) => point.x));
  const originY = Math.min(...points.map((point) => point.y));
  const span = Math.max(
    Math.max(...points.map((point) => point.x)) - originX,
    Math.max(...points.map((point) => point.y)) - originY,
    1,
  );
  const cellSizeMeters = Math.max(0.01, span / Math.max(1, Math.ceil(Math.sqrt(ordered.length))));
  const cells = new Map<string, string[]>();
  for (const table of ordered) {
    const bounds = polygonBounds(table.footprint.vertices);
    for (
      let x = Math.floor((bounds.minX - originX) / cellSizeMeters);
      x <= Math.floor((bounds.maxX - originX) / cellSizeMeters);
      x += 1
    )
      for (
        let y = Math.floor((bounds.minY - originY) / cellSizeMeters);
        y <= Math.floor((bounds.maxY - originY) / cellSizeMeters);
        y += 1
      ) {
        const key = cellKey(x, y),
          values = cells.get(key) ?? [];
        if (values.length >= SHADING_LIMITS.maxTablesPerCell)
          throw new Error("Table spatial-index cell limit exceeded.");
        values.push(table.id);
        cells.set(key, values);
        if (cells.size > SHADING_LIMITS.maxTableIndexCells)
          throw new Error("Table spatial-index cell-count limit exceeded.");
      }
  }
  return {
    cellSizeMeters,
    originX,
    originY,
    cells: new Map([...cells].map(([key, values]) => [key, Object.freeze([...values].sort())])),
    tables: new Map(ordered.map((table) => [table.id, table])),
  };
}

function polygonBounds(points: readonly Point2[]) {
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

export function queryTableSpatialIndex(
  index: TableSpatialIndex,
  polygon: readonly Point2[],
  sourceId: string,
) {
  const bounds = polygonBounds(polygon),
    ids = new Set<string>();
  for (
    let x = Math.floor((bounds.minX - index.originX) / index.cellSizeMeters);
    x <= Math.floor((bounds.maxX - index.originX) / index.cellSizeMeters);
    x += 1
  )
    for (
      let y = Math.floor((bounds.minY - index.originY) / index.cellSizeMeters);
      y <= Math.floor((bounds.maxY - index.originY) / index.cellSizeMeters);
      y += 1
    )
      for (const id of index.cells.get(cellKey(x, y)) ?? [])
        if (id !== sourceId) {
          ids.add(id);
          if (ids.size > SHADING_LIMITS.maxRowShadowCandidates)
            throw new Error("Row-shadow candidate limit exceeded.");
        }
  return [...ids].sort().map((id) => index.tables.get(id)!);
}

export function evaluateIndexedRowShading(
  source: GeneratedTable,
  index: TableSpatialIndex,
  sun: SunPosition,
  northDegrees = 0,
  cancelled: () => boolean = () => false,
) {
  const elevation = tableElevation(source);
  if (elevation === undefined)
    return [...index.tables.values()]
      .filter((table) => table.id !== source.id)
      .slice(0, SHADING_LIMITS.maxRowShadowCandidates)
      .map((receiver) => evaluateRowShading(source, receiver, sun, northDegrees));
  const height = Math.max(
    0.01,
    Math.sin(radians(source.tiltDegrees)) * Math.sqrt(polygonArea(source.footprint.vertices)),
  );
  const shadow = projectShadow(source.footprint.vertices, height, sun, northDegrees);
  const results: ShadingFinding[] = [];
  for (const receiver of queryTableSpatialIndex(index, shadow, source.id)) {
    if (cancelled()) throw new Error("Row shading cancelled.");
    results.push(evaluateRowShading(source, receiver, sun, northDegrees));
  }
  return results;
}
export function projectShadow(
  footprint: readonly Point2[],
  heightMeters: number,
  sun: SunPosition,
  northDegrees = 0,
) {
  if (sun.elevationDegrees <= 0) return [];
  const length = heightMeters / Math.tan(radians(sun.elevationDegrees));
  const bearing = radians(normal(sun.azimuthDegrees - northDegrees + 180));
  const dx = length * Math.sin(bearing),
    dy = length * Math.cos(bearing);
  return [
    ...footprint,
    ...[...footprint].reverse().map((point) => ({ x: point.x + dx, y: point.y + dy })),
  ];
}

export function evaluateRowShading(
  source: GeneratedTable,
  receiver: GeneratedTable,
  sun: SunPosition,
  northDegrees = 0,
): ShadingFinding {
  const timestamp = sun.timestamp,
    sourceElevation = tableElevation(source),
    receiverElevation = tableElevation(receiver);
  const insufficient = sourceElevation === undefined || receiverElevation === undefined;
  const height = Math.max(
    0.01,
    Math.sin(radians(source.tiltDegrees)) * Math.sqrt(polygonArea(source.footprint.vertices)),
  );
  const shadow = insufficient
    ? []
    : projectShadow(
        source.footprint.vertices,
        height + sourceElevation - receiverElevation,
        sun,
        northDegrees,
      );
  const samples = tableSamples(receiver);
  const shaded = shadow.length
    ? samples.filter((sample) => pointInPolygon(sample, shadow)).length
    : 0;
  const state = sun.belowHorizon
    ? "below-horizon"
    : insufficient
      ? "not-evaluated"
      : shaded === 0
        ? "clear"
        : shaded === samples.length
          ? "fully-shaded"
          : "partially-shaded";
  return {
    id: `row:${source.id}:${receiver.id}:${timestamp}`,
    sourceObjectId: source.id,
    receiverObjectId: receiver.id,
    domain: "row-to-row",
    state,
    sunPosition: sun,
    timestamp,
    calculationMethod: "oriented footprint shadow extrusion with five-point receiver sampling",
    sampleCount: samples.length,
    shadedCount: shaded,
    geometricShadedFraction: insufficient ? undefined : shaded / samples.length,
    shadowPolygon: shadow,
    sampleEvidence: samples.map((sample, index) => ({
      tableId: receiver.id,
      sampleId: `${receiver.id}:row:${index}`,
      sampleMethod: "footprint-corners-and-centre",
      sampleMethodVersion: "re7a-table-sampling-1.0",
      point: sample,
      receiverElevationMeters: tableElevation(receiver),
      domain: "row-to-row",
      state: insufficient
        ? ("unavailable" as const)
        : pointInPolygon(sample, shadow)
          ? ("shaded" as const)
          : ("clear" as const),
      blockerReference: pointInPolygon(sample, shadow) ? source.id : undefined,
      warning: insufficient ? "Terrain/table elevation is insufficient." : undefined,
    })),
    warnings: insufficient ? ["Terrain/table elevation is insufficient."] : [],
    limitations: [
      "Geometric sample fraction is not energy loss.",
      "Exact contact is clear (zero-area contact).",
    ],
    ruleVersion: SHADING_RULE_VERSION,
  };
}

function rayTriangle(
  origin: [number, number, number],
  direction: [number, number, number],
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  c: { x: number; y: number; z: number },
) {
  const edge1 = [b.x - a.x, b.y - a.y, b.z - a.z],
    edge2 = [c.x - a.x, c.y - a.y, c.z - a.z];
  const p = [
    direction[1] * edge2[2] - direction[2] * edge2[1],
    direction[2] * edge2[0] - direction[0] * edge2[2],
    direction[0] * edge2[1] - direction[1] * edge2[0],
  ];
  const determinant = edge1[0] * p[0] + edge1[1] * p[1] + edge1[2] * p[2];
  if (Math.abs(determinant) < 1e-10) return undefined;
  const inv = 1 / determinant,
    t = [origin[0] - a.x, origin[1] - a.y, origin[2] - a.z];
  const u = (t[0] * p[0] + t[1] * p[1] + t[2] * p[2]) * inv;
  if (u < 0 || u > 1) return undefined;
  const q = [
    t[1] * edge1[2] - t[2] * edge1[1],
    t[2] * edge1[0] - t[0] * edge1[2],
    t[0] * edge1[1] - t[1] * edge1[0],
  ];
  const v = (direction[0] * q[0] + direction[1] * q[1] + direction[2] * q[2]) * inv;
  if (v < 0 || u + v > 1) return undefined;
  const distance = (edge2[0] * q[0] + edge2[1] * q[1] + edge2[2] * q[2]) * inv;
  return distance > 1e-6 ? distance : undefined;
}
export function terrainBlocks(
  mesh: TerrainMesh,
  point: { x: number; y: number; z: number },
  sun: SunPosition,
  index = buildTerrainSpatialIndex(mesh),
): TerrainRayResult {
  const coverage = terrainCoverage(mesh, index, point);
  if (coverage.state !== "covered")
    return { state: "not-evaluated", reason: `Receiver is ${coverage.state}.` };
  if (sun.elevationDegrees <= 0)
    return { state: "not-evaluated", reason: "Sun is below the geometric horizon." };
  const elevation = radians(sun.elevationDegrees),
    azimuth = radians(sun.azimuthDegrees);
  const direction: [number, number, number] = [
    Math.sin(azimuth) * Math.cos(elevation),
    Math.cos(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
  ];
  const endX = point.x + direction[0] * SHADING_LIMITS.maxNeighborDistanceMeters;
  const endY = point.y + direction[1] * SHADING_LIMITS.maxNeighborDistanceMeters;
  const candidates = queryTerrainCells(index, point.x, point.y, endX, endY);
  let nearest: { triangleIndex: number; distance: number } | undefined;
  for (const triangleIndex of candidates) {
    const triangle = mesh.triangles[triangleIndex];
    const distance = rayTriangle(
      [point.x, point.y, point.z],
      direction,
      mesh.vertices[triangle[0]],
      mesh.vertices[triangle[1]],
      mesh.vertices[triangle[2]],
    );
    if (
      distance !== undefined &&
      distance <= SHADING_LIMITS.maxNeighborDistanceMeters &&
      (!nearest || distance < nearest.distance)
    )
      nearest = { triangleIndex, distance };
  }
  const continuityDistance = nearest?.distance ?? SHADING_LIMITS.maxNeighborDistanceMeters;
  const continuitySteps = Math.ceil(continuityDistance / index.cellSizeMeters);
  if (continuitySteps > SHADING_LIMITS.maxRayTraversalCells)
    return { state: "not-evaluated", reason: "Terrain continuity traversal limit exceeded." };
  for (let step = 0; step <= continuitySteps; step += 1) {
    const distance = continuitySteps ? (continuityDistance * step) / continuitySteps : 0;
    const sample = terrainCoverage(mesh, index, {
      x: point.x + direction[0] * distance,
      y: point.y + direction[1] * distance,
    });
    if (sample.state !== "covered")
      return {
        state: "not-evaluated",
        reason: `Terrain continuity is unproven: traversal entered ${sample.state}.`,
      };
  }
  if (!nearest) return { state: "clear" };
  return {
    state: "blocked",
    triangleIndex: nearest.triangleIndex,
    distanceMeters: nearest.distance,
    blockingPoint: {
      x: point.x + direction[0] * nearest.distance,
      y: point.y + direction[1] * nearest.distance,
      z: point.z + direction[2] * nearest.distance,
    },
  };
}

export function evaluateTerrainShading(
  mesh: TerrainMesh,
  index: TerrainSpatialIndex,
  receiver: GeneratedTable,
  sun: SunPosition,
): ShadingFinding {
  const samples = tableSamples(receiver);
  const results = samples.map((sample) => {
    const coverage = terrainCoverage(mesh, index, sample);
    if (coverage.state !== "covered") return { state: "not-evaluated" as const, coverage };
    return {
      state: "evaluated" as const,
      ray: terrainBlocks(
        mesh,
        { x: sample.x, y: sample.y, z: coverage.elevationMeters + 0.01 },
        sun,
        index,
      ),
    };
  });
  const blocked = results.filter(
    (result) => result.state === "evaluated" && result.ray.state === "blocked",
  );
  const unavailable = results.filter(
    (result) => result.state === "not-evaluated" || result.ray.state === "not-evaluated",
  );
  const state = sun.belowHorizon
    ? "below-horizon"
    : unavailable.length
      ? "not-evaluated"
      : blocked.length === 0
        ? "clear"
        : blocked.length === results.length
          ? "fully-shaded"
          : "partially-shaded";
  const firstBlock = blocked[0]?.state === "evaluated" ? blocked[0].ray : undefined;
  return {
    id: `terrain:${receiver.id}:${sun.timestamp}`,
    sourceObjectId:
      firstBlock?.state === "blocked" ? `terrain-triangle-${firstBlock.triangleIndex}` : "terrain",
    receiverObjectId: receiver.id,
    domain: "terrain",
    state,
    sunPosition: sun,
    timestamp: sun.timestamp,
    calculationMethod: "bounded indexed terrain ray with barycentric receiver elevation",
    sampleCount: results.length,
    shadedCount: blocked.length,
    clearCount: results.length - blocked.length - unavailable.length,
    notEvaluatedCount: unavailable.length,
    geometricShadedFraction: unavailable.length ? undefined : blocked.length / results.length,
    blockingReference:
      firstBlock?.state === "blocked" ? `terrain-triangle-${firstBlock.triangleIndex}` : undefined,
    blockingPoint: firstBlock?.state === "blocked" ? firstBlock.blockingPoint : undefined,
    sampleEvidence: results.map((result, sampleIndex) => {
      const ray = result.state === "evaluated" ? result.ray : undefined;
      return {
        tableId: receiver.id,
        sampleId: `${receiver.id}:terrain:${sampleIndex}`,
        sampleMethod: "footprint-corners-and-centre" as const,
        sampleMethodVersion: "re7a-table-sampling-1.0" as const,
        point: samples[sampleIndex],
        receiverElevationMeters:
          result.state === "evaluated"
            ? terrainCoverage(mesh, index, samples[sampleIndex]).state === "covered"
              ? (
                  terrainCoverage(mesh, index, samples[sampleIndex]) as {
                    state: "covered";
                    elevationMeters: number;
                  }
                ).elevationMeters
              : undefined
            : undefined,
        domain: "terrain" as const,
        state:
          result.state === "not-evaluated" || ray?.state === "not-evaluated"
            ? ("unavailable" as const)
            : ray?.state === "blocked"
              ? ("shaded" as const)
              : ("clear" as const),
        blockerReference:
          ray?.state === "blocked" ? `terrain-triangle-${ray.triangleIndex}` : undefined,
        blockingPoint: ray?.state === "blocked" ? ray.blockingPoint : undefined,
        warning:
          result.state === "not-evaluated"
            ? `Receiver is ${result.coverage.state}.`
            : ray?.state === "not-evaluated"
              ? ray.reason
              : undefined,
      };
    }),
    warnings: unavailable.length
      ? ["Terrain continuity or receiver coverage is insufficient."]
      : [],
    limitations: ["Terrain blocking is geometric occurrence, not irradiance or energy loss."],
    ruleVersion: SHADING_RULE_VERSION,
  };
}

const cellKey = (x: number, y: number) => `${x}:${y}`;
export function buildTerrainSpatialIndex(mesh: TerrainMesh): TerrainSpatialIndex {
  if (mesh.triangles.length > SHADING_LIMITS.maxTerrainTriangles)
    throw new Error("Terrain triangle limit exceeded.");
  if (!mesh.triangles.length) throw new Error("Terrain contains no triangles.");
  const xs = mesh.vertices.map((vertex) => finite(vertex.x, "Terrain x"));
  const ys = mesh.vertices.map((vertex) => finite(vertex.y, "Terrain y"));
  mesh.vertices.forEach((vertex) => finite(vertex.z, "Terrain z"));
  const originX = Math.min(...xs),
    originY = Math.min(...ys),
    span = Math.max(Math.max(...xs) - originX, Math.max(...ys) - originY, 1);
  const cellSizeMeters = Math.max(
    0.01,
    span / Math.max(1, Math.ceil(Math.sqrt(mesh.triangles.length))),
  );
  const mutable = new Map<string, number[]>();
  const triangleBounds = mesh.triangles.map((triangle, triangleIndex) => {
    if (
      triangle.length !== 3 ||
      new Set(triangle).size !== 3 ||
      triangle.some((value) => !Number.isInteger(value) || !mesh.vertices[value])
    )
      throw new Error(`Terrain triangle ${triangleIndex} is invalid.`);
    const vertices = triangle.map((value) => mesh.vertices[value]);
    const area =
      (vertices[1].x - vertices[0].x) * (vertices[2].y - vertices[0].y) -
      (vertices[2].x - vertices[0].x) * (vertices[1].y - vertices[0].y);
    if (Math.abs(area) < 1e-10) throw new Error(`Terrain triangle ${triangleIndex} is degenerate.`);
    const bounds = {
      minimumX: Math.min(...vertices.map((vertex) => vertex.x)),
      minimumY: Math.min(...vertices.map((vertex) => vertex.y)),
      maximumX: Math.max(...vertices.map((vertex) => vertex.x)),
      maximumY: Math.max(...vertices.map((vertex) => vertex.y)),
    };
    const minCellX = Math.floor((bounds.minimumX - originX) / cellSizeMeters);
    const maxCellX = Math.floor((bounds.maximumX - originX) / cellSizeMeters);
    const minCellY = Math.floor((bounds.minimumY - originY) / cellSizeMeters);
    const maxCellY = Math.floor((bounds.maximumY - originY) / cellSizeMeters);
    for (let x = minCellX; x <= maxCellX; x += 1)
      for (let y = minCellY; y <= maxCellY; y += 1) {
        const key = cellKey(x, y);
        const values = mutable.get(key) ?? [];
        if (values.length >= SHADING_LIMITS.maxTrianglesPerTerrainCell)
          throw new Error("Terrain cell triangle limit exceeded.");
        values.push(triangleIndex);
        mutable.set(key, values);
        if (mutable.size > SHADING_LIMITS.maxTerrainIndexCells)
          throw new Error("Terrain spatial-index cell limit exceeded.");
      }
    return bounds;
  });
  return {
    cellSizeMeters,
    originX,
    originY,
    cells: new Map([...mutable].map(([key, values]) => [key, Object.freeze([...values])])),
    triangleBounds,
  };
}

export function terrainCoverage(
  mesh: TerrainMesh,
  index: TerrainSpatialIndex,
  point: { x: number; y: number },
): TerrainCoverage {
  const cellX = Math.floor((point.x - index.originX) / index.cellSizeMeters);
  const cellY = Math.floor((point.y - index.originY) / index.cellSizeMeters);
  const candidates = index.cells.get(cellKey(cellX, cellY)) ?? [];
  for (const triangleIndex of candidates) {
    const [a, b, c] = mesh.triangles[triangleIndex].map((value) => mesh.vertices[value]);
    const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    const u = ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) / denominator;
    const v = ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) / denominator;
    const w = 1 - u - v;
    if (u >= -1e-10 && v >= -1e-10 && w >= -1e-10)
      return {
        state: "covered",
        triangleIndex,
        elevationMeters: u * a.z + v * b.z + w * c.z,
      };
  }
  return { state: candidates.length ? "no-data" : "outside-coverage" };
}

function queryTerrainCells(
  index: TerrainSpatialIndex,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
) {
  const length = Math.hypot(endX - startX, endY - startY);
  const steps = Math.ceil(length / index.cellSizeMeters);
  if (steps > SHADING_LIMITS.maxRayTraversalCells)
    throw new Error("Terrain ray traversal cell limit exceeded.");
  const candidates = new Set<number>();
  for (let step = 0; step <= steps; step += 1) {
    const ratio = steps ? step / steps : 0;
    const x = Math.floor((startX + (endX - startX) * ratio - index.originX) / index.cellSizeMeters);
    const y = Math.floor((startY + (endY - startY) * ratio - index.originY) / index.cellSizeMeters);
    for (const triangle of index.cells.get(cellKey(x, y)) ?? []) {
      candidates.add(triangle);
      if (candidates.size > SHADING_LIMITS.maxRayCandidateTriangles)
        throw new Error("Terrain ray candidate limit exceeded.");
    }
  }
  return [...candidates].sort((a, b) => a - b);
}

export function validateObstruction(obstruction: Obstruction) {
  if (!obstruction.id || !obstruction.source.trim() || !obstruction.provenance.trim())
    throw new Error("Obstruction identity, source, and provenance are required.");
  if (!Number.isFinite(obstruction.heightMeters) || obstruction.heightMeters <= 0)
    throw new Error("Obstruction height must be a positive finite value.");
  if (
    obstruction.footprint.length < 2 ||
    obstruction.footprint.length > SHADING_LIMITS.maxObstructionVertices
  )
    throw new Error("Obstruction footprint has an invalid vertex count.");
  obstruction.footprint.forEach((point) => {
    finite(point.x, "Obstruction x");
    finite(point.y, "Obstruction y");
  });
  if (!Number.isFinite(obstruction.baseElevationMeters))
    throw new Error("Obstruction base elevation must be finite.");
  if (!Number.isFinite(obstruction.uncertaintyMeters) || obstruction.uncertaintyMeters < 0)
    throw new Error("Obstruction uncertainty must be finite and non-negative.");
  if (!["manual", "reviewed-drawing"].includes(obstruction.creationMethod))
    throw new Error("Obstruction creation method is invalid.");
  if (!Array.isArray(obstruction.lifecycleHistory))
    throw new Error("Obstruction lifecycle history is required.");
}

export function createObstruction(
  obstruction: Omit<Obstruction, "lifecycleHistory" | "reviewStatus">,
): Obstruction {
  const created: Obstruction = {
    ...structuredClone(obstruction),
    reviewStatus: "draft",
    lifecycleHistory: [{ sequence: 1, action: "created", detail: "Explicit obstruction created." }],
  };
  validateObstruction(created);
  return created;
}

function obstructionTransition(
  obstruction: Obstruction,
  reviewStatus: Obstruction["reviewStatus"],
  action: Obstruction["lifecycleHistory"][number]["action"],
  detail: string,
) {
  const next = {
    ...structuredClone(obstruction),
    reviewStatus,
    lifecycleHistory: [
      ...obstruction.lifecycleHistory,
      { sequence: obstruction.lifecycleHistory.length + 1, action, detail },
    ],
  };
  validateObstruction(next);
  return next;
}

export function editObstruction(
  obstruction: Obstruction,
  changes: Partial<
    Pick<
      Obstruction,
      | "footprint"
      | "heightMeters"
      | "baseElevationMeters"
      | "classification"
      | "source"
      | "notes"
      | "uncertaintyMeters"
      | "provenance"
    >
  >,
) {
  return obstructionTransition(
    { ...structuredClone(obstruction), ...structuredClone(changes) },
    "draft",
    "edited",
    "Authoritative obstruction edit; shading results are stale.",
  );
}

export function reviewObstruction(obstruction: Obstruction) {
  return obstructionTransition(obstruction, "reviewed", "reviewed", "Engineer marked reviewed.");
}
export function excludeObstruction(obstruction: Obstruction) {
  return obstructionTransition(obstruction, "excluded", "excluded", "Excluded from calculation.");
}
export function restoreObstruction(obstruction: Obstruction) {
  return obstructionTransition(
    obstruction,
    "restored",
    "restored",
    "Restored as non-authoritative pending renewed review.",
  );
}
export function duplicateObstruction(obstruction: Obstruction, existingIds: readonly string[]) {
  let suffix = 1;
  while (existingIds.includes(`${obstruction.id}-copy-${suffix}`)) suffix += 1;
  const duplicate = {
    ...structuredClone(obstruction),
    id: `${obstruction.id}-copy-${suffix}`,
    reviewStatus: "draft" as const,
    lifecycleHistory: [
      {
        sequence: 1,
        action: "duplicated" as const,
        detail: `Duplicated from ${obstruction.id}; explicit review required.`,
      },
    ],
  };
  validateObstruction(duplicate);
  return duplicate;
}

export function evaluateObstruction(
  obstruction: Obstruction,
  receiver: GeneratedTable,
  sun: SunPosition,
  northDegrees = 0,
): ShadingFinding {
  validateObstruction(obstruction);
  const samples = tableSamples(receiver),
    shadow = projectShadow(obstruction.footprint, obstruction.heightMeters, sun, northDegrees);
  const shaded = shadow.length
    ? samples.filter((sample) => pointInPolygon(sample, shadow)).length
    : 0;
  return {
    id: `obstruction:${obstruction.id}:${receiver.id}:${sun.timestamp}`,
    sourceObjectId: obstruction.id,
    receiverObjectId: receiver.id,
    domain: "obstruction",
    state: sun.belowHorizon
      ? "below-horizon"
      : shaded === 0
        ? "clear"
        : shaded === samples.length
          ? "fully-shaded"
          : "partially-shaded",
    sunPosition: sun,
    timestamp: sun.timestamp,
    calculationMethod: "conservative vertical envelope shadow extrusion",
    sampleCount: samples.length,
    shadedCount: shaded,
    geometricShadedFraction: shaded / samples.length,
    blockingReference: shaded ? obstruction.id : undefined,
    shadowPolygon: shadow,
    sampleEvidence: samples.map((sample, index) => ({
      tableId: receiver.id,
      sampleId: `${receiver.id}:obstruction:${obstruction.id}:${index}`,
      sampleMethod: "footprint-corners-and-centre",
      sampleMethodVersion: "re7a-table-sampling-1.0",
      point: sample,
      receiverElevationMeters: tableElevation(receiver),
      domain: "obstruction",
      state: pointInPolygon(sample, shadow) ? "shaded" : "clear",
      blockerReference: pointInPolygon(sample, shadow) ? obstruction.id : undefined,
    })),
    warnings: [],
    limitations: ["Envelope geometry does not model foliage transmittance or irradiance."],
    ruleVersion: SHADING_RULE_VERSION,
  };
}

export function buildObstructionShadowIndex(
  obstructions: readonly Obstruction[],
  sun: SunPosition,
  northDegrees = 0,
): ObstructionShadowIndex {
  if (obstructions.length > SHADING_LIMITS.maxObstructions)
    throw new Error("Obstruction limit exceeded.");
  const active = [...obstructions]
    .filter((item) => item.reviewStatus === "reviewed")
    .sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(active.map((item) => item.id)).size !== active.length)
    throw new Error("Duplicate active obstruction ID.");
  active.forEach(validateObstruction);
  const shadows = active.map((item) => ({
    item,
    polygon: projectShadow(item.footprint, item.heightMeters, sun, northDegrees),
  }));
  const points = shadows.flatMap((item) => item.polygon);
  const originX = points.length ? Math.min(...points.map((point) => point.x)) : 0;
  const originY = points.length ? Math.min(...points.map((point) => point.y)) : 0;
  const span = points.length
    ? Math.max(
        Math.max(...points.map((point) => point.x)) - originX,
        Math.max(...points.map((point) => point.y)) - originY,
        1,
      )
    : 1;
  const cellSizeMeters = Math.max(0.01, span / Math.max(1, Math.ceil(Math.sqrt(active.length))));
  const cells = new Map<string, string[]>();
  for (const { item, polygon } of shadows) {
    if (!polygon.length) continue;
    const bounds = polygonBounds(polygon);
    for (
      let x = Math.floor((bounds.minX - originX) / cellSizeMeters);
      x <= Math.floor((bounds.maxX - originX) / cellSizeMeters);
      x += 1
    )
      for (
        let y = Math.floor((bounds.minY - originY) / cellSizeMeters);
        y <= Math.floor((bounds.maxY - originY) / cellSizeMeters);
        y += 1
      ) {
        const key = cellKey(x, y),
          values = cells.get(key) ?? [];
        if (values.length >= SHADING_LIMITS.maxObstructionsPerCell)
          throw new Error("Obstruction spatial-index cell limit exceeded.");
        values.push(item.id);
        cells.set(key, values);
        if (cells.size > SHADING_LIMITS.maxObstructionIndexCells)
          throw new Error("Obstruction spatial-index cell-count limit exceeded.");
      }
  }
  return {
    cellSizeMeters,
    originX,
    originY,
    cells: new Map([...cells].map(([key, ids]) => [key, Object.freeze([...ids].sort())])),
    obstructions: new Map(active.map((item) => [item.id, item])),
  };
}

export function queryObstructionShadowIndex(
  index: ObstructionShadowIndex,
  receiver: GeneratedTable,
) {
  validateTableFootprint(receiver);
  const bounds = polygonBounds(receiver.footprint.vertices),
    ids = new Set<string>();
  for (
    let x = Math.floor((bounds.minX - index.originX) / index.cellSizeMeters);
    x <= Math.floor((bounds.maxX - index.originX) / index.cellSizeMeters);
    x += 1
  )
    for (
      let y = Math.floor((bounds.minY - index.originY) / index.cellSizeMeters);
      y <= Math.floor((bounds.maxY - index.originY) / index.cellSizeMeters);
      y += 1
    )
      for (const id of index.cells.get(cellKey(x, y)) ?? []) {
        ids.add(id);
        if (ids.size > SHADING_LIMITS.maxObstructionCandidates)
          throw new Error("Obstruction shadow candidate limit exceeded.");
      }
  return [...ids].sort().map((id) => index.obstructions.get(id)!);
}

export function evaluateIndexedObstructions(
  index: ObstructionShadowIndex,
  receiver: GeneratedTable,
  sun: SunPosition,
  northDegrees = 0,
  cancelled: () => boolean = () => false,
) {
  return queryObstructionShadowIndex(index, receiver).map((obstruction) => {
    if (cancelled()) throw new Error("Obstruction shading cancelled.");
    return evaluateObstruction(obstruction, receiver, sun, northDegrees);
  });
}

export function evaluateHorizon(
  points: readonly HorizonPoint[],
  receiverId: string,
  sun: SunPosition,
): ShadingFinding {
  const value = horizonAt(points, sun.azimuthDegrees),
    blocked = value === undefined ? false : sun.elevationDegrees <= value;
  return {
    id: `horizon:${receiverId}:${sun.timestamp}`,
    sourceObjectId: "reviewed-horizon",
    receiverObjectId: receiverId,
    domain: "horizon-profile",
    state: sun.belowHorizon
      ? "below-horizon"
      : value === undefined
        ? "not-evaluated"
        : blocked
          ? "shaded"
          : "clear",
    sunPosition: sun,
    timestamp: sun.timestamp,
    calculationMethod: "linear reviewed-profile interpolation with azimuth wraparound",
    sampleCount: 1,
    shadedCount: blocked ? 1 : 0,
    geometricShadedFraction: value === undefined ? undefined : blocked ? 1 : 0,
    blockingReference: blocked ? "reviewed-horizon" : undefined,
    warnings: value === undefined ? ["Horizon coverage is insufficient for this azimuth."] : [],
    limitations: ["No remote or inferred horizon points are used."],
    ruleVersion: SHADING_RULE_VERSION,
  };
}

export function combineDomainFindings(
  receiverId: string,
  sun: SunPosition,
  findings: readonly ShadingFinding[],
): ShadingFinding {
  const applicable = findings.filter(
    (finding) => finding.receiverObjectId === receiverId && finding.domain !== "combined",
  );
  const state = applicable.some((finding) => finding.state === "invalid")
    ? "invalid"
    : sun.belowHorizon || applicable.some((finding) => finding.state === "below-horizon")
      ? "below-horizon"
      : applicable.some((finding) =>
            ["blocked", "fully-shaded", "partially-shaded", "shaded"].includes(finding.state),
          )
        ? "shaded"
        : !applicable.length || applicable.some((finding) => finding.state === "not-evaluated")
          ? "not-evaluated"
          : "clear";
  const sampleCount = applicable.reduce((sum, finding) => sum + finding.sampleCount, 0);
  const shadedCount = applicable.reduce((sum, finding) => sum + finding.shadedCount, 0);
  return {
    id: `combined:${receiverId}:${sun.timestamp}`,
    sourceObjectId: "combined-geometric-domains",
    receiverObjectId: receiverId,
    domain: "combined",
    state,
    sunPosition: sun,
    timestamp: sun.timestamp,
    calculationMethod:
      "deterministic precedence: invalid, below horizon, geometric blocker, unavailable domain, clear",
    sampleCount,
    shadedCount,
    clearCount: applicable.reduce(
      (sum, finding) => sum + Math.max(0, finding.sampleCount - finding.shadedCount),
      0,
    ),
    notEvaluatedCount: applicable.filter((finding) => finding.state === "not-evaluated").length,
    invalidCount: applicable.filter((finding) => finding.state === "invalid").length,
    geometricShadedFraction:
      sampleCount && state !== "not-evaluated" && state !== "invalid"
        ? shadedCount / sampleCount
        : undefined,
    warnings:
      state === "not-evaluated"
        ? ["At least one enabled geometric domain could not be evaluated."]
        : [],
    limitations: [
      "Combined state preserves individual domain findings and is not an energy-loss result.",
    ],
    ruleVersion: SHADING_RULE_VERSION,
  };
}

export function summarizeTimeRange(
  findings: readonly ShadingFinding[],
  requestedTimestamps: number,
): TimeRangeSummary {
  const combined = findings.filter((finding) => finding.domain === "combined");
  const timestamps = [...new Set(combined.map((finding) => finding.timestamp))].sort();
  const timestampStates = timestamps.map((timestamp) =>
    combined.filter((finding) => finding.timestamp === timestamp).map((finding) => finding.state),
  );
  const isShaded = (state: string) =>
    ["shaded", "partially-shaded", "fully-shaded", "blocked"].includes(state);
  const tableIds = [...new Set(combined.map((finding) => finding.receiverObjectId))].sort();
  const domains = ["row-to-row", "terrain", "horizon-profile", "obstruction", "combined"] as const;
  return {
    requestedTimestamps,
    evaluatedTimestamps: timestamps.length,
    belowHorizonTimestamps: timestampStates.filter((states) =>
      states.some((state) => state === "below-horizon"),
    ).length,
    clearTimestamps: timestampStates.filter((states) => states.every((state) => state === "clear"))
      .length,
    shadedTimestamps: timestampStates.filter((states) => states.some(isShaded)).length,
    notEvaluatedTimestamps: timestampStates.filter((states) =>
      states.some((state) => state === "not-evaluated"),
    ).length,
    invalidTimestamps: timestampStates.filter((states) =>
      states.some((state) => state === "invalid"),
    ).length,
    domainOccurrences: domains.map((domain) => ({
      domain,
      count: findings.filter((finding) => finding.domain === domain && isShaded(finding.state))
        .length,
    })),
    tables: tableIds.map((tableId) => {
      const values = combined.filter((finding) => finding.receiverObjectId === tableId);
      return {
        tableId,
        evaluated: values.length,
        clear: values.filter((finding) => finding.state === "clear").length,
        shaded: values.filter((finding) => isShaded(finding.state)).length,
        notEvaluated: values.filter((finding) => finding.state === "not-evaluated").length,
        invalid: values.filter((finding) => finding.state === "invalid").length,
      };
    }),
    warnings:
      timestamps.length !== requestedTimestamps
        ? ["The evaluated timestamp total differs from the requested interval."]
        : [],
    limitations: [
      "Counts describe geometric shading occurrence without irradiance weighting or annual extrapolation.",
    ],
  };
}

export function transitionShadingReview(
  current: ReviewStatus,
  target: ReviewStatus,
  history: readonly ReviewTransition[],
  blockers: readonly string[],
  timestamp: string,
) {
  if (!Number.isFinite(new Date(timestamp).getTime()))
    throw new Error("Review timestamp is invalid.");
  const allowed: Record<ReviewStatus, readonly ReviewStatus[]> = {
    draft: ["calculated-review-required", "invalid", "not-evaluated", "excluded"],
    "calculated-review-required": [
      "valid-with-warnings",
      "reviewed",
      "invalid",
      "not-evaluated",
      "excluded",
    ],
    "valid-with-warnings": ["reviewed", "invalid", "not-evaluated", "excluded"],
    invalid: ["draft", "excluded"],
    "not-evaluated": ["draft", "excluded"],
    reviewed: ["approved-for-preliminary-draflio-workflow", "draft", "excluded"],
    "approved-for-preliminary-draflio-workflow": ["draft", "excluded"],
    excluded: ["restored"],
    restored: ["draft", "excluded"],
  };
  if (!allowed[current].includes(target))
    throw new Error(`Review transition ${current} to ${target} is not permitted.`);
  if (["reviewed", "approved-for-preliminary-draflio-workflow"].includes(target) && blockers.length)
    throw new Error(`Review transition is blocked: ${blockers.join("; ")}`);
  return [
    ...history,
    {
      sequence: history.length + 1,
      from: current,
      to: target,
      action: `Engineer changed shading review from ${current} to ${target}.`,
      timestamp,
    },
  ];
}

export function shadingReviewBlockers(
  findings: readonly ShadingFinding[],
  stale: boolean,
  cancelled: boolean,
  context: {
    workerValidationFailed?: boolean;
    sourceUnreviewed?: boolean;
    layoutAuthoritative?: boolean;
    terrainVerified?: boolean;
    obstructionReviewInvalid?: boolean;
    invalidGeometry?: boolean;
    inputsChanged?: boolean;
    exportValidationFailed?: boolean;
  } = {},
) {
  const blockers: string[] = [];
  if (stale || !findings.length) blockers.push("Calculated findings are stale or absent.");
  if (cancelled) blockers.push("The latest calculation was cancelled.");
  if (context.workerValidationFailed) blockers.push("Worker success validation failed.");
  if (context.sourceUnreviewed) blockers.push("A required source record is unreviewed.");
  if (context.layoutAuthoritative === false)
    blockers.push("The imported layout is not authoritative.");
  if (context.terrainVerified === false) blockers.push("Required terrain is not verified.");
  if (context.obstructionReviewInvalid)
    blockers.push("An active obstruction is not properly reviewed.");
  if (findings.some((finding) => finding.state === "invalid"))
    blockers.push("At least one enabled domain is invalid.");
  if (findings.some((finding) => finding.state === "not-evaluated"))
    blockers.push("Required geometric coverage is not evaluated.");
  if (context.invalidGeometry) blockers.push("Unresolved invalid geometry remains.");
  if (context.inputsChanged) blockers.push("Authoritative inputs changed after calculation.");
  if (context.exportValidationFailed) blockers.push("Required export validation failed.");
  return blockers;
}
